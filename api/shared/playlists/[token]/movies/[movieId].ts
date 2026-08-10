import { db, ensurePlaylistCollaborationTables, findPlaylistInvite, getCurrentUser, getPlaylistPermission, sendJson } from "../../../../_db.js";
import { cleanInteger, cleanText, safeApiError } from "../../../../_security.js";

export default async function handler(request: any, response: any) {
  const rawToken = Array.isArray(request.query.token) ? request.query.token[0] : request.query.token;
  const mediaType = request.query.type === "tv" ? "tv" : "movie";

  try {
    const token = cleanText(rawToken, { field: "shareToken", max: 120, required: true });
    const movieId = cleanInteger(request.query.movieId, { field: "movieId", min: 1, max: 99999999, required: true });
    const sql = db();
    await ensurePlaylistCollaborationTables(sql);

    if (request.method === "DELETE") {
      const user = await getCurrentUser(sql, request);
      if (!user) return sendJson(response, 401, { error: "Sign in to edit this shared playlist." });

      const invite = await findPlaylistInvite(sql, token);
      if (!invite) return sendJson(response, 404, { error: "This playlist invite is expired or no longer available." });

      const permission = await getPlaylistPermission(sql, invite.playlist_id, user.id);
      if (!permission?.canEditContent) return sendJson(response, 403, { error: "Accept this playlist invite before editing titles." });

      const deleted = await sql`
        delete from playlist_movies pm
        where pm.playlist_id = ${invite.playlist_id}
          and pm.tmdb_id = ${movieId}
          and pm.media_type = ${mediaType}
        returning pm.id
      `;

      if (!deleted[0]) return sendJson(response, 404, { error: "Title not found in this shared playlist." });
      return sendJson(response, 200, { ok: true });
    }

    return sendJson(response, 405, { error: "Method not allowed." });
  } catch (error) {
    return sendJson(response, 500, { error: safeApiError(error, "Remove title request failed.") });
  }
}
