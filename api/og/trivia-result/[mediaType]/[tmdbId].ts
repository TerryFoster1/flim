import { db, ensureFollowTitleTables } from "../../../_db.js";
import { ensureMediaCatalogTables, getCatalogMediaItem, mapCatalogDetails } from "../../../_mediaCatalog.js";
import { fallbackShareCard, sendShareCard, type ShareCardData } from "../../../_shareCards.js";

function mediaTypeFromRequest(request: any) {
  const value = Array.isArray(request.query.mediaType) ? request.query.mediaType[0] : request.query.mediaType;
  return value === "tv" ? "tv" : "movie";
}

function tmdbIdFromRequest(request: any) {
  const value = Array.isArray(request.query.tmdbId) ? request.query.tmdbId[0] : request.query.tmdbId;
  return Number(value);
}

function numberParam(request: any, name: string) {
  const value = Array.isArray(request.query[name]) ? request.query[name][0] : request.query[name];
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function resultLabel(correct: number, total: number, state = "") {
  if (state === "best") return "New Personal Best";
  if (total > 0 && correct === total) return "Perfect Score!";
  const percent = total > 0 ? correct / total : 0;
  if (percent >= 0.75) return "Movie Buff";
  if (percent >= 0.45) return "Challenge Complete";
  return "Try Again?";
}

export default async function handler(request: any, response: any) {
  if (request.method !== "GET") {
    response.statusCode = 405;
    response.end("Method not allowed.");
    return;
  }

  const mediaType = mediaTypeFromRequest(request);
  const tmdbId = tmdbIdFromRequest(request);
  if (!Number.isFinite(tmdbId)) return sendShareCard(response, fallbackShareCard("game"));

  const score = numberParam(request, "score");
  const correct = numberParam(request, "correct");
  const total = numberParam(request, "total");
  const tickets = numberParam(request, "tickets");
  const state = String(Array.isArray(request.query.state) ? request.query.state[0] : request.query.state || "");

  try {
    const sql = db();
    await ensureMediaCatalogTables(sql);
    await ensureFollowTitleTables(sql);
    const catalogItem = await getCatalogMediaItem(sql, tmdbId, mediaType);
    const details = catalogItem ? mapCatalogDetails(catalogItem) : null;
    const title = details?.title || (mediaType === "tv" ? "TV" : "Movie");
    const label = resultLabel(correct, total, state);
    const data: ShareCardData = {
      kind: "game",
      title: `${title} Trivia`,
      subtitle: label,
      eyebrow: "Flim Arcade Result",
      description: tickets > 0 ? `I earned ${tickets} Tickets. Can you beat my score?` : "Can you beat my score on Flim?",
      cta: "Play on Flim",
      urlLabel: `flim.ca/games/title/${mediaType}/${tmdbId}`,
      posterUrl: details?.posterUrl || catalogItem?.poster_url,
      backdropUrl: catalogItem?.backdrop_url,
      badge: `${correct}/${total || "?"} Correct`,
      statLine: `${score} points`,
      scoreLine: total > 0 ? `${correct}/${total}` : String(score),
      rewardLine: tickets > 0 ? `+${tickets} Tickets` : `${score} Points`,
      resultLabel: label,
    };
    return sendShareCard(response, data);
  } catch (error) {
    console.error("trivia_result_og_failed", error instanceof Error ? error.message : "Trivia result OG failed.");
    return sendShareCard(response, fallbackShareCard("game"));
  }
}
