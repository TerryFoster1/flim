import { db, ensureUserProfilesTable, mapPlaylist, sendJson } from "../../_db.js";
import { ensureDirectorSeed } from "../../_director.js";

export default async function handler(request: any, response: any) {
  const slug = request.query.slug as string;

  try {
    const sql = db();
    await ensureUserProfilesTable(sql);

    if (request.method === "GET") {
      await ensureDirectorSeed(sql).catch((error) => {
        console.error("director_seed_failed", error instanceof Error ? error.message : "Director seed failed");
      });

      const rows = await sql`
        select
          p.*,
          up.handle as creator_handle,
          up.display_name as creator_display_name,
          false as is_owner,
          coalesce(
            json_agg(pm order by coalesce(pm.sort_order, 2147483647), pm.added_at desc) filter (where pm.id is not null),
            '[]'
          ) as movies
        from playlists p
        left join user_profiles up on up.user_id = p.owner_user_id::text
        left join playlist_movies pm on pm.playlist_id = p.id
        where p.public_slug = ${slug}
          and p.visibility = 'public'
        group by p.id, up.handle, up.display_name
      `;

      if (!rows[0]) return sendJson(response, 404, { error: "Public playlist not found." });
      return sendJson(response, 200, mapPlaylist(rows[0], rows[0].movies || []));
    }

    return sendJson(response, 405, { error: "Method not allowed." });
  } catch (error) {
    return sendJson(response, 500, { error: error instanceof Error ? error.message : "Public playlist request failed." });
  }
}
