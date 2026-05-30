import { db, mapPlaylist, sendJson, readBody } from "../_db";

export default async function handler(request: any, response: any) {
  try {
    const sql = db();

    if (request.method === "GET") {
      const playlists = await sql`
        select
          p.*,
          coalesce(
            json_agg(pm order by pm.added_at desc) filter (where pm.id is not null),
            '[]'
          ) as movies
        from playlists p
        left join playlist_movies pm on pm.playlist_id = p.id
        group by p.id
        order by p.updated_at desc
      `;

      return sendJson(response, 200, playlists.map((playlist: any) => mapPlaylist(playlist, playlist.movies || [])));
    }

    if (request.method === "POST") {
      const body = await readBody(request);
      const [created] = await sql`
        insert into playlists (name, description, visibility)
        values (${(body.name || "Untitled playlist").trim()}, ${body.description || ""}, ${body.visibility || "private"})
        returning *
      `;

      return sendJson(response, 201, mapPlaylist(created));
    }

    return sendJson(response, 405, { error: "Method not allowed." });
  } catch (error) {
    return sendJson(response, 500, { error: error instanceof Error ? error.message : "Playlist request failed." });
  }
}
