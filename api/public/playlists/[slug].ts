import { db, mapPlaylist, sendJson } from "../../_db.js";

export default async function handler(request: any, response: any) {
  const slug = request.query.slug as string;

  try {
    const sql = db();

    if (request.method === "GET") {
      // Demo-stage public sharing: any playlist with a public slug can be opened
      // by direct link. Auth, ownership, and access controls arrive later.
      const rows = await sql`
        select
          p.*,
          coalesce(
            json_agg(pm order by pm.added_at desc) filter (where pm.id is not null),
            '[]'
          ) as movies
        from playlists p
        left join playlist_movies pm on pm.playlist_id = p.id
        where p.public_slug = ${slug}
        group by p.id
      `;

      if (!rows[0]) return sendJson(response, 404, { error: "Public playlist not found." });
      return sendJson(response, 200, mapPlaylist(rows[0], rows[0].movies || []));
    }

    return sendJson(response, 405, { error: "Method not allowed." });
  } catch (error) {
    return sendJson(response, 500, { error: error instanceof Error ? error.message : "Public playlist request failed." });
  }
}
