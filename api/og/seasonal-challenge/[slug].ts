import { db } from "../../_db.js";
import { fallbackShareCard, sendShareCard, type ShareCardData } from "../../_shareCards.js";
import { ensureSeasonalChallengeTables } from "../../_seasonalChallenges.js";

function challengeCardData(row: any, score: number): ShareCardData {
  const slug = String(row.slug || "");
  const name = String(row.name || "Flim Challenge");
  const badge = String(row.badge || "Movie Challenge");
  return {
    kind: "game",
    title: score > 0 ? `I scored ${score}` : name,
    subtitle: score > 0 ? name : badge,
    eyebrow: String(row.challenge_type || "seasonal").replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()),
    description: score > 0 ? "Can you beat me on Flim?" : String(row.description || "Join the movie challenge on Flim."),
    cta: "Play on Flim",
    urlLabel: `flim.ca/challenges/${slug}`,
    statLine: `${Number(row.points || 0)} points`,
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
    return sendShareCard(response, rows[0] ? challengeCardData(rows[0], score) : fallbackShareCard("game"));
  } catch (error) {
    console.error("seasonal_challenge_og_failed", error instanceof Error ? error.message : "Seasonal challenge OG failed.");
    return sendShareCard(response, fallbackShareCard("game"));
  }
}
