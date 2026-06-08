import { db, ensurePlaylistSharingColumns, sendJson } from "../../../../_db.js";

export default async function handler(request: any, response: any) {
  const token = String(Array.isArray(request.query.token) ? request.query.token[0] : request.query.token || "");
  const movieId = Number(request.query.movieId);
  const mediaType = request.query.type === "tv" ? "tv" : "movie";

  try {
    const sql = db();
    await ensurePlaylistSharingColumns(sql);

    if (request.method === "DELETE") {
      const deleted = await sql`
        delete from playlist_movies pm
        using playlists p
        where p.id = pm.playlist_id
          and p.shared_slug = ${token}
          and p.visibility = 'shared'
          and pm.tmdb_id = ${movieId}
          and pm.media_type = ${mediaType}
        returning pm.id
      `;

      if (!deleted[0]) return sendJson(response, 404, { error: "Title not found in this shared playlist." });
      return sendJson(response, 200, { ok: true });
    }

    return sendJson(response, 405, { error: "Method not allowed." });
  } catch (error) {
    return sendJson(response, 500, { error: error instanceof Error ? error.message : "Remove title request failed." });
  }
}
