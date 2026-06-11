import { db, ensurePlaylistFollowsTable, ensurePlaylistLikesTable, ensureUserProfilesTable, getCurrentUser, mapPlaylist, sendJson } from "../../_db.js";
import { ensureDirectorSeed } from "../../_director.js";

export default async function handler(request: any, response: any) {
  const slug = request.query.slug as string;

  try {
    const sql = db();
    await ensureUserProfilesTable(sql);
    await ensurePlaylistFollowsTable(sql);
    await ensurePlaylistLikesTable(sql);
    const user = await getCurrentUser(sql, request);

    if (request.method === "GET") {
      await ensureDirectorSeed(sql).catch((error) => {
        console.error("director_seed_failed", error instanceof Error ? error.message : "Director seed failed");
      });

      const rows = await sql`
        select
          p.*,
          up.handle as creator_handle,
          coalesce(
            nullif(up.display_name, ''),
            nullif(initcap(trim(regexp_replace(split_part(u.email, '@', 1), '[^a-zA-Z0-9]+', ' ', 'g'))), '')
          ) as creator_display_name,
          case when ${user?.id || null}::uuid is not null and p.owner_user_id = ${user?.id || null}::uuid then true else false end as is_owner,
          (
            select count(*)::int
            from playlist_follows pf
            where pf.playlist_id = p.id
          ) as follower_count,
          (
            select count(*)::int
            from playlist_likes pl
            where pl.playlist_id = p.id
          ) as like_count,
          exists (
            select 1
            from playlist_follows my_pf
            where my_pf.playlist_id = p.id
              and ${user?.id || null}::uuid is not null
              and my_pf.follower_user_id = ${user?.id || null}::uuid
          ) as is_following,
          exists (
            select 1
            from playlist_likes my_pl
            where my_pl.playlist_id = p.id
              and ${user?.id || null}::uuid is not null
              and my_pl.user_id = ${user?.id || null}::uuid
          ) as is_liked,
          coalesce(
            json_agg(pm order by coalesce(pm.sort_order, 2147483647), pm.added_at desc) filter (where pm.id is not null),
            '[]'
          ) as movies
        from playlists p
        left join user_profiles up on up.user_id = p.owner_user_id::text
        left join users u on u.id = p.owner_user_id
        left join playlist_movies pm on pm.playlist_id = p.id
        where p.public_slug = ${slug}
          and p.visibility = 'public'
        group by p.id, up.handle, up.display_name, u.email
      `;

      if (!rows[0]) return sendJson(response, 404, { error: "Public playlist not found." });
      return sendJson(response, 200, mapPlaylist(rows[0], rows[0].movies || []));
    }

    return sendJson(response, 405, { error: "Method not allowed." });
  } catch (error) {
    return sendJson(response, 500, { error: error instanceof Error ? error.message : "Public playlist request failed." });
  }
}
