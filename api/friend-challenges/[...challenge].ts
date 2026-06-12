import { randomBytes } from "node:crypto";
import { checkRateLimit, db, ensureTriviaTables, errorStatus, getCurrentUser, readBody, sendJson } from "../_db.js";

type MediaType = "movie" | "tv";

interface ChallengeQuestion {
  id: string;
  question: string;
  answer: string;
  options: string[];
  explanation: string;
  difficulty: string;
}

function challengePath(request: any) {
  const pathname = new URL(request.url || "", "https://www.flim.ca").pathname;
  const fromPath = pathname.split("/api/friend-challenges/").pop()?.split("?")[0];
  if (fromPath && fromPath !== pathname) return fromPath;
  const value = request.query.challenge;
  return Array.isArray(value) ? value.map(String).join("/") : String(value || "");
}

function normalizeMediaType(value: unknown): MediaType {
  return value === "tv" ? "tv" : "movie";
}

function normalizeAnswers(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, answer]) => [String(key), String(answer || "")]),
  );
}

function publicName(user: any, fallback = "A Flim player") {
  return String(user?.display_name || user?.handle || user?.email || fallback).trim() || fallback;
}

function createToken() {
  return randomBytes(12).toString("base64url");
}

function scoreAnswers(pack: ChallengeQuestion[], answers: Record<string, string>) {
  const correctCount = pack.reduce((count, question) => count + (answers[question.id] === question.answer ? 1 : 0), 0);
  return {
    correctCount,
    totalCount: pack.length,
    score: correctCount * 100,
  };
}

function sanitizePack(pack: ChallengeQuestion[]) {
  return pack.map(({ answer, ...question }) => question);
}

function mapChallenge(row: any, includeAnswers = false) {
  const questionPack = Array.isArray(row.question_pack) ? row.question_pack : [];
  const attempts = Number(row.attempt_count || 0);
  const bestFriendScore = Number(row.best_friend_score || 0);
  return {
    id: row.id,
    token: row.token,
    mediaType: normalizeMediaType(row.media_type),
    tmdbId: Number(row.tmdb_id),
    title: row.title,
    challengerName: row.challenger_name,
    score: Number(row.score || 0),
    correctCount: Number(row.correct_count || 0),
    totalCount: Number(row.total_count || questionPack.length || 0),
    questions: includeAnswers ? questionPack : sanitizePack(questionPack),
    attempts,
    bestFriendScore,
    createdAt: row.created_at,
    completedAt: row.completed_at,
    shareUrl: `/challenge/${row.token}`,
  };
}

async function readTriviaPack(sql: any, questionIds: string[], mediaType: MediaType, tmdbId: number) {
  if (!questionIds.length) return [];
  const rows = await sql`
    select id, question, answer, options, explanation, difficulty
    from title_trivia
    where id::text in (select jsonb_array_elements_text(${JSON.stringify(questionIds)}::jsonb))
      and media_type = ${mediaType}
      and tmdb_id = ${tmdbId}
      and status in ('approved', 'auto_generated')
      and report_count < 3
      and options ? answer
  `;
  const byId = new Map(rows.map((row: any) => [String(row.id), row]));
  return questionIds
    .map((id) => byId.get(id))
    .filter(Boolean)
    .map((row: any) => ({
      id: String(row.id),
      question: row.question,
      answer: row.answer,
      options: Array.isArray(row.options) ? row.options : [],
      explanation: row.explanation || "",
      difficulty: row.difficulty || "easy",
    }))
    .filter((question) => question.options.includes(question.answer));
}

async function handleCreate(request: any, response: any, sql: any) {
  const user = await getCurrentUser(sql, request);
  if (!user) return sendJson(response, 401, { error: "Sign in to create a friend challenge." });
  await checkRateLimit(sql, request, "friend-challenge:create", user.id, 40, 60 * 60);

  const body = await readBody(request);
  const mediaType = normalizeMediaType(body.mediaType);
  const tmdbId = Number(body.tmdbId);
  const title = String(body.title || "").trim();
  const questionIds = Array.isArray(body.questionIds) ? body.questionIds.map((id: unknown) => String(id)).filter(Boolean) : [];
  const answers = normalizeAnswers(body.answers);
  if (!Number.isFinite(tmdbId) || !title || questionIds.length === 0) {
    return sendJson(response, 400, { error: "A completed trivia pack is required to create a challenge." });
  }

  const pack = await readTriviaPack(sql, questionIds, mediaType, tmdbId);
  if (pack.length === 0) return sendJson(response, 400, { error: "This trivia pack is not available for challenges yet." });
  const score = scoreAnswers(pack, answers);
  const token = createToken();
  const answerKey = Object.fromEntries(pack.map((question) => [question.id, question.answer]));
  const [challenge] = await sql`
    insert into friend_trivia_challenges (
      token,
      challenger_user_id,
      challenger_name,
      media_type,
      tmdb_id,
      title,
      score,
      correct_count,
      total_count,
      question_pack,
      answer_key,
      completed_at,
      updated_at
    )
    values (
      ${token},
      ${user.id},
      ${publicName(user)},
      ${mediaType},
      ${tmdbId},
      ${title},
      ${score.score},
      ${score.correctCount},
      ${score.totalCount},
      ${JSON.stringify(pack)}::jsonb,
      ${JSON.stringify(answerKey)}::jsonb,
      now(),
      now()
    )
    returning *
  `;

  return sendJson(response, 201, { challenge: mapChallenge(challenge), result: score });
}

async function readChallenge(sql: any, token: string) {
  const rows = await sql`
    select
      ftc.*,
      count(fta.id)::int as attempt_count,
      coalesce(max(fta.score), 0)::int as best_friend_score
    from friend_trivia_challenges ftc
    left join friend_trivia_attempts fta on fta.challenge_id = ftc.id
    where ftc.token = ${token}
      and ftc.status = 'active'
    group by ftc.id
    limit 1
  `;
  return rows[0];
}

async function handleRead(response: any, sql: any, token: string) {
  const challenge = await readChallenge(sql, token);
  if (!challenge) return sendJson(response, 404, { error: "Challenge not found." });
  return sendJson(response, 200, { challenge: mapChallenge(challenge) });
}

async function handleAttempt(request: any, response: any, sql: any, token: string) {
  const challenge = await readChallenge(sql, token);
  if (!challenge) return sendJson(response, 404, { error: "Challenge not found." });
  const user = await getCurrentUser(sql, request).catch(() => null);
  await checkRateLimit(sql, request, "friend-challenge:attempt", user?.id, user ? 80 : 25, 60 * 60);
  const body = await readBody(request);
  const answers = normalizeAnswers(body.answers);
  const pack = Array.isArray(challenge.question_pack) ? challenge.question_pack as ChallengeQuestion[] : [];
  const score = scoreAnswers(pack, answers);
  const challengeScore = Number(challenge.score || 0);
  const result = score.score > challengeScore ? "won" : score.score < challengeScore ? "lost" : "tie";
  const playerName = String(body.playerName || publicName(user, "Friend")).trim().slice(0, 80) || "Friend";
  await sql`
    insert into friend_trivia_attempts (
      challenge_id,
      user_id,
      player_name,
      score,
      correct_count,
      total_count,
      result,
      answers,
      completed_at
    )
    values (
      ${challenge.id},
      ${user?.id || null},
      ${playerName},
      ${score.score},
      ${score.correctCount},
      ${score.totalCount},
      ${result},
      ${JSON.stringify(answers)}::jsonb,
      now()
    )
  `;

  return sendJson(response, 200, {
    result,
    score: score.score,
    correctCount: score.correctCount,
    totalCount: score.totalCount,
    challengeScore,
    difference: score.score - challengeScore,
    questions: pack,
  });
}

async function handleHistory(request: any, response: any, sql: any) {
  const user = await getCurrentUser(sql, request);
  if (!user) return sendJson(response, 401, { error: "Sign in to view challenge history." });
  await checkRateLimit(sql, request, "friend-challenge:history", user.id, 120, 60);
  const [created, attempts] = await Promise.all([
    sql`
      select
        ftc.*,
        count(fta.id)::int as attempt_count,
        coalesce(max(fta.score), 0)::int as best_friend_score
      from friend_trivia_challenges ftc
      left join friend_trivia_attempts fta on fta.challenge_id = ftc.id
      where ftc.challenger_user_id = ${user.id}
      group by ftc.id
      order by ftc.created_at desc
      limit 24
    `,
    sql`
      select fta.*, ftc.token, ftc.title, ftc.media_type, ftc.tmdb_id, ftc.challenger_name, ftc.score as challenge_score
      from friend_trivia_attempts fta
      join friend_trivia_challenges ftc on ftc.id = fta.challenge_id
      where fta.user_id = ${user.id}
      order by fta.completed_at desc
      limit 24
    `,
  ]);

  return sendJson(response, 200, {
    created: created.map((row: any) => mapChallenge(row)),
    attempts: attempts.map((row: any) => ({
      id: row.id,
      token: row.token,
      title: row.title,
      mediaType: normalizeMediaType(row.media_type),
      tmdbId: Number(row.tmdb_id),
      challengerName: row.challenger_name,
      score: Number(row.score || 0),
      challengeScore: Number(row.challenge_score || 0),
      correctCount: Number(row.correct_count || 0),
      totalCount: Number(row.total_count || 0),
      result: row.result,
      completedAt: row.completed_at,
      shareUrl: `/challenge/${row.token}`,
    })),
  });
}

export default async function handler(request: any, response: any) {
  try {
    const sql = db();
    await ensureTriviaTables(sql);
    const path = challengePath(request);
    const [token, action] = path.split("/").filter(Boolean);

    if (request.method === "POST" && !token) return handleCreate(request, response, sql);
    if (request.method === "GET" && token === "history") return handleHistory(request, response, sql);
    if (request.method === "GET" && token) return handleRead(response, sql, token);
    if (request.method === "POST" && token && action === "attempt") return handleAttempt(request, response, sql, token);
    return sendJson(response, 405, { error: "Method not allowed." });
  } catch (error) {
    return sendJson(response, errorStatus(error), { error: error instanceof Error ? error.message : "Friend challenge request failed." });
  }
}
