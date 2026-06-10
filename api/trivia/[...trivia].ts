import { createHash } from "node:crypto";
import { db, ensureTriviaTables, getCurrentUser, readBody, sendJson } from "../_db.js";
import { getCatalogMediaItem, mapCatalogDetails, upsertMediaItem } from "../_mediaCatalog.js";
import { ensureTmdbCacheTables, fetchTmdbMovieDetails } from "../_tmdb.js";

type MediaType = "movie" | "tv";

interface TriviaDraft {
  question: string;
  answer: string;
  options: string[];
  explanation: string;
  difficulty: "easy" | "medium";
  spoilerLevel: "none" | "minor";
  confidence: number;
}

const REPORT_THRESHOLD = 3;
const SOURCE_LABELS = ["TMDb metadata"];
const SOURCE_URLS = ["https://www.themoviedb.org/"];

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

function nearbyYears(year: string) {
  const numeric = Number(year);
  if (!Number.isFinite(numeric)) return ["1984", "1999", "2008"];
  return [String(numeric - 1), String(numeric + 1), String(numeric + 3)];
}

function runtimeBucket(minutes?: number) {
  if (!minutes) return "";
  if (minutes < 90) return "Under 90 minutes";
  if (minutes <= 130) return "About 90 to 130 minutes";
  return "Over 130 minutes";
}

function generateTrivia(details: any): TriviaDraft[] {
  const drafts: TriviaDraft[] = [];
  const mediaType = normalizeMediaType(details.mediaType);
  const title = details.title || "this title";
  const year = details.releaseYear || details.firstAirYear || details.releaseDate?.slice?.(0, 4);
  const genres = Array.isArray(details.genres) ? details.genres.filter(Boolean) : [];

  if (year) {
    drafts.push({
      question: `What year is ${title} associated with on Flim?`,
      answer: year,
      options: uniqueOptions(year, nearbyYears(year)),
      explanation: `${title} is listed with ${year} in the title metadata.`,
      difficulty: "easy",
      spoilerLevel: "none",
      confidence: 0.9,
    });
  }

  if (genres.length > 0) {
    drafts.push({
      question: `Which genre is listed for ${title}?`,
      answer: genres[0],
      options: uniqueOptions(genres[0], ["Comedy", "Drama", "Horror", "Science Fiction", "Family"].filter((genre) => !genres.includes(genre))),
      explanation: `${genres[0]} appears in the source metadata for ${title}.`,
      difficulty: "easy",
      spoilerLevel: "none",
      confidence: 0.86,
    });
  }

  if (mediaType === "movie" && details.runtimeMinutes) {
    const answer = runtimeBucket(details.runtimeMinutes);
    drafts.push({
      question: `What is the approximate runtime range for ${title}?`,
      answer,
      options: uniqueOptions(answer, ["Under 90 minutes", "About 90 to 130 minutes", "Over 130 minutes"]),
      explanation: `${title} is listed at ${details.runtimeMinutes} minutes.`,
      difficulty: "medium",
      spoilerLevel: "none",
      confidence: 0.82,
    });
  }

  if (mediaType === "tv" && details.seasonCount) {
    const answer = `${details.seasonCount} ${details.seasonCount === 1 ? "season" : "seasons"}`;
    drafts.push({
      question: `How many seasons are listed for ${title}?`,
      answer,
      options: uniqueOptions(answer, ["1 season", "2 seasons", "5 seasons", "10 seasons"]),
      explanation: `${title} has ${answer} in the current show metadata.`,
      difficulty: "easy",
      spoilerLevel: "none",
      confidence: 0.84,
    });
  }

  if (mediaType === "tv" && details.episodeCount) {
    const answer = `${details.episodeCount} episodes`;
    drafts.push({
      question: `How many episodes are listed for ${title}?`,
      answer,
      options: uniqueOptions(answer, ["6 episodes", "10 episodes", "24 episodes", "100 episodes"]),
      explanation: `${title} has ${answer} in the current show metadata.`,
      difficulty: "medium",
      spoilerLevel: "none",
      confidence: 0.8,
    });
  }

  if (details.contentRating) {
    drafts.push({
      question: `Which content rating is listed for ${title}?`,
      answer: details.contentRating,
      options: uniqueOptions(details.contentRating, ["G", "PG", "14A", "R", "TV-MA"]),
      explanation: `${details.contentRating} is the preferred regional rating available in the metadata.`,
      difficulty: "medium",
      spoilerLevel: "none",
      confidence: 0.78,
    });
  }

  return drafts.filter((draft) => draft.options.length >= 3).slice(0, 6);
}

function mapTrivia(row: any) {
  return {
    id: row.id,
    tmdbId: row.tmdb_id,
    mediaType: normalizeMediaType(row.media_type),
    question: row.question,
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function readCachedTrivia(sql: any, tmdbId: number, mediaType: MediaType) {
  const rows = await sql`
    select *
    from title_trivia
    where tmdb_id = ${tmdbId}
      and media_type = ${mediaType}
      and status in ('approved', 'auto_generated')
      and report_count < ${REPORT_THRESHOLD}
      and options ? answer
    order by confidence desc, created_at asc
    limit 8
  `;
  return rows.map(mapTrivia);
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

async function generateAndStoreTrivia(sql: any, tmdbId: number, mediaType: MediaType) {
  const details = await loadTitleDetails(sql, tmdbId, mediaType);
  const sourceHash = hashSource({
    mediaType,
    tmdbId,
    title: details.title,
    releaseYear: details.releaseYear || details.firstAirYear,
    runtimeMinutes: details.runtimeMinutes,
    genres: details.genres || [],
    seasonCount: details.seasonCount,
    episodeCount: details.episodeCount,
    contentRating: details.contentRating,
  });
  const drafts = generateTrivia(details);

  for (const draft of drafts) {
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
        ${tmdbId},
        ${mediaType},
        ${sourceHash},
        ${draft.question},
        ${draft.answer},
        ${JSON.stringify(draft.options)}::jsonb,
        ${draft.explanation},
        ${draft.difficulty},
        ${draft.spoilerLevel},
        ${JSON.stringify(SOURCE_URLS)}::jsonb,
        ${JSON.stringify(SOURCE_LABELS)}::jsonb,
        ${draft.confidence},
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
        updated_at = now()
    `;
  }

  return readCachedTrivia(sql, tmdbId, mediaType);
}

async function handleGet(request: any, response: any) {
  const mediaType = normalizeMediaType(Array.isArray(request.query.mediaType) ? request.query.mediaType[0] : request.query.mediaType);
  const tmdbId = Number(Array.isArray(request.query.tmdbId) ? request.query.tmdbId[0] : request.query.tmdbId);
  if (!Number.isFinite(tmdbId)) return sendJson(response, 400, { error: "A valid tmdbId is required." });

  const sql = db();
  await ensureTmdbCacheTables(sql);
  await ensureTriviaTables(sql);

  const cached = await readCachedTrivia(sql, tmdbId, mediaType);
  if (cached.length > 0) {
    response.setHeader("X-Flim-Trivia-Cache", "HIT");
    return sendJson(response, 200, {
      tmdbId,
      mediaType,
      availabilityKnown: true,
      source: "cache",
      questions: cached,
      notes: "Cached source-grounded trivia.",
    });
  }

  try {
    const generated = await generateAndStoreTrivia(sql, tmdbId, mediaType);
    response.setHeader("X-Flim-Trivia-Cache", "MISS");
    return sendJson(response, 200, {
      tmdbId,
      mediaType,
      availabilityKnown: generated.length > 0,
      source: generated.length > 0 ? "tmdb_metadata" : "none",
      questions: generated,
      notes: generated.length > 0 ? "Generated from known title metadata and cached for reuse." : "Trivia coming soon.",
    });
  } catch (error) {
    response.setHeader("X-Flim-Trivia-Cache", "MISS");
    return sendJson(response, 200, {
      tmdbId,
      mediaType,
      availabilityKnown: false,
      source: "none",
      questions: [],
      notes: "Trivia coming soon.",
      error: error instanceof Error ? error.message : "Trivia generation failed.",
    });
  }
}

async function handleReport(request: any, response: any) {
  const body = await readBody(request);
  const triviaId = String(body.triviaId || "").trim();
  const reason = String(body.reason || "").trim();
  const allowedReasons = new Set(["wrong_answer", "confusing", "spoiler", "low_quality", "inappropriate"]);
  if (!triviaId || !allowedReasons.has(reason)) return sendJson(response, 400, { error: "A valid triviaId and reason are required." });

  const sql = db();
  await ensureTriviaTables(sql);
  const user = await getCurrentUser(sql, request);

  await sql`
    insert into title_trivia_reports (trivia_id, user_id, reason)
    values (${triviaId}, ${user?.id || null}, ${reason})
  `;
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

export default async function handler(request: any, response: any) {
  try {
    const path = triviaPath(request);
    if (request.method === "GET") return handleGet(request, response);
    if (request.method === "POST" && path === "report") return handleReport(request, response);
    return sendJson(response, 405, { error: "Method not allowed." });
  } catch (error) {
    return sendJson(response, 500, { error: error instanceof Error ? error.message : "Trivia request failed." });
  }
}
