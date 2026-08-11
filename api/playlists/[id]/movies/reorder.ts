import { db, ensurePlaylistCollaborationTables, getCurrentUser, getPlaylistPermission, readBody, sendJson } from "../../../_db.js";
import { cleanUuidArray, requireRecord, requireUuid, safeApiError } from "../../../_security.js";

export default async function handler(request: any, response: any) {
  let playlistId = "";

  try {
    playlistId = requireUuid(request.query.id, "playlistId");
    const sql = db();
    await ensurePlaylistCollaborationTables(sql);
    const user = await getCurrentUser(sql, request);

    if (request.method === "PATCH") {
      if (!user) return sendJson(response, 401, { error: "Sign in to reorder movies." });
      const permission = await getPlaylistPermission(sql, playlistId, user.id);

      if (!permission?.canEditContent) {
        return sendJson(response, 403, { error: "You do not have permission to reorder this playlist." });
      }

      const body = requireRecord(await readBody(request));
      const movieIds = cleanUuidArray(body.movieIds, { field: "movieIds", max: 300 });

      for (const [index, movieId] of movieIds.entries()) {
        await sql`
          update playlist_movies
          set sort_order = ${index}
          where id = ${movieId}
            and playlist_id = ${playlistId}
        `;
      }

      return sendJson(response, 200, { ok: true });
    }

    return sendJson(response, 405, { error: "Method not allowed." });
  } catch (error) {
    console.error("playlist_movie_reorder_failed", {
      playlistId,
      method: request.method,
      message: error instanceof Error ? error.message : "Unknown playlist reorder error",
    });
    return sendJson(response, (error as any)?.statusCode || 500, { error: safeApiError(error, "Unable to reorder movies. Please try again.") });
  }
}
