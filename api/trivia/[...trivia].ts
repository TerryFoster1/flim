import { createHash } from "node:crypto";
import { evaluateAchievements, readAchievementState } from "../_achievements.js";
import { checkRateLimit, db, ensureTriviaTables, errorStatus, getCurrentUser, readBody, sendJson } from "../_db.js";
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
const SOURCE_LABELS = ["TMDb metadata"];
const SOURCE_URLS = ["https://www.themoviedb.org/"];
const CURATED_SOURCE_LABELS = ["Flim curated companion prompt"];
const CURATED_SOURCE_URLS = ["https://www.flim.ca/"];

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

function mapTrivia(row: any, completedIds = new Set<string>()) {
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

async function readCachedTrivia(sql: any, tmdbId: number, mediaType: MediaType, userId?: string) {
  const completedIds = await readCompletedIds(sql, userId, "user_trivia_progress", "trivia_id");
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
  return rows.map((row: any) => mapTrivia(row, completedIds));
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

async function generateAndStoreTrivia(sql: any, tmdbId: number, mediaType: MediaType, userId?: string) {
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

  return readCachedTrivia(sql, tmdbId, mediaType, userId);
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
  if (!Number.isFinite(tmdbId)) return sendJson(response, 400, { error: "A valid tmdbId is required." });

  const sql = db();
  await ensureTmdbCacheTables(sql);
  await ensureTriviaTables(sql);
  const user = await getCurrentUser(sql, request);
  await checkRateLimit(sql, request, "trivia:get", user?.id, user ? 120 : 40, 60);

  let questions = await readCachedTrivia(sql, tmdbId, mediaType, user?.id);
  let hunts = await readCachedEasterEggs(sql, tmdbId, mediaType, user?.id);
  let source: "cache" | "tmdb_metadata" | "none" = questions.length || hunts.length ? "cache" : "none";

  try {
    if (questions.length === 0 || hunts.length === 0) {
      const details = await loadTitleDetails(sql, tmdbId, mediaType);
      if (questions.length === 0) questions = await generateAndStoreTrivia(sql, tmdbId, mediaType, user?.id);
      if (hunts.length === 0) hunts = await generateAndStoreEasterEggs(sql, tmdbId, mediaType, details, user?.id);
      source = questions.length || hunts.length ? "tmdb_metadata" : "none";
    }
    const completedTriviaCount = questions.filter((question: any) => question.completed).length;
    const completedHuntCount = hunts.filter((hunt: any) => hunt.completed).length;
    const achievementState = await readAchievementState(sql, user?.id);
    response.setHeader("X-Flim-Trivia-Cache", source === "cache" ? "HIT" : "MISS");
    return sendJson(response, 200, {
      tmdbId,
      mediaType,
      availabilityKnown: questions.length > 0 || hunts.length > 0,
      source,
      questions,
      easterEggs: hunts,
      progress: progressSummary(questions.length, completedTriviaCount, hunts.length, completedHuntCount),
      achievements: achievementState.achievements,
      unlockedAchievements: achievementState.unlocked,
      authenticated: Boolean(user),
      notes: questions.length || hunts.length ? "Cached companion content grounded in title metadata and curated prompts." : "Trivia coming soon.",
    });
  } catch (error) {
    response.setHeader("X-Flim-Trivia-Cache", "MISS");
    return sendJson(response, 200, {
      tmdbId,
      mediaType,
      availabilityKnown: false,
      source: "none",
      questions: [],
      easterEggs: [],
      progress: progressSummary(0, 0, 0, 0),
      achievements: [],
      unlockedAchievements: [],
      authenticated: Boolean(user),
      notes: "Trivia coming soon.",
      error: error instanceof Error ? error.message : "Trivia generation failed.",
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
  });
}

export default async function handler(request: any, response: any) {
  try {
    const path = triviaPath(request);
    if (request.method === "GET") return handleGet(request, response);
    if (request.method === "POST" && path === "hunt") return handleHuntAction(request, response);
    if (request.method === "POST" && path === "complete") return handleComplete(request, response);
    if (request.method === "POST" && path === "report") return handleReport(request, response);
    return sendJson(response, 405, { error: "Method not allowed." });
  } catch (error) {
    return sendJson(response, errorStatus(error), { error: error instanceof Error ? error.message : "Trivia request failed." });
  }
}
