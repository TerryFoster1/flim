import { db, ensurePlaylistCollaborationTables, getCurrentUser, getPlaylistPermission, readBody, sendJson } from "../../../../_db.js";
import { evaluateAchievements } from "../../../../_achievements.js";
import { cleanBoolean, cleanEnum, cleanInteger, requireRecord, requireUuid, safeApiError } from "../../../../_security.js";

export default async function handler(request: any, response: any) {
  let playlistId = "";

  try {
    playlistId = requireUuid(request.query.id, "playlistId");
    const movieId = cleanInteger(request.query.movieId, { field: "Movie ID", min: 1, max: 2147483647, required: true });
    const mediaType = cleanEnum(request.query.type, ["movie", "tv"], { field: "Media type", fallback: "movie" });
    const sql = db();
    await ensurePlaylistCollaborationTables(sql);
    const user = await getCurrentUser(sql, request);

    if (request.method === "PATCH") {
      if (!user) return sendJson(response, 401, { error: "Sign in to update watched status." });
      const permission = await getPlaylistPermission(sql, playlistId, user.id);
      if (!permission?.canEditContent) return sendJson(response, 403, { error: "You do not have permission to update titles in this playlist." });
      const body = requireRecord(await readBody(request));
      const watched = body.watchStatus
        ? cleanEnum(body.watchStatus, ["watched", "unwatched"], { field: "Watch status" }) === "watched"
        : cleanBoolean(body.watched, { field: "Watched", fallback: false });

      await sql`
        update playlist_movies pm
        set watched = ${watched}
        from playlists p
        where p.id = pm.playlist_id
          and pm.playlist_id = ${playlistId}
          and pm.tmdb_id = ${movieId}
          and pm.media_type = ${mediaType}
      `;

      const unlockedAchievements = await evaluateAchievements(sql, user.id);
      return sendJson(response, 200, { ok: true, unlockedAchievements });
    }

    return sendJson(response, 405, { error: "Method not allowed." });
  } catch (error) {
    return sendJson(response, (error as any)?.statusCode || 500, { error: safeApiError(error, "Watched status request failed.") });
  }
}
