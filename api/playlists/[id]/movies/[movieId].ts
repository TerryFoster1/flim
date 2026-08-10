import { db, ensurePlaylistCollaborationTables, getCurrentUser, getPlaylistPermission, sendJson } from "../../../_db.js";
import { cleanEnum, cleanInteger, requireUuid, safeApiError } from "../../../_security.js";

export default async function handler(request: any, response: any) {
  let playlistId = "";

  try {
    playlistId = requireUuid(request.query.id, "playlistId");
    const movieId = cleanInteger(request.query.movieId, { field: "Movie ID", min: 1, max: 2147483647, required: true });
    const mediaType = cleanEnum(request.query.type, ["movie", "tv"], { field: "Media type", fallback: "movie" });
    const sql = db();
    await ensurePlaylistCollaborationTables(sql);
    const user = await getCurrentUser(sql, request);
    const permission = await getPlaylistPermission(sql, playlistId, user?.id);

    if (request.method === "DELETE") {
      if (!user) return sendJson(response, 401, { error: "Sign in to remove movies." });
      if (!permission?.canEditContent) return sendJson(response, 403, { error: "You do not have permission to remove titles from this playlist." });
      await sql`
        delete from playlist_movies pm
        using playlists p
        where p.id = pm.playlist_id
          and pm.playlist_id = ${playlistId}
          and pm.tmdb_id = ${movieId}
          and pm.media_type = ${mediaType}
      `;

      return sendJson(response, 200, { ok: true });
    }

    return sendJson(response, 405, { error: "Method not allowed." });
  } catch (error) {
    return sendJson(response, (error as any)?.statusCode || 500, { error: safeApiError(error, "Remove movie request failed.") });
  }
}
