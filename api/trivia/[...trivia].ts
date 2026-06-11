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

interface EasterEggDraft {
  title: string;
  prompt: string;
  hint: string;
  answer: string;
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
  const title = details.title || "this title";
  const genres = Array.isArray(details.genres) ? details.genres.filter(Boolean) : [];
  const hunts: EasterEggDraft[] = [];

  if (mediaType === "movie" && tmdbId === 105) {
    hunts.push({
      title: "Twin Pines to Lone Pine",
      prompt: "Watch for the mall sign near the beginning and again after Marty returns to 1985.",
      hint: "Pay attention to the name of the farm Marty drives through in 1955.",
      answer: "Marty runs over one of Old Man Peabody's twin pine trees, changing Twin Pines Mall into Lone Pine Mall.",
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
      difficulty: "easy",
      spoilerLevel: "minor",
      confidence: 0.88,
      sourceLabels: CURATED_SOURCE_LABELS,
      sourceUrls: CURATED_SOURCE_URLS,
    });
  }

  if (genres.includes("Science Fiction") || genres.includes("Sci-Fi")) {
    hunts.push({
      title: "Future Tech Check",
      prompt: `Watch for one piece of technology or science-fiction logic that changes how ${title}'s world works.`,
      hint: "Look for the first scene where the rules of the world feel different from real life.",
      answer: `The hunt is complete when you can name the technology or rule and explain how it changes the story.`,
      difficulty: "easy",
      spoilerLevel: "none",
      confidence: 0.76,
      sourceLabels: SOURCE_LABELS,
      sourceUrls: SOURCE_URLS,
    });
  }

  if (genres.includes("Animation") || genres.includes("Family")) {
    hunts.push({
      title: "Visual Callback",
      prompt: `Look for a repeated object, phrase, or visual gag in ${title}.`,
      hint: "Animated and family titles often use repeated details to reward close watching.",
      answer: "The hunt is complete when you can identify the repeated detail and where it returns.",
      difficulty: "easy",
      spoilerLevel: "none",
      confidence: 0.74,
      sourceLabels: SOURCE_LABELS,
      sourceUrls: SOURCE_URLS,
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
  return {
    id: row.id,
    tmdbId: row.tmdb_id,
    mediaType: normalizeMediaType(row.media_type),
    title: row.title,
    prompt: row.prompt,
    hint: row.hint || "",
    answer: row.answer,
    difficulty: row.difficulty || "easy",
    spoilerLevel: row.spoiler_level || "minor",
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

async function readCompletedIds(sql: any, userId: string | undefined, table: "user_trivia_progress" | "user_easter_egg_progress", idColumn: "trivia_id" | "easter_egg_id") {
  if (!userId) return new Set<string>();
  const rows = table === "user_trivia_progress"
    ? await sql`select trivia_id as id from user_trivia_progress where user_id = ${userId}`
    : await sql`select easter_egg_id as id from user_easter_egg_progress where user_id = ${userId}`;
  return new Set(rows.map((row: any) => String(row.id)));
}

async function readCachedEasterEggs(sql: any, tmdbId: number, mediaType: MediaType, userId?: string) {
  const completedIds = await readCompletedIds(sql, userId, "user_easter_egg_progress", "easter_egg_id");
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
  return rows.map((row: any) => mapEasterEgg(row, completedIds));
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
    curatedVersion: mediaType === "movie" && tmdbId === 105 ? "bttf-v1" : "metadata-v1",
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

async function readAchievementState(sql: any, userId?: string) {
  if (!userId) return { achievements: [], unlocked: [] };
  const rows = await sql`
    select
      a.id,
      a.name,
      a.description,
      a.badge_icon,
      a.category,
      a.goal_count,
      coalesce(ua.progress_count, 0) as progress_count,
      ua.unlocked_at
    from achievements a
    left join user_achievements ua on ua.achievement_id = a.id and ua.user_id = ${userId}
    order by a.category, a.name
  `;
  const achievements = rows.map((row: any) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    badgeIcon: row.badge_icon,
    category: row.category,
    goalCount: Number(row.goal_count || 0),
    progressCount: Number(row.progress_count || 0),
    unlockedAt: row.unlocked_at || undefined,
  }));
  return { achievements, unlocked: [] };
}

async function updateAchievements(sql: any, userId: string, tmdbId?: number, mediaType?: MediaType) {
  const [counts] = await sql`
    select
      (select count(*)::int from user_trivia_progress where user_id = ${userId}) as trivia_count,
      (select count(*)::int from user_easter_egg_progress where user_id = ${userId}) as hunt_count
  `;
  const triviaCount = Number(counts?.trivia_count || 0);
  const huntCount = Number(counts?.hunt_count || 0);
  const candidates = [
    { id: "movie_detective", progress: triviaCount, goal: 10 },
    { id: "easter_egg_hunter", progress: huntCount, goal: 5 },
  ];

  if (tmdbId === 105 && mediaType === "movie") {
    const [titleCounts] = await sql`
      select
        (select count(*)::int from title_trivia where tmdb_id = 105 and media_type = 'movie' and status in ('approved', 'auto_generated') and report_count < ${REPORT_THRESHOLD}) as trivia_total,
        (select count(*)::int from user_trivia_progress utp inner join title_trivia tt on tt.id = utp.trivia_id where utp.user_id = ${userId} and tt.tmdb_id = 105 and tt.media_type = 'movie') as trivia_done,
        (select count(*)::int from title_easter_eggs where tmdb_id = 105 and media_type = 'movie' and status in ('approved', 'auto_generated') and report_count < ${REPORT_THRESHOLD}) as hunt_total,
        (select count(*)::int from user_easter_egg_progress uep inner join title_easter_eggs tee on tee.id = uep.easter_egg_id where uep.user_id = ${userId} and tee.tmdb_id = 105 and tee.media_type = 'movie') as hunt_done
    `;
    const titleTotal = Number(titleCounts?.trivia_total || 0) + Number(titleCounts?.hunt_total || 0);
    const titleDone = Number(titleCounts?.trivia_done || 0) + Number(titleCounts?.hunt_done || 0);
    candidates.push({ id: "back_to_the_future_expert", progress: titleTotal > 0 && titleDone >= titleTotal ? 1 : 0, goal: 1 });
  }

  const unlocked: any[] = [];
  for (const candidate of candidates) {
    const rows = await sql`
      insert into user_achievements (user_id, achievement_id, progress_count, goal_count, unlocked_at, updated_at)
      values (
        ${userId},
        ${candidate.id},
        ${candidate.progress},
        ${candidate.goal},
        case when ${candidate.progress} >= ${candidate.goal} then now() else null end,
        now()
      )
      on conflict (user_id, achievement_id) do update set
        progress_count = excluded.progress_count,
        goal_count = excluded.goal_count,
        unlocked_at = case
          when user_achievements.unlocked_at is null and excluded.progress_count >= excluded.goal_count then now()
          else user_achievements.unlocked_at
        end,
        updated_at = now()
      returning achievement_id, progress_count, goal_count, unlocked_at, xmax = 0 as inserted
    `;
    const row = rows[0];
    if (row?.unlocked_at && Number(row.progress_count || 0) >= Number(row.goal_count || 0)) {
      const [achievement] = await sql`select id, name, description, badge_icon from achievements where id = ${candidate.id} limit 1`;
      if (achievement) unlocked.push({
        id: achievement.id,
        name: achievement.name,
        description: achievement.description,
        badgeIcon: achievement.badge_icon,
        unlockedAt: row.unlocked_at,
      });
    }
  }
  return unlocked;
}

async function handleGet(request: any, response: any) {
  const mediaType = normalizeMediaType(Array.isArray(request.query.mediaType) ? request.query.mediaType[0] : request.query.mediaType);
  const tmdbId = Number(Array.isArray(request.query.tmdbId) ? request.query.tmdbId[0] : request.query.tmdbId);
  if (!Number.isFinite(tmdbId)) return sendJson(response, 400, { error: "A valid tmdbId is required." });

  const sql = db();
  await ensureTmdbCacheTables(sql);
  await ensureTriviaTables(sql);
  const user = await getCurrentUser(sql, request);

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

  if (easterEggId) {
    await sql`
      insert into title_easter_egg_reports (easter_egg_id, user_id, reason)
      values (${easterEggId}, ${user?.id || null}, ${reason})
    `;
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

async function handleComplete(request: any, response: any) {
  const body = await readBody(request);
  const itemType = String(body.itemType || "");
  const itemId = String(body.itemId || "").trim();
  const sql = db();
  await ensureTriviaTables(sql);
  const user = await getCurrentUser(sql, request);
  if (!user) return sendJson(response, 401, { error: "Sign in to save trivia progress." });
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
      insert into user_easter_egg_progress (user_id, easter_egg_id, tmdb_id, media_type, completed_at)
      values (${user.id}, ${item.id}, ${item.tmdb_id}, ${item.media_type}, now())
      on conflict (user_id, easter_egg_id) do update set completed_at = excluded.completed_at
    `;
  }

  const mediaType = normalizeMediaType(item.media_type);
  const [questions, hunts] = await Promise.all([
    readCachedTrivia(sql, Number(item.tmdb_id), mediaType, user.id),
    readCachedEasterEggs(sql, Number(item.tmdb_id), mediaType, user.id),
  ]);
  const unlockedAchievements = await updateAchievements(sql, user.id, Number(item.tmdb_id), mediaType);
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
    if (request.method === "POST" && path === "complete") return handleComplete(request, response);
    if (request.method === "POST" && path === "report") return handleReport(request, response);
    return sendJson(response, 405, { error: "Method not allowed." });
  } catch (error) {
    return sendJson(response, 500, { error: error instanceof Error ? error.message : "Trivia request failed." });
  }
}
