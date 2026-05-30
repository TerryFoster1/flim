import { db, readBody, sendJson } from "../../../../_db.js";

export default async function handler(request: any, response: any) {
  const playlistId = request.query.id as string;
  const movieId = Number(request.query.movieId);

  try {
    const sql = db();

    if (request.method === "PATCH") {
      const body = await readBody(request);
      const watched = body.watchStatus ? body.watchStatus === "watched" : Boolean(body.watched);

      await sql`
        update playlist_movies
        set watched = ${watched}
        where playlist_id = ${playlistId}
          and tmdb_id = ${movieId}
      `;

      return sendJson(response, 200, { ok: true });
    }

    return sendJson(response, 405, { error: "Method not allowed." });
  } catch (error) {
    return sendJson(response, 500, { error: error instanceof Error ? error.message : "Watched status request failed." });
  }
}
