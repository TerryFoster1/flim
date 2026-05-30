import { db, sendJson } from "../../../_db";

export default async function handler(request: any, response: any) {
  const playlistId = request.query.id as string;
  const movieId = Number(request.query.movieId);

  try {
    const sql = db();

    if (request.method === "DELETE") {
      await sql`
        delete from playlist_movies
        where playlist_id = ${playlistId}
          and tmdb_id = ${movieId}
      `;

      return sendJson(response, 200, { ok: true });
    }

    return sendJson(response, 405, { error: "Method not allowed." });
  } catch (error) {
    return sendJson(response, 500, { error: error instanceof Error ? error.message : "Remove movie request failed." });
  }
}
