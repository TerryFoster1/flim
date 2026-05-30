import { db, mapPlaylistMovie, readBody, sendJson } from "../../../_db.js";

export default async function handler(request: any, response: any) {
  const playlistId = request.query.id as string;

  try {
    const sql = db();

    if (request.method === "GET") {
      const movies = await sql`
        select * from playlist_movies
        where playlist_id = ${playlistId}
        order by added_at desc
      `;

      return sendJson(response, 200, movies.map(mapPlaylistMovie));
    }

    if (request.method === "POST") {
      const body = await readBody(request);
      const [movie] = await sql`
        insert into playlist_movies (playlist_id, tmdb_id, title, year, poster_url, overview, watched)
        values (${playlistId}, ${body.tmdbId}, ${body.title}, ${body.releaseYear || null}, ${body.posterUrl || null}, ${body.overview || null}, false)
        on conflict (playlist_id, tmdb_id)
        do update set
          title = excluded.title,
          year = excluded.year,
          poster_url = excluded.poster_url,
          overview = excluded.overview
        returning *
      `;

      return sendJson(response, 201, mapPlaylistMovie(movie));
    }

    return sendJson(response, 405, { error: "Method not allowed." });
  } catch (error) {
    return sendJson(response, 500, { error: error instanceof Error ? error.message : "Playlist movie request failed." });
  }
}
