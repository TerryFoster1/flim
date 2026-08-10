import { db, ensurePlaylistCollaborationTables, ensurePlaylistMediaColumns, getCurrentUser, getPlaylistPermission, mapPlaylistMovie, readBody, sendJson } from "../_db.js";
import { upsertMediaItem } from "../_mediaCatalog.js";
import { cleanEnum, cleanInteger, cleanText, cleanUrl, requireRecord, requireUuid, safeApiError } from "../_security.js";

export default async function handler(request: any, response: any) {
  try {
    const playlistId = requireUuid(Array.isArray(request.query.id) ? request.query.id[0] : request.query.id, "playlistId");
    const sql = db();
    await ensurePlaylistMediaColumns(sql);
    await ensurePlaylistCollaborationTables(sql);
    const user = await getCurrentUser(sql, request);
    const permission = await getPlaylistPermission(sql, playlistId, user?.id);

    if (request.method === "GET") {
      if (!permission?.canRead) return sendJson(response, 404, { error: "Playlist not found." });
      const movies = await sql`
        select pm.*
        from playlist_movies pm
        inner join playlists p on p.id = pm.playlist_id
        where pm.playlist_id = ${playlistId}
        order by coalesce(pm.sort_order, 2147483647), pm.added_at desc
      `;

      return sendJson(response, 200, movies.map(mapPlaylistMovie));
    }

    if (request.method === "POST") {
      if (!user) return sendJson(response, 401, { error: "Sign in to add movies." });
      if (!permission?.canEditContent) return sendJson(response, 403, { error: "You do not have permission to add titles to this playlist." });

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
        values (${playlistId}, ${mediaItem?.id || null}, ${mediaType}, ${tmdbId}, ${title}, ${releaseYear}, ${posterUrl}, ${overview || null}, ${runtimeMinutes}, ${seasonCount}, ${episodeCount}, false)
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
    console.error("playlist_movies_index_failed", {
      playlistId: Array.isArray(request.query.id) ? request.query.id[0] : request.query.id,
      method: request.method,
      message: error instanceof Error ? error.message : "Unknown playlist movie error",
    });
    return sendJson(response, 500, { error: safeApiError(error, "Unable to add movie. Please try again.") });
  }
}
