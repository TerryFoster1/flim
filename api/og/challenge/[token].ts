import { db, ensureTriviaTables } from "../../_db.js";
import { fallbackShareCard, sendShareCard, type ShareCardData } from "../../_shareCards.js";

function challengeCardData(row: any): ShareCardData {
  const title = String(row.title || "Movie Trivia");
  const score = Number(row.score || 0);
  const challenger = String(row.challenger_name || "A Flim player");
  const token = String(row.token || "");
  return {
    kind: "game",
    title: `Beat ${score}`,
    subtitle: `${title} Trivia Challenge`,
    eyebrow: "Friend Challenge",
    description: `${challenger} scored ${score}. Can you beat it?`,
    cta: "Play on Flim",
    urlLabel: `flim.ca/challenge/${token}`,
    statLine: `${Number(row.correct_count || 0)} / ${Number(row.total_count || 0)} correct`,
  };
}

export default async function handler(request: any, response: any) {
  if (request.method !== "GET") {
    response.statusCode = 405;
    response.end("Method not allowed.");
    return;
  }

  const token = String(Array.isArray(request.query.token) ? request.query.token[0] : request.query.token || "");
  if (!token) return sendShareCard(response, fallbackShareCard("game"));

  try {
    const sql = db();
    await ensureTriviaTables(sql);
    const rows = await sql`
      select token, challenger_name, title, score, correct_count, total_count
      from friend_trivia_challenges
      where token = ${token}
        and status = 'active'
      limit 1
    `;
    return sendShareCard(response, rows[0] ? challengeCardData(rows[0]) : fallbackShareCard("game"));
  } catch (error) {
    console.error("challenge_og_failed", error instanceof Error ? error.message : "Challenge OG failed.");
    return sendShareCard(response, fallbackShareCard("game"));
  }
}
