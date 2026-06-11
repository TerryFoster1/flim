import { db, getCurrentUser, readBody, sendJson } from "../_db.js";
import { evaluateAchievements } from "../_achievements.js";
import {
  ensureTvShowCatalog,
  getTvProgress,
  setEpisodeProgress,
  setSeasonProgress,
  setShowProgress,
} from "../_tvProgress.js";

function showIdFromRequest(request: any) {
  const pathname = new URL(request.url || "", "https://www.flim.ca").pathname;
  const fromPath = pathname.split("/api/tv-progress/").pop()?.split("?")[0];
  const value = fromPath && fromPath !== pathname ? fromPath : request.query?.showId;
  return Number(Array.isArray(value) ? value[0] : value);
}

export default async function handler(request: any, response: any) {
  try {
    const sql = db();
    const user = await getCurrentUser(sql, request);
    if (!user) return sendJson(response, 401, { error: "Sign in to track TV progress." });

    const tmdbShowId = showIdFromRequest(request);
    if (!Number.isFinite(tmdbShowId) || tmdbShowId <= 0) {
      return sendJson(response, 400, { error: "A valid TV show ID is required." });
    }

    const mediaItem = await ensureTvShowCatalog(sql, tmdbShowId);

    if (request.method === "GET") {
      return sendJson(response, 200, await getTvProgress(sql, user.id, mediaItem));
    }

    if (request.method !== "PATCH") return sendJson(response, 405, { error: "Method not allowed." });

    const body = await readBody(request);
    const action = String(body.action || "");
    const seasonNumber = Number(body.seasonNumber);
    const episodeNumber = Number(body.episodeNumber);

    if (action === "episode") {
      if (!Number.isFinite(seasonNumber) || !Number.isFinite(episodeNumber)) {
        return sendJson(response, 400, { error: "Choose a valid episode." });
      }
      await setEpisodeProgress(sql, user.id, mediaItem, seasonNumber, episodeNumber, body.status);
    } else if (action === "season") {
      if (!Number.isFinite(seasonNumber)) return sendJson(response, 400, { error: "Choose a valid season." });
      await setSeasonProgress(sql, user.id, mediaItem, seasonNumber, Boolean(body.watched));
    } else if (action === "show") {
      await setShowProgress(sql, user.id, mediaItem, Boolean(body.watched));
    } else if (action === "start") {
      const current = await getTvProgress(sql, user.id, mediaItem);
      const next = current.show.nextEpisode || current.seasons.flatMap((season: any) => season.episodes).find((episode: any) => episode.released);
      if (next) await setEpisodeProgress(sql, user.id, mediaItem, next.seasonNumber, next.episodeNumber, "watching");
    } else {
      return sendJson(response, 400, { error: "Choose a valid progress action." });
    }

    const progress = await getTvProgress(sql, user.id, mediaItem);
    const unlockedAchievements = await evaluateAchievements(sql, user.id);
    return sendJson(response, 200, { ...progress, unlockedAchievements });
  } catch (error) {
    console.error("tv_progress_request_failed", error instanceof Error ? error.message : "TV progress request failed.");
    return sendJson(response, 500, { error: "Unable to update TV progress. Please try again." });
  }
}
