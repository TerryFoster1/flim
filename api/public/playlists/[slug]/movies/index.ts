import { db, mapPlaylistMovie, sendJson } from "../../../../_db.js";

export default async function handler(request: any, response: any) {
  const slug = request.query.slug as string;

  try {
    const sql = db();

    if (request.method === "GET") {
      // Demo-stage public sharing. This endpoint intentionally avoids auth until
      // the later ownership/access-control phase.
      const movies = await sql`
        select pm.*
        from playlist_movies pm
        inner join playlists p on p.id = pm.playlist_id
        where p.public_slug = ${slug}
        order by pm.added_at desc
      `;

      return sendJson(response, 200, movies.map(mapPlaylistMovie));
    }

    return sendJson(response, 405, { error: "Method not allowed." });
  } catch (error) {
    return sendJson(response, 500, { error: error instanceof Error ? error.message : "Public playlist movies request failed." });
  }
}
