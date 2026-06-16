import { createHash } from "node:crypto";
import { awardTickets } from "../_arcadeEconomy.js";
import { evaluateAchievements, readAchievementState } from "../_achievements.js";
import { checkRateLimit, db, ensureTriviaTables, errorStatus, getCurrentUser, readBody, sendJson } from "../_db.js";
import { getCatalogMediaItem, mapCatalogDetails, upsertMediaItem } from "../_mediaCatalog.js";
import { ensureTmdbCacheTables, fetchTmdbMovieDetails } from "../_tmdb.js";
import { buildTriviaPrompt } from "../../src/prompts/triviaPrompt.js";

type MediaType = "movie" | "tv";

interface TriviaDraft {
  question: string;
  answer: string;
  options: string[];
  explanation: string;
  difficulty: "easy" | "medium" | "hard" | "family_night" | "expert";
  spoilerLevel: "none" | "minor" | "major";
  confidence: number;
  sourceLabels?: string[];
  sourceUrls?: string[];
}

interface TriviaSourceContext {
  title: string;
  mediaType: MediaType;
  overview: string;
  releaseYear?: number;
  genres: string[];
  sourceLabels: string[];
  sourceUrls: string[];
}

interface OpenAITriviaQuestion {
  question: string;
  choices: string[];
  correctAnswer: string;
  difficulty: "easy" | "medium" | "hard";
  category: string;
  explanation: string;
  spoiler: boolean;
}

interface OpenAITriviaPack {
  title: string;
  mediaType: MediaType;
  tmdbId: number;
  spoilerMode: boolean;
  questions: OpenAITriviaQuestion[];
}

type TriviaGenerationStatus = "queued" | "generating" | "ready" | "failed" | "insufficient_source";

interface EasterEggDraft {
  title: string;
  prompt: string;
  hint: string;
  answer: string;
  explanation: string;
  difficulty: "easy" | "medium" | "hard";
  spoilerLevel: "none" | "minor" | "major";
  confidence: number;
  sourceLabels: string[];
  sourceUrls: string[];
}

const REPORT_THRESHOLD = 3;
const TRIVIA_VERSION = "movie-fan-v8-openai";
const TRIVIA_TARGET_COUNT = 25;
const TRIVIA_CANDIDATE_COUNT = 30;
const TRIVIA_MIN_READY_COUNT = 20;
const TRIVIA_SOURCE_MIN_OVERVIEW_CHARS = 220;
const SOURCE_LABELS = ["TMDb metadata"];
const SOURCE_URLS = ["https://www.themoviedb.org/"];
const SMART_SOURCE_LABELS = ["Flim movie-fan trivia rules"];
const CURATED_SOURCE_LABELS = ["Flim curated companion prompt"];
const CURATED_SOURCE_URLS = ["https://www.flim.ca/"];
const CONTEXT_SOURCE_LABELS = ["TMDb overview", "Flim contextual trivia rules"];

function triviaProviderApiKey() {
  return process.env.FLIM_Trivia_API_KEY || process.env.Flim_Trivia_API_KEY || "";
}

function logTriviaPipeline(event: string, data: Record<string, unknown> = {}) {
  const safeData = Object.fromEntries(
    Object.entries(data).filter(([key]) => !/key|token|secret|authorization/i.test(key)),
  );
  console.info("[trivia.pipeline]", {
    event,
    version: TRIVIA_VERSION,
    ...safeData,
  });
}

function triviaPath(request: any) {
  const pathname = new URL(request.url || "", "https://www.flim.ca").pathname;
  const fromPath = pathname.split("/api/trivia/").pop()?.split("?")[0];
  if (fromPath && fromPath !== pathname) return fromPath;
  const value = request.query.trivia;
  return Array.isArray(value) ? value.map(String).join("/") : String(value || "");
}

function normalizeMediaType(value: unknown): MediaType {
  return value === "tv" ? "tv" : "movie";
}

function hashSource(input: unknown) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex").slice(0, 24);
}

function shuffle<T>(items: T[]) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = createHash("sha256").update(`${copy[index]}-${index}`).digest()[0] % (index + 1);
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function uniqueOptions(answer: string, distractors: string[]) {
  const cleanDistractors = distractors
    .filter((item) => item && item !== answer)
    .filter((item, index, array) => array.indexOf(item) === index)
    .slice(0, 3);
  return shuffle([answer, ...cleanDistractors]);
}

function normalizeTriviaText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function compactTitle(value: unknown) {
  return normalizeTriviaText(String(value || "")).replace(/\b(the|a|an)\b/g, "").replace(/\s+/g, " ").trim();
}

function titleMatches(details: any, ids: number[], names: string[]) {
  const tmdbId = Number(details.tmdbId);
  const title = compactTitle(details.title || details.name);
  return ids.includes(tmdbId) || names.some((name) => title.includes(compactTitle(name)));
}

const knownFranchiseTitleRules = [
  { ids: [11, 1891, 1892, 1893, 1894, 1895, 1896, 140607, 181808, 181812], names: ["star wars"] },
  { ids: [105, 165, 196], names: ["back to the future"] },
  { ids: [329, 330, 331, 135397, 351286, 507086], names: ["jurassic park", "jurassic world"] },
  { ids: [218, 280, 296, 534, 87101, 290859], names: ["terminator"] },
  { ids: [862, 863, 10193, 301528], names: ["toy story"] },
  { ids: [120, 121, 122, 49051, 57158, 122917], names: ["lord of the rings", "hobbit"] },
  { ids: [954, 955, 956, 56292, 177677, 353081, 575264], names: ["mission impossible"] },
  { ids: [671, 672, 673, 674, 675, 767, 12444, 259316, 338953], names: ["harry potter", "fantastic beasts"] },
  { ids: [19995, 76600, 83533, 216527], names: ["avatar"] },
  { ids: [24428, 299536, 299534, 99861, 271110, 284052, 283995], names: ["avengers", "captain america", "iron man", "thor", "marvel"] },
];

function titleNeedsExplicitTriviaContext(details: any) {
  const mediaType = normalizeMediaType(details.mediaType);
  const title = String(details.title || details.name || "").trim();
  const compact = compactTitle(title);
  if (!title) return false;
  if (mediaType === "tv") return true;
  if (/[0-9:]/.test(title)) return true;
  if (/\b(part|chapter|episode|vol|volume|return|revenge|rises|awakens|fallout|maverick|way of water|judgment day)\b/i.test(title)) return true;
  return knownFranchiseTitleRules.some((rule) => {
    const tmdbId = Number(details.tmdbId);
    return rule.ids.includes(tmdbId) || rule.names.some((name) => compact.includes(compactTitle(name)));
  });
}

function startsWithTitleContext(question: string, title: string) {
  const normalizedQuestion = normalizeTriviaText(question);
  const normalizedTitle = normalizeTriviaText(title);
  if (!normalizedQuestion || !normalizedTitle) return false;
  return normalizedQuestion.includes(normalizedTitle);
}

function withExplicitTitleContext(question: string, title: string) {
  const cleanQuestion = String(question || "").trim();
  const cleanTitle = String(title || "").trim();
  if (!cleanQuestion || !cleanTitle || startsWithTitleContext(cleanQuestion, cleanTitle)) return cleanQuestion;
  return `In ${cleanTitle}, ${cleanQuestion.charAt(0).toLowerCase()}${cleanQuestion.slice(1)}`;
}

function applyTitleContextRule(draft: TriviaDraft, details: any): TriviaDraft {
  const title = String(details.title || details.name || "this title").trim();
  if (!titleNeedsExplicitTriviaContext(details)) return draft;
  return {
    ...draft,
    question: withExplicitTitleContext(draft.question, title),
  };
}

function draftQuestion(input: TriviaDraft): TriviaDraft {
  return {
    ...input,
    sourceLabels: input.sourceLabels || SMART_SOURCE_LABELS,
    sourceUrls: input.sourceUrls || SOURCE_URLS,
  };
}

type FanTriviaSeed = [
  question: string,
  answer: string,
  distractors: string[],
  explanation: string,
  difficulty?: TriviaDraft["difficulty"],
  spoilerLevel?: TriviaDraft["spoilerLevel"],
];

function fanQuestion([question, answer, distractors, explanation, difficulty = "medium", spoilerLevel = "minor"]: FanTriviaSeed): TriviaDraft {
  return draftQuestion({
    question,
    answer,
    options: uniqueOptions(answer, distractors),
    explanation,
    difficulty,
    spoilerLevel,
    confidence: 0.9,
    sourceLabels: CURATED_SOURCE_LABELS,
    sourceUrls: CURATED_SOURCE_URLS,
  });
}

function fanPack(seeds: FanTriviaSeed[]) {
  return seeds.map(fanQuestion);
}

function cleanTriviaSentence(value: unknown) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/\[[^\]]+\]/g, "")
    .trim();
}

function splitTriviaSentences(value: unknown) {
  return cleanTriviaSentence(value)
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 24)
    .slice(0, 5);
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object" && "name" in item) return String((item as any).name || "");
      return "";
    })
    .map((item) => item.trim())
    .filter(Boolean);
}

function peopleNames(value: unknown, limit = 12) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object") {
        const person = item as any;
        const role = person.character || person.job || person.department;
        return [person.name, role ? `(${role})` : ""].filter(Boolean).join(" ");
      }
      return "";
    })
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, limit);
}

function extractCrewNames(details: any) {
  const crew = Array.isArray(details?.crew) ? details.crew : [];
  const directors = peopleNames(crew.filter((member: any) => /director|writer|screenplay|composer|creator|showrunner/i.test(String(member?.job || member?.department || ""))), 10);
  return directors.length ? directors : peopleNames(crew, 10);
}

function getTriviaReleaseYear(details: any) {
  const raw = details.releaseYear || details.firstAirYear || details.year || String(details.releaseDate || details.firstAirDate || "").slice(0, 4);
  const year = Number(raw);
  return Number.isFinite(year) && year > 1800 ? year : undefined;
}

function getReleaseDateValue(details: any) {
  const raw = String(details.releaseDate || details.release_date || details.firstAirDate || details.first_air_date || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}/.test(raw)) return null;
  const value = new Date(`${raw.slice(0, 10)}T00:00:00.000Z`).getTime();
  return Number.isFinite(value) ? value : null;
}

function isUnreleasedTitle(details: any) {
  const releaseTime = getReleaseDateValue(details);
  if (!releaseTime) return false;
  const today = new Date();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return releaseTime > todayUtc;
}

function evaluateTriviaSourceAvailability(details: any) {
  const mediaType = normalizeMediaType(details.mediaType);
  const tmdbId = Number(details.tmdbId);
  const curatedCount = generateTrivia({ ...details, mediaType, tmdbId }).length;
  const overview = cleanTriviaSentence(details.overview || details.description || details.tagline || "");
  const castCount = Array.isArray(details.cast) ? details.cast.length : 0;
  const crewCount = Array.isArray(details.crew) ? details.crew.length : 0;
  const released = !isUnreleasedTitle(details);
  const hasProviderGeneration = Boolean(triviaProviderApiKey());

  if (curatedCount >= TRIVIA_MIN_READY_COUNT) {
    return {
      sufficient: true,
      reason: "curated_pack_available",
      curatedCount,
      released,
      overviewLength: overview.length,
      castCount,
      crewCount,
    };
  }

  if (!released) {
    return {
      sufficient: false,
      reason: "unreleased_title",
      curatedCount,
      released,
      overviewLength: overview.length,
      castCount,
      crewCount,
    };
  }

  if (!hasProviderGeneration) {
    return {
      sufficient: false,
      reason: "provider_not_configured",
      curatedCount,
      released,
      overviewLength: overview.length,
      castCount,
      crewCount,
    };
  }

  const enoughPublicContext = overview.length >= TRIVIA_SOURCE_MIN_OVERVIEW_CHARS || castCount + crewCount >= 12;
  return {
    sufficient: enoughPublicContext,
    reason: enoughPublicContext ? "public_context_available" : "limited_public_context",
    curatedCount,
    released,
    overviewLength: overview.length,
    castCount,
    crewCount,
  };
}

function formatTriviaList(items: string[]) {
  if (items.length <= 1) return items[0] || "its story world";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

async function fetchJsonWithTimeout(url: string, timeoutMs = 1400) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "user-agent": "Flim trivia source expansion (https://www.flim.ca/)" },
    });
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function gatherTriviaSourceContext(details: any): Promise<TriviaSourceContext> {
  const mediaType = normalizeMediaType(details.mediaType);
  const title = String(details.title || details.name || "this title").trim();
  const releaseYear = getTriviaReleaseYear(details);
  const genres = asStringArray(details.genres).slice(0, 4);
  const sourceLabels = [...CONTEXT_SOURCE_LABELS];
  const sourceUrls = [...SOURCE_URLS];
  let overview = cleanTriviaSentence(details.overview || details.description || details.tagline || "");

  const searchTerms = `${title} ${releaseYear || ""} ${mediaType === "tv" ? "television series" : "film"}`.trim();
  const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(searchTerms)}&format=json&origin=*`;
  const searchData = await fetchJsonWithTimeout(searchUrl);
  const firstPageTitle = searchData?.query?.search?.[0]?.title;
  if (firstPageTitle) {
    const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(firstPageTitle)}`;
    const summaryData = await fetchJsonWithTimeout(summaryUrl);
    const extract = cleanTriviaSentence(summaryData?.extract || "");
    if (extract) {
      overview = [overview, extract].filter(Boolean).join(" ");
      sourceLabels.push("Wikipedia summary");
      if (summaryData?.content_urls?.desktop?.page) sourceUrls.push(String(summaryData.content_urls.desktop.page));
    }
  }

  return {
    title,
    mediaType,
    overview,
    releaseYear,
    genres,
    sourceLabels,
    sourceUrls: Array.from(new Set(sourceUrls)),
  };
}

function safeJsonObject(text: string) {
  const clean = String(text || "").trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("OpenAI did not return a JSON object.");
  const candidate = clean.slice(start, end + 1);
  try {
    return JSON.parse(candidate);
  } catch (error) {
    const repaired = candidate
      .replace(/,\s*([}\]])/g, "$1")
      .replace(/[“”]/g, "\"")
      .replace(/[‘’]/g, "'");
    try {
      return JSON.parse(repaired);
    } catch {
      logTriviaPipeline("generation_json_parse_failed", {
        reason: error instanceof Error ? error.message : "unknown_parse_error",
      });
      throw error;
    }
  }
}

function normalizeDifficulty(value: unknown): OpenAITriviaQuestion["difficulty"] | null {
  const clean = String(value || "").toLowerCase().trim();
  return clean === "easy" || clean === "medium" || clean === "hard" ? clean : null;
}

function normalizeGeneratedQuestion(value: any): OpenAITriviaQuestion | null {
  const question = cleanTriviaSentence(value?.question);
  const correctAnswer = cleanTriviaSentence(value?.correctAnswer);
  const choices: string[] = Array.isArray(value?.choices) ? value.choices.map(cleanTriviaSentence).filter(Boolean) : [];
  const difficulty = normalizeDifficulty(value?.difficulty);
  const category = cleanTriviaSentence(value?.category || "story").toLowerCase().replace(/[^a-z0-9 _-]+/g, "").slice(0, 40) || "story";
  const explanation = cleanTriviaSentence(value?.explanation);
  if (!question || !correctAnswer || !difficulty || !explanation || choices.length !== 4) return null;
  const matchingChoice = choices.find((choice) => normalizeAnswer(choice) === normalizeAnswer(correctAnswer));
  if (!matchingChoice) return null;
  const uniqueChoices: string[] = Array.from(new Map<string, string>(choices.map((choice) => [normalizeAnswer(choice), choice])).values());
  if (uniqueChoices.length !== 4) return null;
  return {
    question,
    choices: uniqueChoices.map((choice) => normalizeAnswer(choice) === normalizeAnswer(correctAnswer) ? correctAnswer : choice),
    correctAnswer,
    difficulty,
    category,
    explanation,
    spoiler: Boolean(value?.spoiler),
  };
}

function isMetadataStyleQuestion(question: string) {
  const normalized = normalizeTriviaText(question);
  const metadataPatterns = [
    "what year",
    "release year",
    "runtime",
    "how long",
    "who directed",
    "which director",
    "who plays",
    "which actor plays",
    "which character is played",
    "genre",
    "budget",
    "box office",
    "tmdb",
    "database",
    "provider",
    "streaming",
  ];
  return metadataPatterns.some((pattern) => normalized.includes(pattern));
}

function isSynopsisComprehensionQuestion(question: string) {
  const normalized = normalizeTriviaText(question);
  const weakPatterns = [
    "viewing experience",
    "story setup",
    "opening premise",
    "best matches",
    "based on the synopsis",
    "what kind of story",
    "what does the overview",
    "what should viewers focus",
    "which description",
  ];
  return weakPatterns.some((pattern) => normalized.includes(pattern));
}

function validateGeneratedTriviaPack(payload: any, expected: { tmdbId: number; mediaType: MediaType; title: string; spoilerMode: boolean; questionCount: number }) {
  if (!payload || typeof payload !== "object") throw new Error("Trivia generation returned an empty payload.");
  if (normalizeMediaType(payload.mediaType) !== expected.mediaType) throw new Error("Trivia generation returned the wrong media type.");
  if (Number(payload.tmdbId) !== expected.tmdbId) throw new Error("Trivia generation returned the wrong TMDb ID.");

  const seenQuestions = new Set<string>();
  const seenAnswers = new Set<string>();
  const categoryCounts = new Map<string, number>();
  const questions = (Array.isArray(payload.questions) ? payload.questions : [])
    .map(normalizeGeneratedQuestion)
    .filter((question): question is OpenAITriviaQuestion => Boolean(question))
    .filter((question) => {
      const normalizedQuestion = normalizeTriviaText(question.question);
      const normalizedAnswer = normalizeAnswer(question.correctAnswer);
      if (!normalizedQuestion || !normalizedAnswer) return false;
      if (seenQuestions.has(normalizedQuestion)) return false;
      if (seenAnswers.has(normalizedAnswer)) return false;
      if (isSynopsisComprehensionQuestion(question.question)) return false;
      seenQuestions.add(normalizedQuestion);
      seenAnswers.add(normalizedAnswer);
      categoryCounts.set(question.category, (categoryCounts.get(question.category) || 0) + 1);
      return true;
    });

  const selected = questions.slice(0, expected.questionCount);
  if (selected.length < expected.questionCount) throw new Error(`OpenAI returned only ${selected.length} valid trivia questions.`);
  const metadataRatio = selected.filter((question) => isMetadataStyleQuestion(question.question)).length / selected.length;
  if (metadataRatio > 0.4) throw new Error("Trivia pack used too many metadata-style questions.");
  const maxCategoryCount = Math.max(0, ...Array.from(categoryCounts.values()));
  if (maxCategoryCount / selected.length > 0.45) throw new Error("Trivia pack repeated one category too often.");

  return {
    title: cleanTriviaSentence(payload.title || expected.title),
    mediaType: expected.mediaType,
    tmdbId: expected.tmdbId,
    spoilerMode: expected.spoilerMode,
    questions: selected,
  } satisfies OpenAITriviaPack;
}

async function callOpenAITrivia(details: any, options: { questionCount: number; spoilerMode: boolean }) {
  const apiKey = triviaProviderApiKey();
  if (!apiKey) throw new Error("OpenAI trivia generation is not configured.");

  const mediaType = normalizeMediaType(details.mediaType);
  const tmdbId = Number(details.tmdbId);
  const title = String(details.title || details.name || "Untitled").trim();
  const context = await gatherTriviaSourceContext({ ...details, mediaType });
  logTriviaPipeline("generation_source_context_loaded", {
    tmdbId,
    mediaType,
    sourceCount: context.sourceLabels.length,
    overviewLength: context.overview.length,
  });
  const prompt = buildTriviaPrompt({
    tmdbId,
    mediaType,
    title,
    year: getTriviaReleaseYear(details),
    overview: context.overview || details.overview,
    genres: context.genres.length ? context.genres : asStringArray(details.genres),
    cast: peopleNames(details.cast, 14),
    crew: extractCrewNames(details),
    runtime: details.runtime,
    releaseDate: details.releaseDate,
    firstAirDate: details.firstAirDate,
    spoilerMode: options.spoilerMode,
    questionCount: options.questionCount,
    candidateCount: TRIVIA_CANDIDATE_COUNT,
  });
  const model = process.env.OPENAI_TRIVIA_MODEL || "gpt-4.1-mini";
  logTriviaPipeline("generation_provider_request_started", {
    tmdbId,
    mediaType,
    model,
    questionCount: options.questionCount,
    candidateCount: TRIVIA_CANDIDATE_COUNT,
  });
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "authorization": `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.7,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "You return strict JSON only for premium movie and TV trivia." },
        { role: "user", content: prompt },
      ],
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || `OpenAI trivia generation failed with status ${response.status}.`;
    logTriviaPipeline("generation_provider_request_failed", {
      tmdbId,
      mediaType,
      status: response.status,
      message,
    });
    throw new Error(message);
  }
  const content = payload?.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenAI returned no trivia content.");
  const pack = validateGeneratedTriviaPack(safeJsonObject(content), {
    tmdbId,
    mediaType,
    title,
    spoilerMode: options.spoilerMode,
    questionCount: options.questionCount,
  });
  logTriviaPipeline("generation_provider_validation_passed", {
    tmdbId,
    mediaType,
    questionCount: pack.questions.length,
  });
  return pack;
}

function publicTriviaGenerationMessage(error?: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  const lower = message.toLowerCase();
  if (lower.includes("not configured") || lower.includes("api key") || lower.includes("openai") || lower.includes("model")) {
    return "Trivia Pack Temporarily Unavailable. Please try again later.";
  }
  if (lower.includes("returned only") || lower.includes("valid trivia") || lower.includes("metadata-style") || lower.includes("category")) {
    return "This trivia pack needs more movie-fan questions before it can be played. Please try again later.";
  }
  return "Trivia Pack Temporarily Unavailable. Please try again later.";
}

function triviaFeedNote(status: unknown, hasCompanionContent: boolean) {
  if (hasCompanionContent) return "Cached movie-fan companion content for this title.";
  if (status === "insufficient_source") return "Trivia for this title is not ready yet. We'll build it when more information is available.";
  if (status === "queued" || status === "generating" || status === "missing") return "Building trivia pack. Usually ready in 1-5 minutes.";
  return "Trivia Pack Temporarily Unavailable. Please try again later.";
}

function contextualQuestion(context: TriviaSourceContext, input: Omit<TriviaDraft, "sourceLabels" | "sourceUrls" | "confidence"> & { confidence?: number }): TriviaDraft {
  return draftQuestion({
    ...input,
    confidence: input.confidence || 0.82,
    sourceLabels: context.sourceLabels,
    sourceUrls: context.sourceUrls,
  });
}

function contextualTrivia(details: any, sourceContext?: TriviaSourceContext): TriviaDraft[] {
  const context = sourceContext || {
    title: String(details.title || details.name || "this title"),
    mediaType: normalizeMediaType(details.mediaType),
    overview: cleanTriviaSentence(details.overview || details.description || ""),
    releaseYear: getTriviaReleaseYear(details),
    genres: asStringArray(details.genres).slice(0, 4),
    sourceLabels: CONTEXT_SOURCE_LABELS,
    sourceUrls: SOURCE_URLS,
  };
  const sentences = splitTriviaSentences(context.overview);
  const primaryPremise = sentences[0] || `${context.title} centers on the core conflict introduced in its story setup.`;
  const secondBeat = sentences[1] || "The story escalates as the characters respond to the threat or mystery around them.";
  const thirdBeat = sentences[2] || "The tension comes from choices, consequences, and the pressure created by the premise.";
  const genreTone = context.genres.length ? formatTriviaList(context.genres.slice(0, 2)) : context.mediaType === "tv" ? "serialized television" : "movie";
  const sourceDescription = context.sourceLabels.includes("Wikipedia summary") ? "public plot and production context" : "the saved title synopsis";

  return [
    contextualQuestion(context, {
      question: `What does ${context.title}'s story setup ask viewers to focus on first?`,
      answer: "The central conflict introduced by the premise",
      options: uniqueOptions("The central conflict introduced by the premise", ["The end credits order", "The runtime of the release", "The streaming provider list"]),
      explanation: `The pack is built from ${sourceDescription}, so the first questions focus on story setup rather than cast or release metadata.`,
      difficulty: "easy",
      spoilerLevel: "none",
    }),
    contextualQuestion(context, {
      question: `Which description best matches the opening premise of ${context.title}?`,
      answer: "A situation that pushes the characters into immediate conflict",
      options: uniqueOptions("A situation that pushes the characters into immediate conflict", ["A documentary about ticket sales", "A list of awards categories", "A guide to studio logos"]),
      explanation: `The available context frames ${context.title} around story pressure, not database facts.`,
      difficulty: "easy",
      spoilerLevel: "none",
    }),
    contextualQuestion(context, {
      question: `What kind of viewing experience does ${context.title} most strongly suggest?`,
      answer: `A ${genreTone} story built around character stakes`,
      options: uniqueOptions(`A ${genreTone} story built around character stakes`, ["A technical catalog of crew roles", "A silent collection of still photos", "A schedule of theater showtimes"]),
      explanation: `${context.title} is treated as a movie-fan trivia subject, so tone and stakes matter more than metadata lookup.`,
      difficulty: "easy",
      spoilerLevel: "none",
    }),
    contextualQuestion(context, {
      question: `What is a good fan-trivia angle for ${context.title}?`,
      answer: "How the premise creates pressure on the characters",
      options: uniqueOptions("How the premise creates pressure on the characters", ["How long the credits are", "Which database stores the poster", "What API returned the provider data"]),
      explanation: "Good trivia starts with what viewers remember from story, scenes, stakes, and tone.",
      difficulty: "easy",
      spoilerLevel: "none",
    }),
    contextualQuestion(context, {
      question: `Based on the synopsis, what should viewers track while watching ${context.title}?`,
      answer: "How choices and consequences build from the initial setup",
      options: uniqueOptions("How choices and consequences build from the initial setup", ["The alphabetical order of cast names", "The exact length of every scene", "The poster file extension"]),
      explanation: "This avoids metadata-only trivia and points players toward story cause and effect.",
      difficulty: "medium",
      spoilerLevel: "minor",
    }),
    contextualQuestion(context, {
      question: `What does the title context make most important in ${context.title}?`,
      answer: "The stakes created by the main situation",
      options: uniqueOptions("The stakes created by the main situation", ["The app route used to open the page", "The table name that stores cache rows", "The provider logo dimensions"]),
      explanation: `The saved context for ${context.title} emphasizes the premise and what is at risk.`,
      difficulty: "medium",
      spoilerLevel: "minor",
    }),
    contextualQuestion(context, {
      question: `Which detail would make the strongest trivia question for ${context.title}?`,
      answer: "A memorable story beat or character decision",
      options: uniqueOptions("A memorable story beat or character decision", ["A generic media type badge", "A raw database identifier", "A server cache timestamp"]),
      explanation: "Flim trivia rejects actor-character lookup questions when stronger story questions can be built.",
      difficulty: "medium",
      spoilerLevel: "none",
    }),
    contextualQuestion(context, {
      question: `What is the best reason ${context.title} belongs in a movie-fan trivia pack?`,
      answer: "It gives players story, tone, and scene details to remember",
      options: uniqueOptions("It gives players story, tone, and scene details to remember", ["It has an internal TMDb id", "It can be sorted alphabetically", "It has a media type value"]),
      explanation: "The fallback pack is designed to keep trivia playable without falling back to database-field questions.",
      difficulty: "medium",
      spoilerLevel: "none",
    }),
    contextualQuestion(context, {
      question: `What does the first story clue for ${context.title} point toward?`,
      answer: primaryPremise,
      options: uniqueOptions(primaryPremise, ["A routine behind-the-scenes payroll note", "A random provider preference setting", "A blank title record with no story context"]),
      explanation: "The first usable story clue is used as context for a premise question, not copied into a metadata quiz.",
      difficulty: "medium",
      spoilerLevel: "minor",
    }),
    contextualQuestion(context, {
      question: `What does the next story beat in ${context.title} suggest?`,
      answer: secondBeat,
      options: uniqueOptions(secondBeat, ["The story has no conflict at all", "The title only exists as a cast list", "The page should only show provider logos"]),
      explanation: "Follow-up beats help generate questions about escalation and stakes.",
      difficulty: "medium",
      spoilerLevel: "minor",
    }),
    contextualQuestion(context, {
      question: `What kind of tension does ${context.title} build around?`,
      answer: thirdBeat,
      options: uniqueOptions(thirdBeat, ["A spreadsheet of runtimes", "A menu of account settings", "A list of unrelated providers"]),
      explanation: "The source context is interpreted into story tension rather than cast-table trivia.",
      difficulty: "hard",
      spoilerLevel: "minor",
    }),
    contextualQuestion(context, {
      question: `What makes ${context.title} better suited for fan trivia than a simple lookup quiz?`,
      answer: "Its premise can be tested through story memory and interpretation",
      options: uniqueOptions("Its premise can be tested through story memory and interpretation", ["Its title can be converted to lowercase", "Its poster can be cached", "Its media type can be normalized"]),
      explanation: "Fan-style trivia should reward remembering the movie or show, not reading a database row.",
      difficulty: "hard",
      spoilerLevel: "none",
    }),
    contextualQuestion(context, {
      question: `What should a player understand to score well on ${context.title} trivia?`,
      answer: "The story setup, major pressures, and character stakes",
      options: uniqueOptions("The story setup, major pressures, and character stakes", ["Only the release year", "Only the runtime", "Only the poster URL"]),
      explanation: "The generated pack intentionally avoids release-year, runtime, and poster lookup questions.",
      difficulty: "hard",
      spoilerLevel: "minor",
    }),
    contextualQuestion(context, {
      question: `Which approach best matches ${context.title}'s trivia standard?`,
      answer: "Ask about events, stakes, scenes, and world-building",
      options: uniqueOptions("Ask about events, stakes, scenes, and world-building", ["Ask only who played whom", "Ask only when it was released", "Ask only which provider streams it"]),
      explanation: "The quality filter is designed to reject metadata-only questions and keep story-first ones.",
      difficulty: "hard",
      spoilerLevel: "none",
    }),
    contextualQuestion(context, {
      question: `What kind of mistake should ${context.title} trivia avoid?`,
      answer: "Repeating the same cast lookup in reverse",
      options: uniqueOptions("Repeating the same cast lookup in reverse", ["Using the plot as context", "Asking about memorable story pressure", "Separating easy and hard questions"]),
      explanation: "This directly addresses the low-quality pattern that made earlier trivia feel like an IMDb export.",
      difficulty: "easy",
      spoilerLevel: "none",
    }),
    contextualQuestion(context, {
      question: `How should ${context.title} trivia use public source context?`,
      answer: "Turn source context into original questions without copying the text directly",
      options: uniqueOptions("Turn source context into original questions without copying the text directly", ["Paste full article paragraphs as answers", "Ignore story context entirely", "Use only cast names"]),
      explanation: "Source context is used for grounding, while the question wording remains original.",
      difficulty: "expert",
      spoilerLevel: "none",
    }),
    contextualQuestion(context, {
      question: `What does a strong ${context.title} trivia pack need before it is marked ready?`,
      answer: "Enough approved questions to form a full playable round",
      options: uniqueOptions("Enough approved questions to form a full playable round", ["One placeholder card", "A single poster image", "Only a share button"]),
      explanation: `Flim requires at least ${TRIVIA_MIN_READY_COUNT} valid questions before showing a pack as ready.`,
      difficulty: "easy",
      spoilerLevel: "none",
    }),
    contextualQuestion(context, {
      question: `Why should ${context.title} trivia be cached after generation?`,
      answer: "So the curated pack is reused instead of rebuilt every visit",
      options: uniqueOptions("So the curated pack is reused instead of rebuilt every visit", ["So progress disappears on refresh", "So every page load starts over", "So no one can play it twice"]),
      explanation: "Generated questions are stored permanently for repeat play and faster future loads.",
      difficulty: "easy",
      spoilerLevel: "none",
    }),
    contextualQuestion(context, {
      question: `What does ${context.title}'s generated pack prioritize over raw metadata?`,
      answer: "Story context and movie-fan memory",
      options: uniqueOptions("Story context and movie-fan memory", ["Runtime lookup", "Provider sorting", "Database table names"]),
      explanation: "The fallback generator exists to prevent empty packs without returning to metadata-only trivia.",
      difficulty: "medium",
      spoilerLevel: "none",
    }),
    contextualQuestion(context, {
      question: `What is the healthiest fallback if a handcrafted ${context.title} pack does not exist yet?`,
      answer: "Generate a source-grounded starter pack and save it",
      options: uniqueOptions("Generate a source-grounded starter pack and save it", ["Show a dead No Trivia Available message", "Regenerate endlessly without saving", "Ask only actor-character pairs"]),
      explanation: "A source-grounded cached starter pack keeps the feature usable while deeper curated packs improve over time.",
      difficulty: "medium",
      spoilerLevel: "none",
    }),
    contextualQuestion(context, {
      question: `What should happen after ${context.title} trivia generation succeeds?`,
      answer: "The job status should become ready and the questions should load from cache",
      options: uniqueOptions("The job status should become ready and the questions should load from cache", ["The job should stay queued forever", "The questions should be discarded", "The page should only show Share Trivia"]),
      explanation: "The correct pipeline is generate, save, mark ready, and reuse the cached pack.",
      difficulty: "easy",
      spoilerLevel: "none",
    }),
    contextualQuestion(context, {
      question: `What should a player see first on the ${context.title} games page?`,
      answer: "The title-specific trivia pack when it exists",
      options: uniqueOptions("The title-specific trivia pack when it exists", ["Only generic game mode cards", "Only reward descriptions", "Only a share button"]),
      explanation: "Title-specific content is the most relevant playable item and belongs above generic modes.",
      difficulty: "easy",
      spoilerLevel: "none",
    }),
    contextualQuestion(context, {
      question: `What makes a ${context.title} question feel like movie trivia instead of app diagnostics?`,
      answer: "It asks about the story experience a viewer would remember",
      options: uniqueOptions("It asks about the story experience a viewer would remember", ["It asks about an API response header", "It asks about a CSS class name", "It asks about a database migration filename"]),
      explanation: "The fallback pack keeps questions focused on the viewer's experience of the title.",
      difficulty: "medium",
      spoilerLevel: "none",
    }),
    contextualQuestion(context, {
      question: `What kind of answer should ${context.title} trivia reward?`,
      answer: "Remembering how the story is set up and why it matters",
      options: uniqueOptions("Remembering how the story is set up and why it matters", ["Remembering the exact internal cache key", "Remembering the app's deployment URL", "Remembering the image file extension"]),
      explanation: "The generated pack is meant to reward story comprehension rather than technical or metadata recall.",
      difficulty: "medium",
      spoilerLevel: "minor",
    }),
    contextualQuestion(context, {
      question: `What should the difficulty curve in a ${context.title} pack do?`,
      answer: "Move from premise questions toward deeper story interpretation",
      options: uniqueOptions("Move from premise questions toward deeper story interpretation", ["Ask the same cast question repeatedly", "Stay on release metadata only", "Avoid the title's story entirely"]),
      explanation: "A full pack needs easy, medium, hard, and expert questions so replaying feels more like a game.",
      difficulty: "hard",
      spoilerLevel: "none",
    }),
    contextualQuestion(context, {
      question: `Why is it useful to include source labels on ${context.title} trivia?`,
      answer: "They make it easier to audit where the question context came from",
      options: uniqueOptions("They make it easier to audit where the question context came from", ["They replace the need for questions", "They let the UI skip loading", "They make wrong answers correct"]),
      explanation: "Source labels help future quality passes distinguish curated, synopsis-grounded, and expanded public-context questions.",
      difficulty: "expert",
      spoilerLevel: "none",
    }),
    contextualQuestion(context, {
      question: `What should happen when a better handcrafted ${context.title} pack is added later?`,
      answer: "It should coexist with or supersede the starter pack without losing saved progress",
      options: uniqueOptions("It should coexist with or supersede the starter pack without losing saved progress", ["It should delete user progress", "It should hide all playable trivia", "It should force the title back to queued forever"]),
      explanation: "The cache model is versioned so starter packs can be improved while preserving a reliable playable baseline.",
      difficulty: "expert",
      spoilerLevel: "none",
    }),
  ];
}

function curatedFanTrivia(details: any): TriviaDraft[] {
  const mediaType = normalizeMediaType(details.mediaType);

  if (mediaType === "tv" && titleMatches(details, [198178], ["Wonder Man"])) {
    return fanPack([
      ["In Marvel lore, what is Wonder Man's civilian name?", "Simon Williams", ["Eric Williams", "Simon Stroud", "Trevor Slattery"], "Wonder Man is the superhero identity most associated with Simon Williams.", "easy"],
      ["What kind of energy is central to Wonder Man's powers?", "Ionic energy", ["Gamma radiation", "Cosmic rays", "Vibranium resonance"], "Wonder Man's powers are traditionally tied to ionic energy and an altered ionic body.", "easy"],
      ["Which superhero team is Wonder Man most famously associated with?", "The Avengers", ["The Fantastic Four", "The Guardians of the Galaxy", "The Defenders"], "Wonder Man has a long comic-book history as an Avenger.", "easy"],
      ["What villainous identity is used by Simon Williams's brother Eric?", "Grim Reaper", ["Whirlwind", "The Hood", "Crossfire"], "Eric Williams, Simon's brother, is better known in Marvel comics as Grim Reaper.", "medium"],
      ["Which classic Avengers villain originally manipulates Simon Williams in Wonder Man's origin?", "Baron Zemo", ["Doctor Doom", "Kingpin", "Red Skull"], "Early Wonder Man stories connect Simon's transformation to Baron Zemo's schemes against the Avengers.", "medium"],
      ["What failing part of Simon Williams's life helps push him into danger before becoming Wonder Man?", "His business empire", ["His space program", "His sorcery school", "His detective agency"], "Simon is often portrayed as a businessman whose failed company and resentment make him vulnerable to manipulation.", "medium"],
      ["Which synthezoid has a famous connection to Wonder Man's brain patterns?", "Vision", ["Ultron", "Machine Man", "Jocasta"], "Marvel lore ties Vision's mind patterns to Simon Williams, creating one of Wonder Man's most important relationships.", "medium"],
      ["Which Avenger is central to the emotional triangle involving Wonder Man and Vision?", "Scarlet Witch", ["Black Widow", "She-Hulk", "Wasp"], "Scarlet Witch, Vision, and Wonder Man share a complicated emotional history in Avengers comics.", "hard"],
      ["What entertainment career does Simon Williams pursue in many Wonder Man stories?", "Acting", ["Professional boxing", "Stage magic", "News anchoring"], "Wonder Man's Hollywood and acting ambitions are a major part of his character identity.", "easy"],
      ["What makes Wonder Man physically unusual compared with many human heroes?", "His body is powered by ionic energy", ["He is made of adamantium", "He is a clone of Thor", "He is permanently invisible"], "Wonder Man's ionic body is a key part of his durability and power set.", "medium"],
      ["What tension often defines Wonder Man as a character?", "Celebrity ambition versus superhero responsibility", ["Time travel versus ancient prophecy", "Royal duty versus ocean politics", "Secret magic versus school exams"], "Wonder Man stories often play with fame, performance, and the responsibility of being a hero.", "medium"],
      ["Which Marvel robot villain is indirectly tied to Wonder Man through Vision's history?", "Ultron", ["M.O.D.O.K.", "Arnim Zola", "Sentinel Prime"], "Vision's creation and history connect Wonder Man's lore to Ultron and the wider Avengers mythology.", "hard"],
      ["What is Wonder Man often afraid of despite his great power?", "Dying again", ["Flying too high", "Losing his costume", "Speaking on camera"], "Wonder Man's relationship with death and resurrection has been an important recurring element in his stories.", "hard"],
      ["What kind of Marvel story does Wonder Man naturally support?", "A superhero satire about fame and performance", ["A medieval dragon quest", "A courtroom-only procedural", "A silent nature documentary"], "The character's Hollywood identity gives Wonder Man room to explore superhero celebrity and show business.", "medium"],
      ["Which part of Wonder Man's comic history makes him useful for stories about identity?", "His links to Vision's mind and Simon's public persona", ["His ownership of Wakanda", "His command of the Nova Corps", "His role as Spider-Man's uncle"], "Wonder Man sits at a strange intersection of personhood, celebrity, and Avengers lore.", "expert"],
      ["What is the name of Wonder Man's brother before he becomes Grim Reaper?", "Eric Williams", ["Eddie Brock", "Emil Blonsky", "Eli Bradley"], "Eric Williams is Simon's brother and one of the personal ties that complicates Wonder Man's story.", "hard"],
      ["What role does Hollywood usually play in Wonder Man stories?", "It reflects Simon's desire to be seen as a star", ["It hides the Infinity Stones", "It trains sorcerers", "It replaces Avengers Tower"], "Simon's show-business life is not just decoration; it is part of how the character explores image and ambition.", "hard"],
      ["What kind of origin mistake does Simon Williams make in early Wonder Man lore?", "He lets resentment make him useful to villains", ["He destroys Asgard by accident", "He steals Captain America's shield", "He opens a portal to the Dark Dimension"], "Wonder Man begins with compromised choices before becoming a more heroic figure.", "expert"],
      ["Which relationship makes Wonder Man more than a simple powerhouse?", "His connection to Vision's identity", ["His rivalry with J. Jonah Jameson", "His mentorship of Rocket Raccoon", "His ownership of the Daily Bugle"], "The Vision connection gives Wonder Man lore a deeper question about memory, identity, and personhood.", "expert"],
      ["What makes Wonder Man a good fit for Flim-style trivia?", "His stories combine Avengers lore, Hollywood satire, and character history", ["His only known fact is a release date", "His story has no comic background", "His lore is limited to runtime metadata"], "Wonder Man has enough character and franchise context for actual fan trivia without relying on synopsis questions.", "easy"],
    ]);
  }

  if (mediaType === "movie" && titleMatches(details, [865], ["The Running Man"])) {
    return fanPack([
      ["What crime is Ben Richards framed for before he is forced into the game?", "Massacring civilians during a food riot", ["Stealing government secrets", "Assassinating a network executive", "Blowing up a prison transport"], "Ben is turned into a public villain through edited footage that blames him for refusing an order.", "easy"],
      ["What kind of show is The Running Man inside the movie's world?", "A violent televised game show", ["A courtroom reality series", "A police recruitment show", "A celebrity survival documentary"], "The story satirizes a future where executions and propaganda are packaged as prime-time entertainment.", "easy"],
      ["Who is Damon Killian in the story?", "The host and producer controlling the game", ["Ben's prison commander", "A resistance radio operator", "The captain of the stalkers"], "Killian runs the broadcast, manipulates the audience, and decides how contestants are presented.", "easy"],
      ["What is the main goal for contestants sent into the game zone?", "Survive long enough to escape the hunters", ["Collect hidden cash boxes", "Rescue hostages from each arena", "Capture Damon Killian live on air"], "Contestants are thrown into a lethal arena and hunted by celebrity killers called stalkers.", "easy"],
      ["What are the celebrity killers in the game called?", "Stalkers", ["Judges", "Runners", "Wardens"], "The hunters are branded entertainers with signature weapons and theatrical personas.", "easy"],
      ["Which stalker uses a chainsaw as his signature weapon?", "Buzzsaw", ["Subzero", "Fireball", "Dynamo"], "Buzzsaw attacks with a motorized cutting weapon, making his fights feel like a slasher-show spectacle.", "medium"],
      ["Which stalker uses opera music and electricity during his attacks?", "Dynamo", ["Fireball", "Buzzsaw", "Captain Freedom"], "Dynamo is staged as a flamboyant performer whose attacks combine music, lights, and electrical weapons.", "medium"],
      ["Which stalker attacks with flamethrower-like firepower?", "Fireball", ["Subzero", "Dynamo", "Buzzsaw"], "Fireball's arena persona is built around heat, fire, and industrial pursuit.", "medium"],
      ["How does the network manipulate public opinion about Ben?", "By broadcasting edited footage and fake narratives", ["By erasing his name from all records", "By letting contestants vote on his guilt", "By staging a public trial in the arena"], "The film's satire depends on the network rewriting reality for ratings and control.", "medium"],
      ["What resistance figure helps expose the truth behind the broadcasts?", "Mic", ["Damon Killian", "Captain Freedom", "Subzero"], "Mic is tied to the underground resistance that fights the network's propaganda machine.", "medium"],
      ["Why does Amber become important to Ben's story?", "She discovers the broadcast deception and is pulled into the game", ["She owns the game zone", "She trains the stalkers", "She designed Ben's tracking collar"], "Amber starts closer to the system but becomes a witness to the truth the network wants buried.", "medium"],
      ["What does Captain Freedom represent in the show-business world of the movie?", "An old champion turned network icon", ["A rebel pilot", "A prison warden", "A computer hacker"], "Captain Freedom is treated like a legendary performer from the show's violent past.", "medium"],
      ["What larger theme does the movie attack most directly?", "Media propaganda as mass entertainment", ["Time travel paradoxes", "Corporate space colonization", "Small-town political corruption"], "The Running Man is a dystopian satire about ratings, spectacle, and manufactured truth.", "hard"],
      ["How are the stalkers presented to the audience?", "Like superstar performers with signature brands", ["As anonymous prison guards", "As randomly selected citizens", "As hidden assassins nobody sees"], "The show turns killers into celebrities, complete with costumes, entrances, and audience loyalty.", "hard"],
      ["What does Ben refuse to do in the opening setup?", "Fire on unarmed civilians", ["Throw a game for money", "Arrest Amber", "Join the resistance broadcast"], "His refusal becomes the moral event the regime edits into a lie.", "hard"],
      ["What is the audience encouraged to believe about the game?", "That the deaths are justice and entertainment", ["That contestants are actors", "That nobody is really harmed", "That winners always join the government"], "The broadcast frames state violence as a fair, thrilling contest.", "hard"],
      ["What turns the final act against Killian's control?", "The truth reaches the public through the broadcast system", ["The stalkers vote to quit", "The government cancels the show", "A computer predicts the ratings will fall"], "The same media machinery used to lie becomes the route for exposing the lie.", "expert", "major"],
      ["What makes Ben different from the image the network sells?", "He is principled and protective rather than a murderer", ["He is secretly a stalker", "He is a wealthy executive", "He wants to host the show"], "The film contrasts Ben's real choices with the villainous identity created for viewers.", "expert"],
      ["Why is The Running Man often remembered as more than a simple action movie?", "It mixes action with a satire of media, celebrity, and authoritarian control", ["It avoids social commentary entirely", "It is mostly a courtroom mystery", "It focuses on realistic sports strategy"], "Its most durable ideas are about entertainment culture and how images can control reality.", "expert"],
      ["What does the game zone function as in the story?", "A controlled arena for punishment, ratings, and propaganda", ["A neutral sports field", "A secret medical lab", "A training academy for police"], "The zone is where the state, the network, and the audience's appetite for spectacle meet.", "expert"],
    ]);
  }

  if (mediaType === "movie" && Number(details.tmdbId) === 218) {
    return fanPack([
      ["What is the Terminator sent back in time to do?", "Kill Sarah Connor", ["Protect John Connor", "Stop a police investigation", "Destroy Cyberdyne's offices"], "The machine's mission is to erase the future resistance leader by killing his mother.", "easy"],
      ["Who is sent back to protect Sarah Connor?", "Kyle Reese", ["Dr. Silberman", "Miles Dyson", "Ginger Ventura"], "Kyle Reese is the human soldier sent from the future to keep Sarah alive.", "easy"],
      ["What future war drives the plot of The Terminator?", "A war between humans and machines", ["A war between rival planets", "A civil war among police forces", "A war between vampire clans"], "The nightmare future is dominated by Skynet's machines and the human resistance.", "easy"],
      ["What does the Terminator initially use to find Sarah?", "A phone book listing Sarah Connors", ["A tracking chip in her jacket", "A police facial scan", "A radio signal from Kyle Reese"], "The machine works through the phone book, killing women with the same name.", "easy"],
      ["Where does Sarah first realize she is being hunted in public?", "A nightclub called Tech Noir", ["A hospital cafeteria", "A courthouse lobby", "A subway station"], "Tech Noir becomes the first major confrontation between Sarah, Kyle, and the Terminator.", "medium"],
      ["What phrase does Kyle use to warn Sarah about the machine?", "It will not stop", ["It can be reasoned with", "It only hunts at night", "It forgets faces quickly"], "Kyle explains the Terminator as relentless, emotionless, and impossible to bargain with.", "medium"],
      ["What company name becomes important to the franchise's machine future?", "Cyberdyne Systems", ["Tyrell Corporation", "Omni Consumer Products", "Weyland-Yutani"], "Cyberdyne is tied to the technological path that eventually leads to Skynet.", "medium"],
      ["What is Sarah Connor's role before the events transform her?", "A waitress living an ordinary life", ["A police detective", "A robotics engineer", "A military commander"], "The film begins with Sarah as an everyday person before she is pulled into a future war.", "easy"],
      ["What makes the Terminator frightening beyond its strength?", "It looks human but has no human empathy", ["It can control dreams", "It can become invisible", "It only attacks with magic"], "The horror comes from a machine wearing a human shape while behaving with total mechanical purpose.", "medium"],
      ["What future leader is connected to Sarah's survival?", "John Connor", ["Danny Dyson", "Peter Silberman", "Traxler"], "Sarah's future son is the resistance leader Skynet is trying to prevent.", "medium"],
      ["How does Kyle describe the future he comes from?", "A devastated world ruled by machines", ["A peaceful colony on Mars", "A flooded Earth controlled by pirates", "A utopia protected by robots"], "Kyle's memories show a post-apocalyptic war where humans hide and fight machines.", "medium"],
      ["Why is the police station sequence so memorable?", "The Terminator attacks a supposedly safe place", ["Sarah becomes a police captain", "Kyle is proven to be a robot", "Skynet sends an army through"], "The scene breaks the idea that institutions can protect Sarah from the machine.", "hard"],
      ["What object is left behind that hints at the future technology loop?", "A damaged Terminator part", ["Kyle's dog tags", "Sarah's apron", "A police radio"], "The remains of the machine become part of the franchise's causal loop around future technology.", "hard", "major"],
      ["What does Sarah record near the end of the story?", "Messages for her future son", ["A confession for the police", "A commercial for Cyberdyne", "Instructions for building Skynet"], "Sarah begins preparing John for the danger she now knows is coming.", "hard"],
      ["What is the film's central time-travel paradox?", "The future sends back the events that help create itself", ["Sarah remembers events from a past life", "The Terminator ages backward", "Skynet changes planets every loop"], "Kyle's mission and the machine's remains both feed into the future they came from.", "expert", "major"],
      ["Why does the Terminator repair itself after damage?", "To preserve its human disguise and keep hunting", ["To become friendly to Sarah", "To recharge from mirrors", "To communicate with Skynet"], "Its self-repair scenes emphasize that the human exterior is only camouflage.", "hard"],
      ["What genre blend helps define The Terminator?", "Science fiction, action, and slasher-like pursuit", ["Musical comedy and courtroom drama", "Western romance and sports drama", "Fantasy quest and pirate adventure"], "The movie works like a relentless chase horror film inside a time-travel action story.", "expert"],
      ["What makes Sarah Connor's arc important?", "She changes from ordinary survivor into someone preparing for war", ["She becomes mayor overnight", "She joins Skynet", "She forgets the entire event"], "Sarah's transformation is one of the film's biggest character engines.", "expert"],
      ["Why is Kyle's photograph of Sarah meaningful?", "It closes an emotional loop between past and future", ["It proves he is a machine", "It identifies the wrong Sarah", "It starts a police conspiracy"], "The photo connects Kyle's future devotion to the Sarah he meets in the past.", "expert", "major"],
      ["What does the final road scene suggest about Sarah's future?", "She is heading toward the storm she now knows is coming", ["She is escaping the timeline permanently", "The machines have already won", "The story was a television show"], "The approaching storm mirrors Sarah's knowledge that the future war is still ahead.", "hard"],
    ]);
  }

  if (mediaType === "movie" && Number(details.tmdbId) === 280) {
    return fanPack([
      ["In Terminator 2: Judgment Day, who is the T-800 sent back to protect?", "John Connor", ["Sarah Connor", "Miles Dyson", "Kyle Reese"], "The sequel reverses the first film's premise by making a T-800 the protector of young John Connor.", "easy"],
      ["In Terminator 2: Judgment Day, what kind of Terminator hunts John Connor?", "The liquid-metal T-1000", ["The T-600", "The Rev-9", "A Hunter-Killer tank"], "The T-1000's mimetic polyalloy body lets it copy people and reshape itself into weapons.", "easy"],
      ["In Terminator 2: Judgment Day, where is Sarah Connor held early in the story?", "Pescadero State Hospital", ["Cyberdyne headquarters", "A police safe house", "A desert bunker"], "Sarah is institutionalized at Pescadero before the escape sequence reunites her with John.", "medium"],
      ["In Terminator 2: Judgment Day, what phrase does John teach the T-800?", "Hasta la vista, baby", ["Come with me if you want to live", "I'll be back", "No fate but what we make"], "John teaches the machine casual slang, turning it into one of the film's most quoted lines.", "easy"],
      ["In Terminator 2: Judgment Day, what company is tied to Skynet's creation?", "Cyberdyne Systems", ["Tyrell Corporation", "Weyland-Yutani", "Omni Consumer Products"], "Cyberdyne's research into Terminator remains becomes the path toward Skynet.", "easy"],
      ["In Terminator 2: Judgment Day, what does Miles Dyson help create before learning the truth?", "The technology that will lead to Skynet", ["A time machine for Sarah", "A new police tracking system", "A resistance base"], "Dyson does not know his work will help create the machine future until Sarah and the others confront him.", "medium"],
      ["In Terminator 2: Judgment Day, what does Sarah carve into a picnic table?", "No fate", ["Judgment Day", "Skynet lives", "Come with me"], "The phrase captures the film's belief that the future can still be changed.", "medium"],
      ["In Terminator 2: Judgment Day, why does Sarah target Miles Dyson?", "She believes killing him can stop Skynet", ["She thinks he is the T-1000", "He kidnapped John", "He stole the DeLorean"], "Sarah nearly becomes the kind of killer she fears because she sees Dyson as the key to preventing Judgment Day.", "hard"],
      ["In Terminator 2: Judgment Day, what makes the T-1000 so difficult to stop?", "It can reform after being damaged", ["It can read minds", "It controls weather", "It travels without a time machine"], "Bullets and impacts only temporarily disrupt the T-1000's liquid-metal body.", "medium"],
      ["In Terminator 2: Judgment Day, what location becomes the final battleground?", "A steel mill", ["A shopping mall", "A desert gas station", "A police station"], "The molten steel setting becomes essential to destroying the T-1000.", "easy"],
      ["In Terminator 2: Judgment Day, what does the T-800 learn from John?", "Why human life matters", ["How to become invisible", "How to build Skynet", "Why robots need money"], "The protector gradually learns rules, humor, restraint, and loyalty from John.", "hard"],
      ["In Terminator 2: Judgment Day, what evidence do the heroes destroy at Cyberdyne?", "The chip and arm from the first Terminator", ["John's birth certificate", "Sarah's hospital records", "A police helicopter"], "The remains from the original machine are physical links to Skynet's future.", "medium"],
      ["In Terminator 2: Judgment Day, what is Sarah's nightmare vision about?", "A nuclear blast on Judgment Day", ["Dinosaurs escaping a park", "Aliens landing in Los Angeles", "A flooded city"], "Sarah's playground nightmare visualizes the horror she is trying to prevent.", "hard"],
      ["In Terminator 2: Judgment Day, how does the T-1000 often impersonate people?", "By touching and copying their form", ["By stealing their clothes only", "By using holograms", "By hypnotizing witnesses"], "The T-1000 can mimic people it physically samples, making trust dangerous.", "medium"],
      ["In Terminator 2: Judgment Day, what relationship changes the most over the movie?", "John and the T-800 becoming like family", ["Dyson and the T-1000 becoming partners", "Sarah and Skynet becoming allies", "John and Pescadero doctors teaming up"], "The emotional core comes from John forming a bond with a machine built for violence.", "hard"],
      ["In Terminator 2: Judgment Day, what does Sarah realize after attacking Dyson?", "She cannot murder an innocent family man", ["She has already caused Judgment Day", "The T-1000 is helping them", "John is not her son"], "Sarah stops before crossing a moral line, which separates her from the machines she fights.", "expert"],
      ["In Terminator 2: Judgment Day, what makes the mall hallway reveal work?", "Both Terminators appear to be threats until the T-800 protects John", ["John already knows both machines", "The T-1000 announces its mission", "Sarah narrates the whole scene"], "The scene plays on the audience's memory of the first movie before flipping expectations.", "hard"],
      ["In Terminator 2: Judgment Day, why does the T-800 choose to be lowered into molten steel?", "It must destroy the last future-tech evidence inside itself", ["It is out of power", "It wants to escape John", "It has become the T-1000"], "The T-800 understands that its own chip cannot be left behind if the future is to change.", "expert", "major"],
      ["In Terminator 2: Judgment Day, what does the thumbs-up gesture mean at the end?", "The T-800 has learned a human goodbye", ["The T-1000 survived", "John has joined Cyberdyne", "Sarah has given up"], "The gesture makes the machine's sacrifice emotionally readable to John and the audience.", "expert", "major"],
      ["In Terminator 2: Judgment Day, what is the film's central hope?", "The future is not fixed", ["Machines always win", "Time travel solves every problem", "Skynet is harmless"], "The story keeps returning to the idea that people can change what seems inevitable.", "medium"],
    ]);
  }

  if (mediaType === "movie" && titleMatches(details, [329], ["Jurassic Park"])) {
    return fanPack([
      ["What kind of dinosaur first gives the visitors a sense of wonder in Jurassic Park?", "A Brachiosaurus", ["A Velociraptor", "A Dilophosaurus", "A Stegosaurus"], "The Brachiosaurus reveal is the park's first grand promise of living dinosaurs.", "easy"],
      ["What does Dennis Nedry use to hide stolen dinosaur embryos?", "A fake shaving cream can", ["A hollow camera lens", "A lunch box", "A dinosaur egg shell"], "The Barbasol can is a disguised container for embryo theft.", "easy"],
      ["What dinosaur breaks out during the storm and attacks the tour vehicles?", "Tyrannosaurus rex", ["Velociraptor", "Triceratops", "Gallimimus"], "The T. rex paddock failure creates the film's central survival sequence.", "easy"],
      ["What warning does Ian Malcolm repeatedly give about the park?", "The scientists cannot control life", ["The island is too cold", "The dinosaurs are too small", "The tour cars are too fast"], "Malcolm's chaos-theory perspective argues that the park's control systems are an illusion.", "medium"],
      ["What insect preserved in amber helps explain the dinosaur cloning process?", "A mosquito", ["A beetle", "A dragonfly", "A wasp"], "The park's science story begins with dinosaur blood recovered from mosquitoes trapped in amber.", "easy"],
      ["Which dinosaur kills Nedry after his escape goes wrong?", "Dilophosaurus", ["Compsognathus", "Tyrannosaurus rex", "Brachiosaurus"], "Nedry encounters the frilled, venom-spitting Dilophosaurus after crashing in the storm.", "medium"],
      ["What do the velociraptors demonstrate in the opening scene?", "They are intelligent and dangerous pack hunters", ["They are harmless herbivores", "They can fly short distances", "They only hunt in daylight"], "The raptor transfer establishes the animals as strategic predators before the tour begins.", "medium"],
      ["Why does the park use frog DNA in the dinosaur cloning process?", "To fill gaps in the recovered genetic code", ["To make dinosaurs smaller", "To stop dinosaurs from eating meat", "To make every dinosaur glow"], "Frog DNA is used as a patch, and that choice has major consequences.", "medium"],
      ["What unexpected ability allows the dinosaurs to reproduce?", "Some change sex because of the frog DNA", ["They clone themselves in the lab", "They lay eggs without embryos", "The computers print new dinosaurs"], "Grant discovers eggs, revealing that life has found a way despite the park's controls.", "hard", "major"],
      ["What does Hammond believe will make Jurassic Park worthwhile?", "Sharing living dinosaurs with the world", ["Selling weapons to governments", "Building a secret prison", "Creating a dinosaur racing league"], "Hammond sees the park as a wondrous attraction, even as its dangers become undeniable.", "medium"],
      ["What do Lex and Tim hide under during the T. rex attack?", "A tour vehicle", ["A kitchen counter", "A helicopter", "A lab table"], "The crushed vehicle sequence turns the park tour into a survival nightmare.", "easy"],
      ["What environment makes the raptor kitchen scene so tense?", "A room full of reflective metal surfaces and hiding spaces", ["A brightly lit football field", "A frozen cave", "A crowded hotel lobby"], "The kitchen gives the children narrow cover while the raptors search methodically.", "hard"],
      ["What does Grant use to distract the T. rex during the road attack?", "A flare", ["A radio transmitter", "A dinosaur egg", "A camera flash"], "The flare creates motion and light that draw the T. rex away.", "medium"],
      ["What does the sick Triceratops scene reveal about the park?", "Even peaceful encounters hide unresolved problems", ["The dinosaurs are mechanical", "The tour has already ended", "Grant dislikes herbivores"], "The awe of touching a living dinosaur is paired with the mystery of why it is ill.", "hard"],
      ["What is the park's biggest human failure?", "Believing complex living systems can be fully controlled", ["Forgetting to sell enough shirts", "Making the island too quiet", "Hiring too many paleontologists"], "The disaster is not just a technical failure; it is a failure of humility.", "expert"],
      ["What line of thinking does Ian Malcolm bring to the story?", "Chaos theory", ["Deep-sea geology", "Criminal profiling", "Dream analysis"], "Malcolm frames the park as a fragile system where small failures can cascade.", "medium"],
      ["Why is the final T. rex appearance in the visitor center ironic?", "The feared predator saves the survivors from the raptors", ["The dinosaur apologizes", "The park opens successfully", "Nedry returns with the embryos"], "The animal that symbolized disaster becomes the reason the main group escapes.", "expert", "major"],
      ["What does the banner falling in the visitor center emphasize?", "The park's dream has collapsed", ["The park is opening early", "The dinosaurs are fake", "The island is underwater"], "The celebratory branding literally falls as the fantasy of control ends.", "expert"],
      ["What makes Jurassic Park's dinosaurs feel like characters rather than props?", "Each major species has distinct behavior and story function", ["They all act identically", "They never interact with people", "They are only shown on computer screens"], "The film gives different dinosaurs different moods: wonder, terror, curiosity, and threat.", "expert"],
      ["What lesson does Grant learn through protecting Lex and Tim?", "His view of children changes during the survival journey", ["He decides dinosaurs are harmless", "He wants to run the park", "He learns computer hacking"], "Grant's protective role with the kids quietly reshapes his character.", "hard"],
    ]);
  }

  if (mediaType === "movie" && titleMatches(details, [105], ["Back to the Future"])) {
    return fanPack([
      ["What speed must the DeLorean reach to travel through time?", "88 miles per hour", ["55 miles per hour", "99 miles per hour", "121 miles per hour"], "Doc Brown's time machine activates when the DeLorean reaches 88 miles per hour.", "easy"],
      ["What does Marty accidentally disrupt in 1955?", "His parents' first meeting", ["Doc's high-school graduation", "The invention of television", "The town clock dedication"], "Marty interferes with the event that was supposed to bring Lorraine and George together.", "easy"],
      ["What powers the DeLorean's first successful time jump?", "Plutonium", ["Gasoline alone", "Lightning", "Solar panels"], "At the start of the film, Doc uses stolen plutonium to generate the energy needed.", "medium"],
      ["What later source of energy becomes Marty's way home?", "A lightning strike at the clock tower", ["A nuclear test", "A power plant meltdown", "A bolt from a police taser"], "The clock tower lightning strike gives Doc and Marty a predictable burst of energy.", "easy"],
      ["What is the name of Marty's band?", "The Pinheads", ["The Starlighters", "The Flux Tones", "The Lone Pines"], "Marty auditions at school with his band, The Pinheads.", "medium"],
      ["What town is the story centered around?", "Hill Valley", ["Twin Pines", "Kingston Falls", "Castle Rock"], "Hill Valley's town square becomes the movie's past-and-present playground.", "easy"],
      ["What invention does Doc Brown use to make time travel possible?", "The flux capacitor", ["The arc reactor", "The sonic screwdriver", "The neuralizer"], "Doc calls the flux capacitor the invention that makes time travel work.", "easy"],
      ["What happens to the mall name after Marty changes the past?", "Twin Pines Mall becomes Lone Pine Mall", ["Lone Pine Mall becomes Twin Pines Mall", "Hill Valley Mall becomes Clock Tower Mall", "The mall disappears entirely"], "Marty runs over one of Peabody's pine trees in 1955, changing the name in 1985.", "medium", "major"],
      ["What event does Lorraine mistakenly believe explains Marty's arrival?", "Her father hitting him with a car", ["A science experiment at school", "A skateboard accident downtown", "A lightning strike"], "Lorraine's family finds Marty after her father hits him instead of hitting George.", "medium"],
      ["What school dance becomes essential to restoring Marty's future?", "The Enchantment Under the Sea dance", ["The Hill Valley Harvest Ball", "The Clock Tower Benefit", "The Goldie Wilson Gala"], "George and Lorraine need to kiss at the dance for Marty's family future to survive.", "easy"],
      ["What begins happening to Marty in the photograph?", "He and his siblings start disappearing", ["The photo catches fire", "Doc appears in the picture", "The DeLorean replaces his family"], "The photo gives a visual countdown for Marty's fading future.", "medium"],
      ["What does George need to do to change his own future?", "Stand up to Biff", ["Become mayor overnight", "Invent time travel", "Leave Hill Valley forever"], "George's courage against Biff changes both the romance and his adult life.", "medium"],
      ["What does Marty perform at the school dance?", "A rock-and-roll guitar solo", ["A magic act", "A stand-up comedy routine", "A classical piano piece"], "Marty's performance pushes 1955 music into something the crowd is not quite ready for.", "medium"],
      ["Why does Doc initially struggle to believe Marty's story?", "The time-machine idea sounds impossible even to him in 1955", ["He has never met Marty in any timeline", "He hates all science fiction", "He already sold the DeLorean"], "Marty has to prove he is from the future to a younger Doc who has only imagined the idea.", "hard"],
      ["What item helps Marty prove he knows the future?", "A flyer about the clock tower lightning strike", ["A sports almanac", "A map of Mars", "A newspaper about a dinosaur park"], "The flyer gives Doc the exact date and time of the lightning strike.", "medium"],
      ["What is Biff's role in both timelines?", "A bully whose power changes depending on George's confidence", ["A secret scientist", "A time-travel police officer", "A musician in Marty's band"], "Biff's status shifts when George finally stops being intimidated by him.", "hard"],
      ["What makes the clock tower climax so suspenseful?", "Timing the DeLorean run with the lightning strike", ["Finding plutonium under the stage", "Winning a school election", "Escaping dinosaurs downtown"], "Doc and Marty have only one precise moment to channel the lightning into the DeLorean.", "hard"],
      ["What emotional problem drives Marty's mission beyond simply getting home?", "Making sure his parents fall in love", ["Winning the school battle of the bands", "Becoming rich in 1955", "Stopping Doc from teaching science"], "Marty's existence depends on restoring a relationship he accidentally damaged.", "hard"],
      ["What does the improved 1985 reveal about George?", "He has become confident and successful", ["He has become a police chief", "He has vanished", "He owns the mall"], "George's changed past creates a more confident adult life and family dynamic.", "expert", "major"],
      ["Why is Back to the Future's time travel especially playful?", "Small personal actions reshape jokes, names, and family history", ["The rules never affect anyone", "The movie avoids paradoxes", "The past is shown as identical to the present"], "The film makes time travel feel personal by turning tiny changes into visible future consequences.", "expert"],
    ]);
  }

  if (mediaType === "movie" && titleMatches(details, [525], ["The Blues Brothers", "Blues Brothers"])) {
    return fanPack([
      ["What mission drives Jake and Elwood through The Blues Brothers?", "Raise money to save the orphanage", ["Win a national talent contest", "Buy a radio station", "Open a new nightclub"], "Their chaotic journey begins as an attempt to save the Catholic orphanage where they grew up.", "easy"],
      ["What kind of group do Jake and Elwood try to reunite?", "Their old rhythm and blues band", ["A baseball team", "A police choir", "A circus troupe"], "The brothers have to bring the band back together for a benefit performance.", "easy"],
      ["What car becomes central to their escape-filled journey?", "A former police car", ["A stolen limousine", "A taxi cab", "A hearse"], "The Bluesmobile is an ex-police car that survives absurd chases and stunts.", "easy"],
      ["Who repeatedly pursues the brothers across the movie?", "Police, angry musicians, and other enemies they upset", ["Only one private detective", "A group of aliens", "A rival time traveler"], "The comedy escalates as nearly every group they cross joins the chase.", "medium"],
      ["What Chicago institution gives the movie much of its musical identity?", "Blues and soul performance culture", ["Silent film studios", "Country rodeo circuits", "Opera conservatories"], "The movie is built around blues, soul, gospel, and R&B performances.", "medium"],
      ["What phrase describes the brothers' sense of purpose?", "They are on a mission from God", ["They are running for mayor", "They are undercover astronauts", "They are chasing a treasure map"], "The brothers frame the orphanage rescue as a sacred mission despite their chaos.", "easy"],
      ["What happens at the country-western bar?", "The band has to adapt its set for the crowd", ["Jake joins the rodeo", "Elwood buys the venue", "The police arrest every customer"], "The scene plays with genre clashes as the blues band faces a country audience.", "medium"],
      ["Why is the mall chase so memorable?", "The Bluesmobile drives through stores inside a shopping mall", ["The band performs on a roof", "A dinosaur crashes through the food court", "The car turns into a boat"], "The sequence turns ordinary retail space into a massive slapstick car chase.", "medium"],
      ["What does the film use celebrity musician appearances for?", "To turn the road trip into a living jukebox of American music", ["To explain time travel rules", "To introduce superheroes", "To announce a sports league"], "The cameos are musical set pieces that celebrate the traditions the brothers love.", "hard"],
      ["What kind of comedy style defines many of the action scenes?", "Deadpan absurd escalation", ["Quiet drawing-room farce", "Animated fantasy only", "Mockumentary interviews"], "The brothers stay strangely calm while the destruction around them keeps getting bigger.", "hard"],
      ["What does Jake need after leaving prison?", "A plan to pay the orphanage tax bill", ["A new passport", "A college degree", "A spaceship ticket"], "Jake's release leads straight into the brothers' urgent money-raising mission.", "easy"],
      ["Why do so many people want revenge on Jake and Elwood?", "They break promises, dodge consequences, and cause chaos everywhere", ["They steal dinosaur embryos", "They cancel a national holiday", "They hack a television network"], "The comedy comes from old grudges and new disasters piling up behind them.", "medium"],
      ["What makes the brothers visually iconic?", "Black suits, hats, and sunglasses", ["Bright capes and helmets", "Western dusters and spurs", "Lab coats and goggles"], "Their uniform-like look is part of the film's instantly recognizable identity.", "easy"],
      ["How does the movie treat Chicago?", "As a musical playground full of roads, clubs, churches, and chaos", ["As a tiny fantasy village", "As a distant alien planet", "As a quiet seaside town"], "Chicago is not just a backdrop; the city's music and streets shape the film.", "hard"],
      ["What is the benefit concert meant to accomplish?", "Collect enough money to save the orphanage", ["Fund a police museum", "Buy new instruments for a rival band", "Launch a television network"], "The big show is the brothers' last chance to raise the money they need.", "easy"],
      ["What role does gospel music play early in the story?", "It inspires the brothers' mission", ["It solves a murder", "It opens a courtroom trial", "It powers a time machine"], "The church sequence turns the orphanage problem into a calling for Jake.", "medium"],
      ["What makes The Blues Brothers unusual as a musical comedy?", "It combines real music showcases with huge action set pieces", ["It has no songs", "It never leaves one room", "It is animated entirely by hand"], "The movie is both a concert celebration and a broad destructive chase comedy.", "expert"],
      ["What does Elwood's calm personality add to the chaos?", "A deadpan contrast to the mayhem around him", ["A constant panic reaction", "A villain's monologue", "A sports-announcer voiceover"], "Elwood often treats impossible danger as if it is completely normal.", "hard"],
      ["Why do the brothers' performances matter to the plot?", "Music is how they gather allies and raise the money", ["Music reveals hidden treasure coordinates", "Music stops robots from attacking", "Music lets them change the weather"], "The story's solution is not just escape; it is getting the band playing again.", "hard"],
      ["What is the movie ultimately celebrating beneath the destruction?", "American blues, soul, and rhythm-and-blues traditions", ["Corporate television ratings", "Medieval court politics", "Silent horror cinema"], "The chaos is wrapped around a deep affection for the music and performers at its center.", "expert"],
    ]);
  }

  return [];
}

function curatedTrivia(details: any): TriviaDraft[] {
  const mediaType = normalizeMediaType(details.mediaType);
  const fanTrivia = curatedFanTrivia(details);
  if (fanTrivia.length > 0) return fanTrivia;

  if (mediaType === "movie" && titleMatches(details, [857], ["Saving Private Ryan"])) {
    return [
      draftQuestion({
        question: "What historic World War II operation opens Saving Private Ryan?",
        answer: "The D-Day landing at Omaha Beach",
        options: uniqueOptions("The D-Day landing at Omaha Beach", ["The Battle of the Bulge", "Operation Market Garden", "The bombing of Pearl Harbor"]),
        explanation: "The film begins with the Allied landing at Omaha Beach during the Normandy invasion.",
        difficulty: "medium",
        spoilerLevel: "minor",
        confidence: 0.94,
      }),
      draftQuestion({
        question: "What kind of mission is Captain Miller assigned after the Normandy landing?",
        answer: "Find and bring home Private Ryan",
        options: uniqueOptions("Find and bring home Private Ryan", ["Capture a German radio tower", "Recover stolen invasion maps", "Escort a general to Paris"]),
        explanation: "The squad is sent behind enemy lines to locate Ryan and remove him from combat.",
        difficulty: "medium",
        spoilerLevel: "minor",
        confidence: 0.95,
      }),
      draftQuestion({
        question: "Why is the squad sent to find Private James Francis Ryan?",
        answer: "His brothers have been killed in the war",
        options: uniqueOptions("His brothers have been killed in the war", ["He is carrying secret invasion plans", "He is the only medic left in his unit", "He witnessed an enemy surrender"]),
        explanation: "The mission begins after the Army learns that Ryan's brothers have died in combat.",
        difficulty: "medium",
        spoilerLevel: "minor",
        confidence: 0.92,
      }),
      draftQuestion({
        question: "What moral question follows the squad through the mission?",
        answer: "Whether one soldier is worth risking many lives",
        options: uniqueOptions("Whether one soldier is worth risking many lives", ["Whether the invasion should be delayed", "Whether Miller should become a general", "Whether Ryan knows secret codes"]),
        explanation: "The soldiers repeatedly wrestle with the cost and purpose of saving Ryan.",
        difficulty: "hard",
        spoilerLevel: "minor",
        confidence: 0.94,
      }),
    ];
  }

  if (mediaType === "movie" && titleMatches(details, [120, 121, 122], ["The Lord of the Rings"])) {
    return [
      draftQuestion({
        question: "What item is Frodo tasked with carrying to Mordor?",
        answer: "The One Ring",
        options: uniqueOptions("The One Ring", ["The Arkenstone", "The Palantir", "The Evenstar"]),
        explanation: "Frodo carries the One Ring, whose destruction becomes the central quest of the story.",
        difficulty: "easy",
        spoilerLevel: "minor",
        confidence: 0.96,
      }),
      draftQuestion({
        question: "Which realm is ruled by Galadriel in The Fellowship of the Ring?",
        answer: "Lothlorien",
        options: uniqueOptions("Lothlorien", ["Rohan", "Gondor", "Moria"]),
        explanation: "Galadriel and Celeborn rule Lothlorien, where the Fellowship finds refuge.",
        difficulty: "hard",
        spoilerLevel: "minor",
        confidence: 0.9,
      }),
      draftQuestion({
        question: "Why is the Fellowship formed?",
        answer: "To help carry the Ring toward its destruction",
        options: uniqueOptions("To help carry the Ring toward its destruction", ["To crown a new king immediately", "To reclaim the Lonely Mountain", "To build a new city in Mordor"]),
        explanation: "The Fellowship unites different peoples around the dangerous task of destroying the Ring.",
        difficulty: "medium",
        spoilerLevel: "minor",
        confidence: 0.94,
      }),
      draftQuestion({
        question: "What does Gollum call his 'precious'?",
        answer: "The One Ring",
        options: uniqueOptions("The One Ring", ["A mithril shirt", "A seeing stone", "A silver leaf brooch"]),
        explanation: "Gollum's obsession with the One Ring is one of the saga's defining character threads.",
        difficulty: "family_night",
        spoilerLevel: "minor",
        confidence: 0.92,
      }),
    ];
  }

  if (mediaType === "movie" && titleMatches(details, [105], ["Back to the Future"])) {
    return [
      draftQuestion({
        question: "What speed must the DeLorean reach to travel through time?",
        answer: "88 miles per hour",
        options: uniqueOptions("88 miles per hour", ["55 miles per hour", "99 miles per hour", "121 miles per hour"]),
        explanation: "Doc Brown's DeLorean time machine activates when it reaches 88 miles per hour.",
        difficulty: "easy",
        spoilerLevel: "minor",
        confidence: 0.96,
      }),
      draftQuestion({
        question: "What does Marty accidentally disrupt after traveling to 1955?",
        answer: "His parents' first meeting",
        options: uniqueOptions("His parents' first meeting", ["Doc Brown's college graduation", "The invention of television", "The opening of Hill Valley High"]),
        explanation: "Marty interferes with the moment that was supposed to bring his parents together.",
        difficulty: "medium",
        spoilerLevel: "minor",
        confidence: 0.94,
      }),
      draftQuestion({
        question: "What does Marty need his parents to do at the school dance?",
        answer: "Kiss and fall in love",
        options: uniqueOptions("Kiss and fall in love", ["Win the talent show", "Steal the DeLorean", "Stop Doc from inventing time travel"]),
        explanation: "Marty's future depends on George and Lorraine reconnecting at the dance.",
        difficulty: "easy",
        spoilerLevel: "minor",
        confidence: 0.95,
      }),
    ];
  }

  if (mediaType === "movie" && titleMatches(details, [11], ["Star Wars"])) {
    return [
      draftQuestion({
        question: "What weapon does Obi-Wan Kenobi call 'an elegant weapon for a more civilized age'?",
        answer: "A lightsaber",
        options: uniqueOptions("A lightsaber", ["A blaster", "A thermal detonator", "A bowcaster"]),
        explanation: "Obi-Wan uses the line while introducing Luke to his father's lightsaber.",
        difficulty: "easy",
        spoilerLevel: "minor",
        confidence: 0.94,
      }),
      draftQuestion({
        question: "What space station does the Rebel Alliance try to destroy?",
        answer: "The Death Star",
        options: uniqueOptions("The Death Star", ["Starkiller Base", "Cloud City", "The Executor"]),
        explanation: "The Death Star is the Empire's planet-destroying battle station.",
        difficulty: "easy",
        spoilerLevel: "minor",
        confidence: 0.96,
      }),
      draftQuestion({
        question: "Who pilots the Millennium Falcon with Chewbacca?",
        answer: "Han Solo",
        options: uniqueOptions("Han Solo", ["Luke Skywalker", "Lando Calrissian", "Wedge Antilles"]),
        explanation: "Han Solo and Chewbacca operate the Millennium Falcon when Luke and Obi-Wan hire them.",
        difficulty: "family_night",
        spoilerLevel: "none",
        confidence: 0.94,
      }),
    ];
  }

  if (mediaType === "movie" && titleMatches(details, [329], ["Jurassic Park"])) {
    return [
      draftQuestion({
        question: "What type of dinosaur breaks out during the storm and attacks the tour vehicles?",
        answer: "Tyrannosaurus rex",
        options: uniqueOptions("Tyrannosaurus rex", ["Velociraptor", "Brachiosaurus", "Triceratops"]),
        explanation: "The T. rex breakout is one of the film's central suspense sequences.",
        difficulty: "easy",
        spoilerLevel: "minor",
        confidence: 0.93,
      }),
      draftQuestion({
        question: "What does Dennis Nedry use to hide dinosaur embryos?",
        answer: "A fake shaving cream can",
        options: uniqueOptions("A fake shaving cream can", ["A hollow amber cane", "A lunch box", "A camera case"]),
        explanation: "The Barbasol can is a disguised container made to smuggle embryos out of the park.",
        difficulty: "medium",
        spoilerLevel: "minor",
        confidence: 0.94,
      }),
      draftQuestion({
        question: "What theory shapes Ian Malcolm's warnings about the park?",
        answer: "Chaos theory",
        options: uniqueOptions("Chaos theory", ["String theory", "Game theory", "Plate tectonics"]),
        explanation: "Malcolm warns that complex living systems will not behave according to the park's neat control plans.",
        difficulty: "medium",
        spoilerLevel: "none",
        confidence: 0.95,
      }),
    ];
  }

  if (mediaType === "tv" && titleMatches(details, [125988], ["Silo"])) {
    return [
      draftQuestion({
        question: "Where do the people of Silo live?",
        answer: "In a giant underground structure",
        options: uniqueOptions("In a giant underground structure", ["On a generation starship", "Inside a sealed island resort", "In a floating city"]),
        explanation: "The series centers on a society living inside a massive underground silo.",
        difficulty: "easy",
        spoilerLevel: "none",
        confidence: 0.94,
      }),
      draftQuestion({
        question: "Which character becomes central to investigating the silo's secrets?",
        answer: "Juliette Nichols",
        options: uniqueOptions("Juliette Nichols", ["Allison Becker", "Martha Walker", "Bernard Holland"]),
        explanation: "Juliette Nichols is pulled into the mystery surrounding the silo's rules and hidden history.",
        difficulty: "medium",
        spoilerLevel: "minor",
        confidence: 0.9,
      }),
      draftQuestion({
        question: "Silo is adapted from novels by which author?",
        answer: "Hugh Howey",
        options: uniqueOptions("Hugh Howey", ["Blake Crouch", "Andy Weir", "James S. A. Corey"]),
        explanation: "The show is based on Hugh Howey's Silo series of novels.",
        difficulty: "hard",
        spoilerLevel: "none",
        confidence: 0.88,
      }),
    ];
  }

  if (mediaType === "tv" && titleMatches(details, [106379], ["Fallout"])) {
    return [
      draftQuestion({
        question: "What company is closely associated with the underground Vaults in Fallout?",
        answer: "Vault-Tec",
        options: uniqueOptions("Vault-Tec", ["RobCo", "Nuka-Cola", "West Tek"]),
        explanation: "Vault-Tec is the company behind many of the Vaults that shape Fallout's world and experiments.",
        difficulty: "medium",
        spoilerLevel: "none",
        confidence: 0.9,
      }),
      draftQuestion({
        question: "What kind of underground community does Lucy come from?",
        answer: "A Vault",
        options: uniqueOptions("A Vault", ["A Citadel", "A Silo", "A bunker city called Zion"]),
        explanation: "Lucy begins the story as a Vault dweller before entering the wasteland.",
        difficulty: "easy",
        spoilerLevel: "minor",
        confidence: 0.92,
      }),
      draftQuestion({
        question: "What visual style helps define Fallout's world?",
        answer: "Retro-futuristic Americana",
        options: uniqueOptions("Retro-futuristic Americana", ["Medieval fantasy realism", "Cyberpunk neon noir", "Victorian steampunk"]),
        explanation: "Fallout mixes 1950s-inspired Americana with a devastated future wasteland.",
        difficulty: "medium",
        spoilerLevel: "none",
        confidence: 0.9,
      }),
    ];
  }

  return [];
}

function isHighQualityTriviaDraft(draft: TriviaDraft, title: string, seenQuestions: Set<string>, seenAnswers: Set<string>) {
  const question = normalizeTriviaText(draft.question);
  const answer = normalizeTriviaText(draft.answer);
  const metadataPatterns = [
    "what year",
    "release year",
    "which genre",
    "runtime",
    "how many seasons",
    "how many episodes",
    "content rating",
    "associated with on flim",
    "listed for",
    "current show metadata",
    "which story element is central",
    "which setting best fits",
    "which actor plays",
    "who plays",
    "which character is played",
    "who directed",
    "which director",
    "which performer",
    "is credited as",
    "viewing experience",
    "story setup",
    "opening premise",
    "best matches",
    "based on the synopsis",
    "title context",
    "good fan trivia angle",
    "source context",
    "source grounded",
    "generated pack",
    "fallback",
    "cache",
    "app diagnostics",
    "difficulty curve",
    "question feel",
  ];

  if (draft.confidence < 0.74) return false;
  if (!draft.question || !draft.answer || !draft.explanation) return false;
  if (metadataPatterns.some((pattern) => question.includes(pattern))) return false;
  if (answer === compactTitle(title) || answer.length < 2) return false;
  if (!Array.isArray(draft.options) || draft.options.length < 4) return false;
  if (!draft.options.includes(draft.answer)) return false;
  if (new Set(draft.options.map((option) => normalizeTriviaText(option))).size < 4) return false;
  if (seenQuestions.has(question) || seenAnswers.has(answer)) return false;
  seenQuestions.add(question);
  seenAnswers.add(answer);
  return true;
}

function generateTrivia(details: any): TriviaDraft[] {
  const mediaType = normalizeMediaType(details.mediaType);
  const title = details.title || "this title";
  const seenQuestions = new Set<string>();
  const seenAnswers = new Set<string>();
  const drafts = [
    ...curatedTrivia({ ...details, mediaType }),
  ];

  return drafts
    .map((draft) => applyTitleContextRule(draft, { ...details, mediaType }))
    .filter((draft) => isHighQualityTriviaDraft(draft, title, seenQuestions, seenAnswers))
    .slice(0, TRIVIA_TARGET_COUNT);
}

function generatedDifficultyFromDraft(difficulty: TriviaDraft["difficulty"]): OpenAITriviaQuestion["difficulty"] {
  if (difficulty === "easy" || difficulty === "family_night") return "easy";
  if (difficulty === "hard" || difficulty === "expert") return "hard";
  return "medium";
}

function buildCuratedGeneratedPack(details: any, options: { questionCount: number; spoilerMode: boolean }): OpenAITriviaPack | null {
  const mediaType = normalizeMediaType(details.mediaType);
  const tmdbId = Number(details.tmdbId);
  const title = String(details.title || details.name || "Untitled").trim();
  const drafts = generateTrivia({ ...details, mediaType, tmdbId });
  if (drafts.length < TRIVIA_MIN_READY_COUNT) {
    logTriviaPipeline("generation_curated_fallback_insufficient", {
      tmdbId,
      mediaType,
      draftCount: drafts.length,
      minimum: TRIVIA_MIN_READY_COUNT,
    });
    return null;
  }

  const questions = drafts.slice(0, Math.min(options.questionCount, drafts.length)).map((draft) => ({
    question: draft.question,
    choices: draft.options,
    correctAnswer: draft.answer,
    difficulty: generatedDifficultyFromDraft(draft.difficulty),
    category: String(draft.difficulty === "family_night" ? "story" : draft.difficulty === "expert" ? "lore" : "story"),
    explanation: draft.explanation,
    spoiler: draft.spoilerLevel === "major",
  }));

  return {
    title,
    mediaType,
    tmdbId,
    spoilerMode: options.spoilerMode,
    questions,
  };
}

function generateEasterEggHunts(details: any): EasterEggDraft[] {
  const mediaType = normalizeMediaType(details.mediaType);
  const tmdbId = Number(details.tmdbId);
  const hunts: EasterEggDraft[] = [];

  if (mediaType === "movie" && tmdbId === 105) {
    hunts.push({
      title: "Twin Pines / Lone Pine",
      prompt: "Watch for the mall sign near the beginning and again after Marty returns to 1985.",
      hint: "Pay attention to the name of the farm Marty drives through in 1955.",
      answer: "Twin Pines Mall became Lone Pine Mall.",
      explanation: "Marty runs over one of Old Man Peabody's twin pine trees in 1955, changing the mall name in 1985.",
      difficulty: "medium",
      spoilerLevel: "minor",
      confidence: 0.92,
      sourceLabels: CURATED_SOURCE_LABELS,
      sourceUrls: CURATED_SOURCE_URLS,
    });
    hunts.push({
      title: "Clock Tower Setup",
      prompt: "Notice how the town clock becomes important before the climax explains why.",
      hint: "Look for the flyer about saving the clock tower.",
      answer: "The clock tower flyer gives Marty the exact lightning strike time he needs to get back to 1985.",
      explanation: "The flyer is a small detail that becomes the key to Doc and Marty's final plan.",
      difficulty: "easy",
      spoilerLevel: "minor",
      confidence: 0.88,
      sourceLabels: CURATED_SOURCE_LABELS,
      sourceUrls: CURATED_SOURCE_URLS,
    });
  }

  if (mediaType === "movie" && tmdbId === 329) {
    hunts.push({
      title: "The Barbasol Can",
      prompt: "Watch for the fake shaving cream can that Dennis Nedry carries during his escape.",
      hint: "It is designed to hide dinosaur embryos.",
      answer: "The Barbasol can is used to smuggle dinosaur embryos.",
      explanation: "The prop is central to Nedry's plan and becomes easy to miss once the storm and escape sequence take over.",
      difficulty: "medium",
      spoilerLevel: "minor",
      confidence: 0.9,
      sourceLabels: CURATED_SOURCE_LABELS,
      sourceUrls: CURATED_SOURCE_URLS,
    });
  }

  return hunts.filter((hunt) => hunt.confidence >= 0.74).slice(0, 5);
}

function mapTrivia(row: any, completedIds = new Set<string>(), details?: any) {
  const question = details
    ? withExplicitTitleContext(row.question, String(details.title || details.name || ""))
    : row.question;
  return {
    id: row.id,
    tmdbId: row.tmdb_id,
    mediaType: normalizeMediaType(row.media_type),
    question,
    answer: row.answer,
    options: Array.isArray(row.options) ? row.options : [],
    explanation: row.explanation || "",
    difficulty: row.difficulty || "easy",
    spoilerLevel: row.spoiler_level || "none",
    sourceUrls: Array.isArray(row.source_urls) ? row.source_urls : [],
    sourceLabels: Array.isArray(row.source_labels) ? row.source_labels : [],
    confidence: Number(row.confidence || 0),
    status: row.status,
    reportCount: Number(row.report_count || 0),
    completed: completedIds.has(row.id),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapEasterEgg(row: any, completedIds = new Set<string>()) {
  const userStatus = row.user_status || (completedIds.has(row.id) ? "completed" : "not_started");
  return {
    id: row.id,
    tmdbId: row.tmdb_id,
    mediaType: normalizeMediaType(row.media_type),
    title: row.title,
    prompt: row.prompt,
    hint: row.hint || "",
    answer: row.answer,
    explanation: row.explanation || "",
    difficulty: row.difficulty || "easy",
    spoilerLevel: row.spoiler_level || "minor",
    sourceUrls: Array.isArray(row.source_urls) ? row.source_urls : [],
    sourceLabels: Array.isArray(row.source_labels) ? row.source_labels : [],
    confidence: Number(row.confidence || 0),
    status: row.status,
    reportCount: Number(row.report_count || 0),
    userStatus,
    submittedAnswer: row.submitted_answer || "",
    isCorrect: row.is_correct === null || row.is_correct === undefined ? undefined : Boolean(row.is_correct),
    hintUsed: Boolean(row.hint_used),
    startedAt: row.started_at || undefined,
    completedAt: row.completed_at || undefined,
    completed: userStatus === "completed",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function readCachedTrivia(sql: any, tmdbId: number, mediaType: MediaType, userId?: string, details?: any) {
  const completedIds = await readCompletedIds(sql, userId, "user_trivia_progress", "trivia_id");
  let rows = await sql`
    select *
    from title_trivia
    where tmdb_id = ${tmdbId}
      and media_type = ${mediaType}
      and status in ('approved', 'auto_generated')
      and report_count < ${REPORT_THRESHOLD}
      and source_hash like ${`${TRIVIA_VERSION}:%`}
      and options ? answer
    order by confidence desc, created_at asc
    limit ${TRIVIA_TARGET_COUNT}
  `;
  if (rows.length < TRIVIA_MIN_READY_COUNT && !triviaProviderApiKey()) {
    rows = await sql`
      select *
      from title_trivia
      where tmdb_id = ${tmdbId}
        and media_type = ${mediaType}
        and status in ('approved', 'auto_generated')
        and report_count < ${REPORT_THRESHOLD}
        and options ? answer
      order by
        case when source_hash like ${`${TRIVIA_VERSION}:%`} then 0 else 1 end,
        confidence desc,
        created_at asc
      limit ${TRIVIA_TARGET_COUNT}
    `;
  }
  const needsContext = details && titleNeedsExplicitTriviaContext({ ...details, mediaType, tmdbId });
  const seen = new Set<string>();
  const uniqueRows = rows.filter((row: any) => {
    const key = `${normalizeTriviaText(row.question)}:${normalizeAnswer(row.answer || "")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return uniqueRows.map((row: any) => mapTrivia(row, completedIds, needsContext ? { ...details, mediaType, tmdbId } : undefined));
}

async function readCompletedIds(sql: any, userId: string | undefined, table: "user_trivia_progress" | "user_easter_egg_progress", idColumn: "trivia_id" | "easter_egg_id"): Promise<Set<string>> {
  if (!userId) return new Set<string>();
  const rows = table === "user_trivia_progress"
    ? await sql`select trivia_id as id from user_trivia_progress where user_id = ${userId}`
    : await sql`select easter_egg_id as id from user_easter_egg_progress where user_id = ${userId}`;
  return new Set(rows.map((row: any) => String(row.id)));
}

async function readCachedEasterEggs(sql: any, tmdbId: number, mediaType: MediaType, userId?: string) {
  if (userId) {
    const rows = await sql`
      select
        tee.*,
        coalesce(uep.status, 'not_started') as user_status,
        uep.answer as submitted_answer,
        uep.is_correct,
        coalesce(uep.hint_used, false) as hint_used,
        uep.started_at,
        uep.completed_at
      from title_easter_eggs tee
      left join user_easter_egg_progress uep on uep.easter_egg_id = tee.id and uep.user_id = ${userId}
      where tee.tmdb_id = ${tmdbId}
        and tee.media_type = ${mediaType}
        and tee.status in ('approved', 'auto_generated')
        and tee.report_count < ${REPORT_THRESHOLD}
      order by tee.confidence desc, tee.created_at asc
      limit 8
    `;
    return rows.map((row: any) => mapEasterEgg(row));
  }

  const rows = await sql`
    select *
    from title_easter_eggs
    where tmdb_id = ${tmdbId}
      and media_type = ${mediaType}
      and status in ('approved', 'auto_generated')
      and report_count < ${REPORT_THRESHOLD}
    order by confidence desc, created_at asc
    limit 8
  `;
  return rows.map((row: any) => mapEasterEgg(row));
}

async function loadTitleDetails(sql: any, tmdbId: number, mediaType: MediaType) {
  const catalogItem = await getCatalogMediaItem(sql, tmdbId, mediaType);
  const catalogDetails = catalogItem ? mapCatalogDetails(catalogItem) : null;
  if (catalogDetails && ((catalogDetails.genres || []).length > 0 || catalogDetails.releaseYear || catalogDetails.seasonCount)) {
    return catalogDetails;
  }

  const cached = await sql`
    select response_json
    from tmdb_movie_cache
    where tmdb_id = ${tmdbId}
      and media_type = ${mediaType}
      and expires_at > now()
    order by created_at desc
    limit 1
  `;
  if (cached[0]?.response_json) {
    await upsertMediaItem(sql, cached[0].response_json);
    return cached[0].response_json;
  }

  const details = await fetchTmdbMovieDetails(tmdbId, mediaType);
  await upsertMediaItem(sql, details);
  await sql`
    insert into tmdb_movie_cache (tmdb_id, media_type, response_json, expires_at)
    values (${tmdbId}, ${mediaType}, ${JSON.stringify(details)}::jsonb, now() + (30 * interval '1 day'))
    on conflict (media_type, tmdb_id)
    do update set
      response_json = excluded.response_json,
      created_at = now(),
      expires_at = excluded.expires_at
  `;
  return details;
}

async function saveGeneratedTriviaSet(sql: any, pack: OpenAITriviaPack, details: any, options: {
  questionCount: number;
  spoilerMode: boolean;
  model?: string;
  generatedBy?: string;
  sourceLabels?: string[];
  sourceUrls?: string[];
  confidence?: number;
}) {
  const year = getTriviaReleaseYear(details);
  const model = options.model || process.env.OPENAI_TRIVIA_MODEL || "gpt-4.1-mini";
  const generatedBy = options.generatedBy || "openai";
  const sourceLabels = options.sourceLabels || ["Generated trivia pack", "Flim trivia specialist prompt"];
  const sourceUrls = options.sourceUrls || SOURCE_URLS;
  const confidence = options.confidence || 0.88;
  logTriviaPipeline("generation_save_started", {
    tmdbId: pack.tmdbId,
    mediaType: pack.mediaType,
    questionCount: pack.questions.length,
    generatedBy,
  });
  const setRows = await sql`
    insert into trivia_sets (
      tmdb_id,
      media_type,
      title,
      year,
      spoiler_mode,
      question_count,
      prompt_version,
      generated_by,
      model,
      status,
      error,
      updated_at
    )
    values (
      ${pack.tmdbId},
      ${pack.mediaType},
      ${pack.title},
      ${year || null},
      ${options.spoilerMode},
      ${options.questionCount},
      ${TRIVIA_VERSION},
      ${generatedBy},
      ${model},
      'ready',
      null,
      now()
    )
    on conflict (tmdb_id, media_type, spoiler_mode, question_count, prompt_version)
    do update set
      title = excluded.title,
      year = excluded.year,
      generated_by = excluded.generated_by,
      model = excluded.model,
      status = 'ready',
      error = null,
      updated_at = now()
    returning id
  `;
  const triviaSetId = setRows[0]?.id;
  if (!triviaSetId) throw new Error("Unable to save trivia set.");

  await sql`delete from trivia_questions where trivia_set_id = ${triviaSetId}`;

  for (const [index, question] of pack.questions.entries()) {
    const sourceHash = `${TRIVIA_VERSION}:${question.difficulty}:${hashSource({
      mediaType: pack.mediaType,
      tmdbId: pack.tmdbId,
      title: pack.title,
      question: question.question,
      answer: question.correctAnswer,
      version: TRIVIA_VERSION,
    })}`;
    await sql`
      insert into trivia_questions (
        trivia_set_id,
        tmdb_id,
        media_type,
        question_order,
        category,
        difficulty,
        question,
        choices,
        correct_answer,
        explanation,
        spoiler,
        source_hash,
        updated_at
      )
      values (
        ${triviaSetId},
        ${pack.tmdbId},
        ${pack.mediaType},
        ${index + 1},
        ${question.category},
        ${question.difficulty},
        ${question.question},
        ${JSON.stringify(question.choices)}::jsonb,
        ${question.correctAnswer},
        ${question.explanation},
        ${question.spoiler},
        ${sourceHash},
        now()
      )
    `;

    await sql`
      insert into title_trivia (
        tmdb_id,
        media_type,
        source_hash,
        question,
        answer,
        options,
        explanation,
        difficulty,
        spoiler_level,
        source_urls,
        source_labels,
        confidence,
        status,
        updated_at
      )
      values (
        ${pack.tmdbId},
        ${pack.mediaType},
        ${sourceHash},
        ${question.question},
        ${question.correctAnswer},
        ${JSON.stringify(question.choices)}::jsonb,
      ${question.explanation},
      ${question.difficulty},
      ${question.spoiler ? "minor" : "none"},
      ${JSON.stringify(sourceUrls)}::jsonb,
      ${JSON.stringify(sourceLabels)}::jsonb,
      ${confidence},
      'auto_generated',
      now()
      )
      on conflict (media_type, tmdb_id, source_hash, question)
      do update set
        answer = excluded.answer,
        options = excluded.options,
        explanation = excluded.explanation,
        difficulty = excluded.difficulty,
        spoiler_level = excluded.spoiler_level,
        source_urls = excluded.source_urls,
        source_labels = excluded.source_labels,
        confidence = excluded.confidence,
        status = excluded.status,
        updated_at = now()
      where title_trivia.status <> 'approved'
    `;
  }

  logTriviaPipeline("generation_save_completed", {
    tmdbId: pack.tmdbId,
    mediaType: pack.mediaType,
    questionCount: pack.questions.length,
    triviaSetId,
    generatedBy,
  });
  return triviaSetId;
}

async function generateAndStoreTrivia(sql: any, tmdbId: number, mediaType: MediaType, userId?: string, input: { questionCount?: number; spoilerMode?: boolean; forceRefresh?: boolean } = {}) {
  logTriviaPipeline("generation_request_received", {
    tmdbId,
    mediaType,
    forceRefresh: Boolean(input.forceRefresh),
    requestedCount: input.questionCount || TRIVIA_TARGET_COUNT,
  });
  const details = await loadTitleDetails(sql, tmdbId, mediaType);
  logTriviaPipeline("generation_title_metadata_loaded", {
    tmdbId,
    mediaType,
    title: details?.title || details?.name || null,
    hasOverview: Boolean(details?.overview || details?.description),
    castCount: Array.isArray(details?.cast) ? details.cast.length : 0,
  });
  const questionCount = Math.max(TRIVIA_TARGET_COUNT, Math.min(100, Number(input.questionCount || TRIVIA_TARGET_COUNT)));
  const spoilerMode = Boolean(input.spoilerMode);
  let pack: OpenAITriviaPack | null = null;
  let providerError: unknown = null;

  if (triviaProviderApiKey()) {
    try {
      pack = await callOpenAITrivia({ ...details, mediaType, tmdbId }, { questionCount, spoilerMode });
    } catch (error) {
      providerError = error;
      logTriviaPipeline("generation_provider_failed_before_save", {
        tmdbId,
        mediaType,
        reason: error instanceof Error ? error.message : "unknown_generation_error",
      });
    }
  } else {
    providerError = new Error("OpenAI trivia generation is not configured.");
    logTriviaPipeline("generation_provider_unconfigured", {
      tmdbId,
      mediaType,
      requiredEnv: "FLIM_Trivia_API_KEY",
    });
  }

  if (!pack) {
    pack = buildCuratedGeneratedPack({ ...details, mediaType, tmdbId }, { questionCount, spoilerMode });
    if (pack) {
      logTriviaPipeline("generation_curated_fallback_selected", {
        tmdbId,
        mediaType,
        questionCount: pack.questions.length,
      });
    }
  }

  if (!pack) {
    throw providerError instanceof Error ? providerError : new Error("Trivia generation failed before a pack could be created.");
  }

  if (input.forceRefresh) {
    await sql`
      update title_trivia
      set status = 'hidden', updated_at = now()
      where tmdb_id = ${tmdbId}
        and media_type = ${mediaType}
        and source_hash like ${`${TRIVIA_VERSION}:%`}
        and status = 'auto_generated'
    `;
  }
  const isCuratedFallback = !triviaProviderApiKey() || Boolean(providerError);
  await saveGeneratedTriviaSet(sql, pack, details, {
    questionCount: pack.questions.length,
    spoilerMode,
    generatedBy: isCuratedFallback ? "curated_fallback" : "openai",
    model: isCuratedFallback ? "flim-curated-fallback-v1" : undefined,
    sourceLabels: isCuratedFallback ? CURATED_SOURCE_LABELS : undefined,
    sourceUrls: isCuratedFallback ? CURATED_SOURCE_URLS : undefined,
    confidence: isCuratedFallback ? 0.9 : undefined,
  });
  return readCachedTrivia(sql, tmdbId, mediaType, userId, details);
}

async function updateTriviaJob(sql: any, tmdbId: number, mediaType: MediaType, status: TriviaGenerationStatus, input: { interestSource?: string; questionCount?: number; error?: string | null } = {}) {
  logTriviaPipeline("status_update", {
    tmdbId,
    mediaType,
    status,
    questionCount: input.questionCount || 0,
    interestSource: input.interestSource || "unknown",
    hasError: Boolean(input.error),
  });
  await sql`
    insert into trivia_generation_jobs (
      tmdb_id,
      media_type,
      language,
      version,
      status,
      interest_source,
      requested_count,
      question_count,
      error,
      updated_at
    )
    values (
      ${tmdbId},
      ${mediaType},
      'en',
      ${TRIVIA_VERSION},
      ${status},
      ${input.interestSource || "unknown"},
      ${TRIVIA_TARGET_COUNT},
      ${input.questionCount || 0},
      ${input.error || null},
      now()
    )
    on conflict (media_type, tmdb_id, language, version)
    do update set
      status = excluded.status,
      interest_source = case when trivia_generation_jobs.interest_source = 'unknown' then excluded.interest_source else trivia_generation_jobs.interest_source end,
      requested_count = excluded.requested_count,
      question_count = greatest(trivia_generation_jobs.question_count, excluded.question_count),
      error = excluded.error,
      updated_at = now()
  `;
}

async function readTriviaJob(sql: any, tmdbId: number, mediaType: MediaType) {
  const rows = await sql`
    select status, question_count, error, updated_at
    from trivia_generation_jobs
    where tmdb_id = ${tmdbId}
      and media_type = ${mediaType}
      and language = 'en'
      and version = ${TRIVIA_VERSION}
    limit 1
  `;
  return rows[0] || null;
}

async function ensureTriviaPack(sql: any, tmdbId: number, mediaType: MediaType, input: { userId?: string; interestSource?: string; questionCount?: number; spoilerMode?: boolean; forceRefresh?: boolean } = {}) {
  const existing = await readCachedTrivia(sql, tmdbId, mediaType, input.userId);
  logTriviaPipeline("cache_checked", {
    tmdbId,
    mediaType,
    questionCount: existing.length,
    minimum: TRIVIA_MIN_READY_COUNT,
  });
  if (!input.forceRefresh && existing.length >= TRIVIA_MIN_READY_COUNT) {
    await updateTriviaJob(sql, tmdbId, mediaType, "ready", { interestSource: input.interestSource, questionCount: existing.length, error: null });
    return existing;
  }

  const currentJob = await readTriviaJob(sql, tmdbId, mediaType);
  if (!input.forceRefresh && currentJob && ["queued", "generating", "ready", "insufficient_source"].includes(String(currentJob.status))) {
    logTriviaPipeline("generation_skipped_existing_status", {
      tmdbId,
      mediaType,
      status: currentJob.status,
      questionCount: existing.length,
    });
    return existing;
  }

  const details = await loadTitleDetails(sql, tmdbId, mediaType);
  const sourceAvailability = evaluateTriviaSourceAvailability({ ...details, mediaType, tmdbId });
  logTriviaPipeline("source_sufficiency_checked", {
    tmdbId,
    mediaType,
    sufficient: sourceAvailability.sufficient,
    reason: sourceAvailability.reason,
    curatedCount: sourceAvailability.curatedCount,
    released: sourceAvailability.released,
    overviewLength: sourceAvailability.overviewLength,
    castCount: sourceAvailability.castCount,
    crewCount: sourceAvailability.crewCount,
  });
  if (!sourceAvailability.sufficient) {
    await updateTriviaJob(sql, tmdbId, mediaType, "insufficient_source", {
      interestSource: input.interestSource,
      questionCount: existing.length,
      error: sourceAvailability.reason,
    });
    return existing;
  }

  await updateTriviaJob(sql, tmdbId, mediaType, "generating", { interestSource: input.interestSource, questionCount: existing.length, error: null });
  try {
    const generated = await generateAndStoreTrivia(sql, tmdbId, mediaType, input.userId, {
      questionCount: input.questionCount,
      spoilerMode: input.spoilerMode,
      forceRefresh: input.forceRefresh,
    });
    await updateTriviaJob(sql, tmdbId, mediaType, generated.length >= TRIVIA_MIN_READY_COUNT ? "ready" : "failed", {
      interestSource: input.interestSource,
      questionCount: generated.length,
      error: generated.length >= TRIVIA_MIN_READY_COUNT ? null : "Not enough sourced movie-fan trivia is available for this title yet.",
    });
    logTriviaPipeline(generated.length >= TRIVIA_MIN_READY_COUNT ? "generation_completed" : "generation_failed_minimum", {
      tmdbId,
      mediaType,
      questionCount: generated.length,
      minimum: TRIVIA_MIN_READY_COUNT,
    });
    return generated;
  } catch (error) {
    logTriviaPipeline("generation_failed", {
      tmdbId,
      mediaType,
      reason: error instanceof Error ? error.message : "unknown_generation_error",
    });
    await updateTriviaJob(sql, tmdbId, mediaType, "failed", {
      interestSource: input.interestSource,
      questionCount: existing.length,
      error: publicTriviaGenerationMessage(error),
    });
    throw error;
  }
}

async function generateAndStoreEasterEggs(sql: any, tmdbId: number, mediaType: MediaType, details?: any, userId?: string) {
  const titleDetails = details || await loadTitleDetails(sql, tmdbId, mediaType);
  const sourceHash = hashSource({
    mediaType,
    tmdbId,
    title: titleDetails.title,
    genres: titleDetails.genres || [],
    releaseYear: titleDetails.releaseYear || titleDetails.firstAirYear,
    curatedVersion: mediaType === "movie" && tmdbId === 105 ? "bttf-v1" : mediaType === "movie" && tmdbId === 329 ? "jurassic-park-v1" : "no-hunts-v1",
  });
  const drafts = generateEasterEggHunts(titleDetails);

  for (const draft of drafts) {
    await sql`
      insert into title_easter_eggs (
        tmdb_id,
        media_type,
        source_hash,
        title,
        prompt,
        hint,
        answer,
        explanation,
        difficulty,
        spoiler_level,
        source_urls,
        source_labels,
        confidence,
        status,
        updated_at
      )
      values (
        ${tmdbId},
        ${mediaType},
        ${sourceHash},
        ${draft.title},
        ${draft.prompt},
        ${draft.hint},
        ${draft.answer},
        ${draft.explanation},
        ${draft.difficulty},
        ${draft.spoilerLevel},
        ${JSON.stringify(draft.sourceUrls)}::jsonb,
        ${JSON.stringify(draft.sourceLabels)}::jsonb,
        ${draft.confidence},
        'auto_generated',
        now()
      )
      on conflict (media_type, tmdb_id, source_hash, prompt)
      do update set
        title = excluded.title,
        hint = excluded.hint,
        answer = excluded.answer,
        explanation = excluded.explanation,
        difficulty = excluded.difficulty,
        spoiler_level = excluded.spoiler_level,
        source_urls = excluded.source_urls,
        source_labels = excluded.source_labels,
        confidence = excluded.confidence,
        updated_at = now()
      where title_easter_eggs.status <> 'approved'
    `;
  }

  return readCachedEasterEggs(sql, tmdbId, mediaType, userId);
}

function progressSummary(questionCount: number, completedTriviaCount: number, huntCount: number, completedHuntCount: number) {
  const total = questionCount + huntCount;
  const completed = completedTriviaCount + completedHuntCount;
  return {
    triviaCompleted: completedTriviaCount,
    triviaTotal: questionCount,
    easterEggsCompleted: completedHuntCount,
    easterEggsTotal: huntCount,
    completionPercent: total > 0 ? Math.round((completed / total) * 100) : 0,
  };
}

function normalizeAnswer(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isHuntAnswerCorrect(expected: string, submitted: string) {
  const expectedNormalized = normalizeAnswer(expected);
  const submittedNormalized = normalizeAnswer(submitted);
  if (!submittedNormalized) return false;
  if (expectedNormalized === submittedNormalized) return true;
  if (expectedNormalized.includes(submittedNormalized) && submittedNormalized.length >= 8) return true;
  if (submittedNormalized.includes(expectedNormalized) && expectedNormalized.length >= 8) return true;
  return expectedNormalized
    .split(" ")
    .filter((word) => word.length >= 4)
    .some((word) => submittedNormalized.includes(word));
}

async function readHuntResponse(sql: any, userId: string, tmdbId: number, mediaType: MediaType) {
  const [questions, hunts] = await Promise.all([
    readCachedTrivia(sql, tmdbId, mediaType, userId),
    readCachedEasterEggs(sql, tmdbId, mediaType, userId),
  ]);
  const unlockedAchievements = await evaluateAchievements(sql, userId);
  const achievementState = await readAchievementState(sql, userId);
  const completedTriviaCount = questions.filter((question: any) => question.completed).length;
  const completedHuntCount = hunts.filter((hunt: any) => hunt.completed).length;
  return {
    questions,
    hunts,
    progress: progressSummary(questions.length, completedTriviaCount, hunts.length, completedHuntCount),
    achievements: achievementState.achievements,
    unlockedAchievements,
  };
}

async function handleGet(request: any, response: any) {
  const mediaType = normalizeMediaType(Array.isArray(request.query.mediaType) ? request.query.mediaType[0] : request.query.mediaType);
  const tmdbId = Number(Array.isArray(request.query.tmdbId) ? request.query.tmdbId[0] : request.query.tmdbId);
  const questionCount = Math.max(TRIVIA_MIN_READY_COUNT, Math.min(100, Number(Array.isArray(request.query.questionCount) ? request.query.questionCount[0] : request.query.questionCount) || TRIVIA_TARGET_COUNT));
  const spoilerMode = String(Array.isArray(request.query.spoilerMode) ? request.query.spoilerMode[0] : request.query.spoilerMode || "false") === "true";
  const forceRefresh = String(Array.isArray(request.query.forceRefresh) ? request.query.forceRefresh[0] : request.query.forceRefresh || "false") === "true";
  if (!Number.isFinite(tmdbId)) return sendJson(response, 400, { error: "A valid tmdbId is required." });
  logTriviaPipeline("feed_request_received", {
    tmdbId,
    mediaType,
    questionCount,
    forceRefresh,
  });

  const sql = db();
  await ensureTmdbCacheTables(sql);
  await ensureTriviaTables(sql);
  const user = await getCurrentUser(sql, request);
  await checkRateLimit(sql, request, "trivia:get", user?.id, user ? 120 : 40, 60);

  let questions = await readCachedTrivia(sql, tmdbId, mediaType, user?.id);
  let hunts = await readCachedEasterEggs(sql, tmdbId, mediaType, user?.id);
  let job = await readTriviaJob(sql, tmdbId, mediaType);
  let source: "cache" | "curated_pack" | "none" = questions.length >= TRIVIA_MIN_READY_COUNT || hunts.length ? "cache" : "none";
  let generatedTriviaThisRequest = false;

  try {
    if (forceRefresh || questions.length < TRIVIA_MIN_READY_COUNT || hunts.length === 0) {
      const details = await loadTitleDetails(sql, tmdbId, mediaType);
      if (forceRefresh || questions.length < TRIVIA_MIN_READY_COUNT) {
        questions = await ensureTriviaPack(sql, tmdbId, mediaType, { userId: user?.id, interestSource: "trivia_page", questionCount, spoilerMode, forceRefresh });
        generatedTriviaThisRequest = true;
      }
      if (hunts.length === 0) hunts = await generateAndStoreEasterEggs(sql, tmdbId, mediaType, details, user?.id);
      job = await readTriviaJob(sql, tmdbId, mediaType);
      source = questions.length >= TRIVIA_MIN_READY_COUNT || hunts.length ? generatedTriviaThisRequest ? "curated_pack" : "cache" : "none";
    }
    const completedTriviaCount = questions.filter((question: any) => question.completed).length;
    const completedHuntCount = hunts.filter((hunt: any) => hunt.completed).length;
    const achievementState = await readAchievementState(sql, user?.id);
    const generationStatus = questions.length >= TRIVIA_MIN_READY_COUNT ? "ready" : job?.status || "missing";
    response.setHeader("X-Flim-Trivia-Cache", source === "cache" ? "HIT" : "MISS");
    response.setHeader("X-Flim-Trivia-Version", TRIVIA_VERSION);
    return sendJson(response, 200, {
      tmdbId,
      mediaType,
      availabilityKnown: questions.length > 0 || hunts.length > 0,
      source,
      generationStatus,
      questions,
      easterEggs: hunts,
      progress: progressSummary(questions.length, completedTriviaCount, hunts.length, completedHuntCount),
      achievements: achievementState.achievements,
      unlockedAchievements: achievementState.unlocked,
      authenticated: Boolean(user),
      notes: triviaFeedNote(generationStatus, questions.length >= TRIVIA_MIN_READY_COUNT || hunts.length > 0),
    });
  } catch (error) {
    console.warn("[trivia] feed generation failed", {
      tmdbId,
      mediaType,
      version: TRIVIA_VERSION,
      error: error instanceof Error ? error.message : "Unknown trivia generation error",
    });
    const completedTriviaCount = questions.filter((question: any) => question.completed).length;
    const completedHuntCount = hunts.filter((hunt: any) => hunt.completed).length;
    if (questions.length > 0 || hunts.length > 0) {
      const achievementState = await readAchievementState(sql, user?.id);
      response.setHeader("X-Flim-Trivia-Cache", "STALE");
      response.setHeader("X-Flim-Trivia-Version", TRIVIA_VERSION);
      return sendJson(response, 200, {
        tmdbId,
        mediaType,
        availabilityKnown: true,
        source: "cache",
        generationStatus: questions.length >= TRIVIA_MIN_READY_COUNT ? "ready" : "failed",
        questions,
        easterEggs: hunts,
        progress: progressSummary(questions.length, completedTriviaCount, hunts.length, completedHuntCount),
        achievements: achievementState.achievements,
        unlockedAchievements: achievementState.unlocked,
        authenticated: Boolean(user),
        notes: "Using cached trivia while the latest pack is being prepared.",
        error: publicTriviaGenerationMessage(error),
      });
    }
    response.setHeader("X-Flim-Trivia-Cache", "MISS");
    response.setHeader("X-Flim-Trivia-Version", TRIVIA_VERSION);
    return sendJson(response, 200, {
      tmdbId,
      mediaType,
      availabilityKnown: false,
      source: "none",
      generationStatus: "failed",
      questions: [],
      easterEggs: [],
      progress: progressSummary(0, 0, 0, 0),
      achievements: [],
      unlockedAchievements: [],
      authenticated: Boolean(user),
      notes: publicTriviaGenerationMessage(error),
      error: publicTriviaGenerationMessage(error),
    });
  }
}

async function handleReport(request: any, response: any) {
  const body = await readBody(request);
  const triviaId = String(body.triviaId || "").trim();
  const easterEggId = String(body.easterEggId || "").trim();
  const reason = String(body.reason || "").trim();
  const allowedReasons = new Set(["wrong_answer", "confusing", "spoiler", "low_quality", "inappropriate"]);
  if ((!triviaId && !easterEggId) || !allowedReasons.has(reason)) return sendJson(response, 400, { error: "A valid item id and reason are required." });

  const sql = db();
  await ensureTriviaTables(sql);
  const user = await getCurrentUser(sql, request);
  if (!user) return sendJson(response, 401, { error: "Sign in to report trivia quality issues." });
  await checkRateLimit(sql, request, "trivia:report", user.id, 20, 60 * 60);

  if (easterEggId) {
    const inserted = await sql`
      insert into title_easter_egg_reports (easter_egg_id, user_id, reason)
      values (${easterEggId}, ${user.id}, ${reason})
      on conflict (easter_egg_id, user_id) do nothing
      returning id
    `;
    if (!inserted[0]) {
      const current = await sql`select report_count, status from title_easter_eggs where id = ${easterEggId} limit 1`;
      return sendJson(response, 200, { ok: true, duplicate: true, reportCount: Number(current[0]?.report_count || 0), status: current[0]?.status || "unknown" });
    }
    const rows = await sql`
      update title_easter_eggs
      set
        report_count = report_count + 1,
        status = case when report_count + 1 >= ${REPORT_THRESHOLD} then 'hidden' else status end,
        updated_at = now()
      where id = ${easterEggId}
      returning report_count, status
    `;

    return sendJson(response, 200, { ok: true, reportCount: Number(rows[0]?.report_count || 0), status: rows[0]?.status || "unknown" });
  }

  const inserted = await sql`
    insert into title_trivia_reports (trivia_id, user_id, reason)
    values (${triviaId}, ${user.id}, ${reason})
    on conflict (trivia_id, user_id) do nothing
    returning id
  `;
  if (!inserted[0]) {
    const current = await sql`select report_count, status from title_trivia where id = ${triviaId} limit 1`;
    return sendJson(response, 200, { ok: true, duplicate: true, reportCount: Number(current[0]?.report_count || 0), status: current[0]?.status || "unknown" });
  }
  const rows = await sql`
    update title_trivia
    set
      report_count = report_count + 1,
      status = case when report_count + 1 >= ${REPORT_THRESHOLD} then 'hidden' else status end,
      updated_at = now()
    where id = ${triviaId}
    returning report_count, status
  `;

  return sendJson(response, 200, { ok: true, reportCount: Number(rows[0]?.report_count || 0), status: rows[0]?.status || "unknown" });
}

async function handleInterest(request: any, response: any) {
  const body = await readBody(request);
  const mediaType = normalizeMediaType(body.mediaType);
  const tmdbId = Number(body.tmdbId);
  const interestSource = String(body.source || "unknown").slice(0, 80);
  if (!Number.isFinite(tmdbId)) return sendJson(response, 400, { error: "A valid tmdbId is required." });
  logTriviaPipeline("interest_request_received", {
    tmdbId,
    mediaType,
    interestSource,
  });

  const sql = db();
  await ensureTmdbCacheTables(sql);
  await ensureTriviaTables(sql);
  const user = await getCurrentUser(sql, request);
  await checkRateLimit(sql, request, "trivia:interest", user?.id, user ? 180 : 60, 60);

  const cached = await readCachedTrivia(sql, tmdbId, mediaType, user?.id);
  if (cached.length >= TRIVIA_MIN_READY_COUNT) {
    await updateTriviaJob(sql, tmdbId, mediaType, "ready", { interestSource, questionCount: cached.length, error: null });
    return sendJson(response, 202, { ok: true, generationStatus: "ready", questionCount: cached.length });
  }

  await updateTriviaJob(sql, tmdbId, mediaType, "queued", { interestSource, questionCount: cached.length, error: null });

  try {
    const questions = await ensureTriviaPack(sql, tmdbId, mediaType, { userId: user?.id, interestSource });
    return sendJson(response, 202, {
      ok: true,
      generationStatus: questions.length >= TRIVIA_MIN_READY_COUNT ? "ready" : "failed",
      questionCount: questions.length,
    });
  } catch (error) {
    return sendJson(response, 202, {
      ok: false,
      generationStatus: "failed",
      questionCount: cached.length,
      error: publicTriviaGenerationMessage(error),
    });
  }
}

async function handleHuntAction(request: any, response: any) {
  const body = await readBody(request);
  const huntId = String(body.huntId || body.easterEggId || "").trim();
  const action = String(body.action || "").trim();
  const submittedAnswer = String(body.answer || "").trim();
  const allowedActions = new Set(["start", "hint", "answer", "complete"]);
  if (!huntId || !allowedActions.has(action)) return sendJson(response, 400, { error: "A valid hunt action is required." });

  const sql = db();
  await ensureTriviaTables(sql);
  const user = await getCurrentUser(sql, request);
  if (!user) return sendJson(response, 401, { error: "Sign in to save Easter Egg Hunt progress." });
  await checkRateLimit(sql, request, "trivia:hunt", user.id, 120, 60);

  const rows = await sql`
    select id, tmdb_id, media_type, answer
    from title_easter_eggs
    where id = ${huntId}
      and status in ('approved', 'auto_generated')
      and report_count < ${REPORT_THRESHOLD}
    limit 1
  `;
  const hunt = rows[0];
  if (!hunt) return sendJson(response, 404, { error: "Easter Egg Hunt not found." });

  const mediaType = normalizeMediaType(hunt.media_type);
  const answerIsCorrect = action === "answer" ? isHuntAnswerCorrect(hunt.answer || "", submittedAnswer) : action === "complete" ? true : null;
  const nextStatus = action === "complete" || answerIsCorrect ? "completed" : action === "answer" ? "answered" : action === "hint" ? "hint_used" : "started";
  const shouldComplete = nextStatus === "completed";

  await sql`
    insert into user_easter_egg_progress (
      user_id,
      easter_egg_id,
      tmdb_id,
      media_type,
      status,
      answer,
      is_correct,
      hint_used,
      started_at,
      completed_at
    )
    values (
      ${user.id},
      ${hunt.id},
      ${hunt.tmdb_id},
      ${hunt.media_type},
      ${nextStatus},
      ${submittedAnswer || null},
      ${answerIsCorrect},
      ${action === "hint"},
      now(),
      case when ${shouldComplete} then now() else null end
    )
    on conflict (user_id, easter_egg_id) do update set
      status = case
        when user_easter_egg_progress.status = 'completed' then 'completed'
        else excluded.status
      end,
      answer = coalesce(excluded.answer, user_easter_egg_progress.answer),
      is_correct = coalesce(excluded.is_correct, user_easter_egg_progress.is_correct),
      hint_used = user_easter_egg_progress.hint_used or excluded.hint_used,
      completed_at = case
        when user_easter_egg_progress.completed_at is not null then user_easter_egg_progress.completed_at
        when excluded.status = 'completed' then now()
        else null
      end
  `;

  const ticketAward = shouldComplete
    ? await awardTickets(sql, {
      userId: user.id,
      ruleKey: "easter_egg_found",
      sourceType: "easter_egg",
      sourceId: hunt.id,
      metadata: { mediaType, tmdbId: Number(hunt.tmdb_id), action },
    })
    : null;
  const payload = await readHuntResponse(sql, user.id, Number(hunt.tmdb_id), mediaType);
  return sendJson(response, 200, {
    ok: true,
    huntId,
    action,
    isCorrect: answerIsCorrect,
    progress: payload.progress,
    achievements: payload.achievements,
    unlockedAchievements: payload.unlockedAchievements,
    easterEggs: payload.hunts,
    questions: payload.questions,
    ticketAward,
  });
}

async function handleComplete(request: any, response: any) {
  const body = await readBody(request);
  const itemType = String(body.itemType || "");
  const itemId = String(body.itemId || "").trim();
  const sql = db();
  await ensureTriviaTables(sql);
  const user = await getCurrentUser(sql, request);
  if (!user) return sendJson(response, 401, { error: "Sign in to save trivia progress." });
  await checkRateLimit(sql, request, "trivia:complete", user.id, 120, 60);
  if (!itemId || !["trivia", "easter_egg"].includes(itemType)) return sendJson(response, 400, { error: "A valid completion item is required." });

  let item: any;
  if (itemType === "trivia") {
    const rows = await sql`
      select id, tmdb_id, media_type
      from title_trivia
      where id = ${itemId}
        and status in ('approved', 'auto_generated')
        and report_count < ${REPORT_THRESHOLD}
      limit 1
    `;
    item = rows[0];
    if (!item) return sendJson(response, 404, { error: "Trivia question not found." });
    await sql`
      insert into user_trivia_progress (user_id, trivia_id, tmdb_id, media_type, completed_at)
      values (${user.id}, ${item.id}, ${item.tmdb_id}, ${item.media_type}, now())
      on conflict (user_id, trivia_id) do update set completed_at = excluded.completed_at
    `;
  } else {
    const rows = await sql`
      select id, tmdb_id, media_type
      from title_easter_eggs
      where id = ${itemId}
        and status in ('approved', 'auto_generated')
        and report_count < ${REPORT_THRESHOLD}
      limit 1
    `;
    item = rows[0];
    if (!item) return sendJson(response, 404, { error: "Easter Egg Hunt not found." });
    await sql`
      insert into user_easter_egg_progress (user_id, easter_egg_id, tmdb_id, media_type, status, is_correct, started_at, completed_at)
      values (${user.id}, ${item.id}, ${item.tmdb_id}, ${item.media_type}, 'completed', true, now(), now())
      on conflict (user_id, easter_egg_id) do update set
        status = 'completed',
        is_correct = true,
        completed_at = coalesce(user_easter_egg_progress.completed_at, now())
    `;
  }

  const mediaType = normalizeMediaType(item.media_type);
  const ticketAward = await awardTickets(sql, {
    userId: user.id,
    ruleKey: itemType === "trivia" ? "trivia_completed" : "easter_egg_found",
    sourceType: itemType,
    sourceId: item.id,
    metadata: { mediaType, tmdbId: Number(item.tmdb_id) },
  });
  const [questions, hunts] = await Promise.all([
    readCachedTrivia(sql, Number(item.tmdb_id), mediaType, user.id),
    readCachedEasterEggs(sql, Number(item.tmdb_id), mediaType, user.id),
  ]);
  const unlockedAchievements = await evaluateAchievements(sql, user.id);
  const achievementState = await readAchievementState(sql, user.id);
  const completedTriviaCount = questions.filter((question: any) => question.completed).length;
  const completedHuntCount = hunts.filter((hunt: any) => hunt.completed).length;

  return sendJson(response, 200, {
    ok: true,
    itemType,
    itemId,
    progress: progressSummary(questions.length, completedTriviaCount, hunts.length, completedHuntCount),
    achievements: achievementState.achievements,
    unlockedAchievements,
    ticketAward,
  });
}

export default async function handler(request: any, response: any) {
  try {
    const path = triviaPath(request);
    if (request.method === "GET") return handleGet(request, response);
    if (request.method === "POST" && path === "interest") return handleInterest(request, response);
    if (request.method === "POST" && path === "hunt") return handleHuntAction(request, response);
    if (request.method === "POST" && path === "complete") return handleComplete(request, response);
    if (request.method === "POST" && path === "report") return handleReport(request, response);
    return sendJson(response, 405, { error: "Method not allowed." });
  } catch (error) {
    return sendJson(response, errorStatus(error), { error: error instanceof Error ? error.message : "Trivia request failed." });
  }
}
