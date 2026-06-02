import { db, getCurrentUser, sendJson } from "../../../_db.js";

export default async function handler(request: any, response: any) {
  const playlistId = request.query.id as string;
  const movieId = Number(request.query.movieId);
  const mediaType = request.query.type === "tv" ? "tv" : "movie";

  try {
    const sql = db();
    const user = await getCurrentUser(sql, request);

    if (request.method === "DELETE") {
      if (!user) return sendJson(response, 401, { error: "Sign in to remove movies." });
      await sql`
        delete from playlist_movies pm
        using playlists p
        where p.id = pm.playlist_id
          and pm.playlist_id = ${playlistId}
          and pm.tmdb_id = ${movieId}
          and pm.media_type = ${mediaType}
          and p.owner_user_id = ${user.id}
      `;

      return sendJson(response, 200, { ok: true });
    }

    return sendJson(response, 405, { error: "Method not allowed." });
  } catch (error) {
    return sendJson(response, 500, { error: error instanceof Error ? error.message : "Remove movie request failed." });
  }
}
