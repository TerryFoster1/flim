import { db, ensurePlaylistSharingColumns, ensureUserProfilesTable, mapPlaylist, sendJson } from "../../_db.js";

export default async function handler(request: any, response: any) {
  const token = String(Array.isArray(request.query.token) ? request.query.token[0] : request.query.token || "");

  try {
    const sql = db();
    await ensureUserProfilesTable(sql);
    await ensurePlaylistSharingColumns(sql);

    if (request.method === "GET") {
      const rows = await sql`
        select
          p.*,
          up.handle as creator_handle,
          coalesce(
            nullif(up.display_name, ''),
            nullif(initcap(trim(regexp_replace(split_part(u.email, '@', 1), '[^a-zA-Z0-9]+', ' ', 'g'))), '')
          ) as creator_display_name,
          false as is_owner,
          true as can_add_titles,
          true as can_remove_titles,
          false as can_reorder_titles,
          false as can_edit_playlist,
          true as expose_shared_slug,
          'shared' as access_mode,
          0 as follower_count,
          0 as like_count,
          false as is_following,
          false as is_liked,
          coalesce(
            json_agg(pm order by coalesce(pm.sort_order, 2147483647), pm.added_at desc) filter (where pm.id is not null),
            '[]'
          ) as movies
        from playlists p
        left join user_profiles up on up.user_id = p.owner_user_id::text
        left join users u on u.id = p.owner_user_id
        left join playlist_movies pm on pm.playlist_id = p.id
        where p.shared_slug = ${token}
          and p.visibility = 'shared'
        group by p.id, up.handle, up.display_name, u.email
      `;

      if (!rows[0]) return sendJson(response, 404, { error: "Shared playlist not found." });
      return sendJson(response, 200, mapPlaylist(rows[0], rows[0].movies || []));
    }

    return sendJson(response, 405, { error: "Method not allowed." });
  } catch (error) {
    return sendJson(response, 500, { error: error instanceof Error ? error.message : "Shared playlist request failed." });
  }
}
