import { db, ensurePlaylistCollaborationTables, ensurePlaylistMediaColumns, findPlaylistInvite, getCurrentUser, getPlaylistPermission, mapPlaylistMovie, readBody, sendJson } from "../../../_db.js";
import { upsertMediaItem } from "../../../_mediaCatalog.js";
import { cleanEnum, cleanInteger, cleanText, cleanUrl, requireRecord, safeApiError } from "../../../_security.js";

export default async function handler(request: any, response: any) {
  const rawToken = Array.isArray(request.query.token) ? request.query.token[0] : request.query.token;

  try {
    const token = cleanText(rawToken, { field: "shareToken", max: 120, required: true });
    const sql = db();
    await ensurePlaylistMediaColumns(sql);
    await ensurePlaylistCollaborationTables(sql);

    if (request.method === "POST") {
      const user = await getCurrentUser(sql, request);
      if (!user) return sendJson(response, 401, { error: "Sign in to edit this shared playlist." });

      const invite = await findPlaylistInvite(sql, token);
      if (!invite) return sendJson(response, 404, { error: "This playlist invite is expired or no longer available." });

      const permission = await getPlaylistPermission(sql, invite.playlist_id, user.id);
      if (!permission?.canEditContent) return sendJson(response, 403, { error: "Accept this playlist invite before editing titles." });

      const body = requireRecord(await readBody(request));
      const mediaType = cleanEnum(body.mediaType, ["movie", "tv"], { field: "mediaType", fallback: "movie" });
      const tmdbId = cleanInteger(body.tmdbId, { field: "tmdbId", min: 1, max: 99999999, required: true });
      const title = cleanText(body.title, { field: "title", max: 220, required: true });
      const releaseYear = cleanInteger(body.releaseYear || body.firstAirYear, { field: "releaseYear", min: 1800, max: 2200, fallback: null });
      const posterUrl = cleanUrl(body.posterUrl, { field: "posterUrl", max: 2048 }) || null;
      const backdropUrl = cleanUrl(body.backdropUrl, { field: "backdropUrl", max: 2048 }) || undefined;
      const overview = cleanText(body.overview || "", { field: "overview", max: 1200, allowNewlines: true });
      const runtimeMinutes = cleanInteger(body.runtimeMinutes, { field: "runtimeMinutes", min: 0, max: 10000, fallback: null });
      const seasonCount = cleanInteger(body.seasonCount, { field: "seasonCount", min: 0, max: 500, fallback: null });
      const episodeCount = cleanInteger(body.episodeCount, { field: "episodeCount", min: 0, max: 5000, fallback: null });

      const mediaItem = await upsertMediaItem(sql, {
        mediaType,
        tmdbId,
        title,
        releaseYear,
        firstAirYear: releaseYear,
        posterUrl: posterUrl || undefined,
        backdropUrl,
        overview,
        runtimeMinutes,
        seasonCount,
        episodeCount,
      });
      const [movie] = await sql`
        insert into playlist_movies (playlist_id, media_item_id, media_type, tmdb_id, title, year, poster_url, overview, runtime_minutes, season_count, episode_count, watched)
        values (${invite.playlist_id}, ${mediaItem?.id || null}, ${mediaType}, ${tmdbId}, ${title}, ${releaseYear}, ${posterUrl}, ${overview || null}, ${runtimeMinutes}, ${seasonCount}, ${episodeCount}, false)
        on conflict (playlist_id, media_type, tmdb_id)
        do update set
          media_item_id = coalesce(excluded.media_item_id, playlist_movies.media_item_id),
          title = excluded.title,
          year = excluded.year,
          poster_url = excluded.poster_url,
          overview = excluded.overview,
          runtime_minutes = excluded.runtime_minutes,
          season_count = excluded.season_count,
          episode_count = excluded.episode_count
        returning *
      `;

      return sendJson(response, 201, mapPlaylistMovie(movie));
    }

    return sendJson(response, 405, { error: "Method not allowed." });
  } catch (error) {
    console.error("shared_playlist_movie_save_failed", {
      token: rawToken,
      method: request.method,
      message: error instanceof Error ? error.message : "Unknown shared playlist movie error",
    });
    return sendJson(response, 500, { error: safeApiError(error, "Unable to add title. Please try again.") });
  }
}
