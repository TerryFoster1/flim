import { db, getCurrentUser, readBody, sendJson } from "../../../_db.js";

export default async function handler(request: any, response: any) {
  const playlistId = request.query.id as string;

  try {
    const sql = db();
    const user = await getCurrentUser(sql, request);

    if (request.method === "PATCH") {
      if (!user) return sendJson(response, 401, { error: "Sign in to reorder movies." });

      const ownsPlaylist = await sql`
        select id
        from playlists
        where id = ${playlistId}
          and owner_user_id = ${user.id}
        limit 1
      `;

      if (!ownsPlaylist[0]) {
        return sendJson(response, 403, { error: "Only the playlist owner can reorder this playlist." });
      }

      const body = await readBody(request);
      const movieIds = Array.isArray(body.movieIds) ? body.movieIds.map(String).filter(Boolean) : [];

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
    return sendJson(response, 500, { error: "Unable to reorder movies. Please try again." });
  }
}
