import { db } from "../../_db.js";
import { fallbackShareCard, sendShareCard, type ShareCardData } from "../../_shareCards.js";
import { ensureSeasonalChallengeTables } from "../../_seasonalChallenges.js";

function challengeCardData(row: any, score: number, correct: number, total: number, reward: number, state = ""): ShareCardData {
  const slug = String(row.slug || "");
  const name = String(row.name || "Flim Challenge");
  const badge = String(row.badge || "Movie Challenge");
  const typeLabel = String(row.challenge_type || "seasonal").replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
  const percent = total > 0 ? correct / total : 0;
  const label = state === "best" ? "New Personal Best" : total > 0 && correct === total ? "Perfect Score!" : percent >= 0.75 ? "Movie Buff" : percent >= 0.45 ? "Challenge Complete" : "Try Again?";
  return {
    kind: "game",
    title: score > 0 ? `${name} Result` : name,
    subtitle: score > 0 ? label : badge,
    eyebrow: typeLabel,
    description: score > 0 ? "Can you beat me on Flim?" : String(row.description || "Join the movie challenge on Flim."),
    cta: "Play on Flim",
    urlLabel: `flim.ca/challenges/${slug}`,
    badge: score > 0 && total > 0 ? `${correct}/${total} Correct` : badge,
    statLine: score > 0 ? `${score} points` : `${Number(row.points || 0)} points`,
    scoreLine: score > 0 ? (total > 0 ? `${correct}/${total}` : String(score)) : undefined,
    rewardLine: score > 0 ? `+${reward || Number(row.points || 0)} Points` : undefined,
    resultLabel: score > 0 ? label : undefined,
  };
}

export default async function handler(request: any, response: any) {
  if (request.method !== "GET") {
    response.statusCode = 405;
    response.end("Method not allowed.");
    return;
  }

  const slug = String(Array.isArray(request.query.slug) ? request.query.slug[0] : request.query.slug || "");
  const score = Math.max(0, Number(request.query.score || 0));
  const correct = Math.max(0, Number(request.query.correct || 0));
  const total = Math.max(0, Number(request.query.total || 0));
  const reward = Math.max(0, Number(request.query.reward || 0));
  const state = String(request.query.state || "");
  if (!slug) return sendShareCard(response, fallbackShareCard("game"));

  try {
    const sql = db();
    await ensureSeasonalChallengeTables(sql);
    const rows = await sql`
      select slug, name, description, badge, points, challenge_type
      from seasonal_challenge_events
      where slug = ${slug}
        and status = 'published'
      limit 1
    `;
    return sendShareCard(response, rows[0] ? challengeCardData(rows[0], score, correct, total, reward, state) : fallbackShareCard("game"));
  } catch (error) {
    console.error("seasonal_challenge_og_failed", error instanceof Error ? error.message : "Seasonal challenge OG failed.");
    return sendShareCard(response, fallbackShareCard("game"));
  }
}
