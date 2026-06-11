import { db, ensurePlaylistFollowsTable, ensurePlaylistLikesTable, ensurePlaylistSharingColumns, ensureUserProfilesTable, getCurrentUser, mapPlaylist, readBody, sendJson } from "../_db.js";

export default async function handler(request: any, response: any) {
  const playlistId = request.query.id as string;

  try {
    const sql = db();
    await ensureUserProfilesTable(sql);
    await ensurePlaylistFollowsTable(sql);
    await ensurePlaylistLikesTable(sql);
    await ensurePlaylistSharingColumns(sql);
    await sql`alter table playlists add column if not exists owner_user_id uuid references users(id) on delete set null`;
    const user = await getCurrentUser(sql, request);

    if (request.method === "GET") {
      const rows = await sql`
        select
          p.*,
          up.handle as creator_handle,
          coalesce(
            nullif(up.display_name, ''),
            nullif(initcap(trim(regexp_replace(split_part(u.email, '@', 1), '[^a-zA-Z0-9]+', ' ', 'g'))), '')
          ) as creator_display_name,
          case when ${user?.id || null}::uuid is not null and p.owner_user_id = ${user?.id || null}::uuid then true else false end as is_owner,
          case when ${user?.id || null}::uuid is not null and p.owner_user_id = ${user?.id || null}::uuid then true else false end as expose_shared_slug,
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
            json_agg(
              to_jsonb(pm) || jsonb_build_object(
                'genres', coalesce(mi.genres, '[]'::jsonb),
                'genre_ids', coalesce(mi.source_payload->'genreIds', '[]'::jsonb)
              )
              order by coalesce(pm.sort_order, 2147483647), pm.added_at desc
            ) filter (where pm.id is not null),
            '[]'
          ) as movies
        from playlists p
        left join user_profiles up on up.user_id = p.owner_user_id::text
        left join users u on u.id = p.owner_user_id
        left join playlist_movies pm on pm.playlist_id = p.id
        left join media_items mi on mi.media_type = coalesce(pm.media_type, 'movie') and mi.tmdb_id = pm.tmdb_id
        where p.id = ${playlistId}
          and (
            p.visibility = 'public'
            or (${user?.id || null}::uuid is not null and p.owner_user_id = ${user?.id || null}::uuid)
          )
        group by p.id, up.handle, up.display_name, u.email
      `;

      if (!rows[0]) return sendJson(response, 404, { error: "Playlist not found." });
      return sendJson(response, 200, mapPlaylist(rows[0], rows[0].movies || []));
    }

    if (request.method === "DELETE") {
      if (!user) return sendJson(response, 401, { error: "Sign in to delete playlists." });
      const deleted = await sql`delete from playlists where id = ${playlistId} and owner_user_id = ${user.id} returning id`;
      if (!deleted[0]) return sendJson(response, 403, { error: "Only the playlist owner can delete this playlist." });
      return sendJson(response, 200, { ok: true });
    }

    if (request.method === "PATCH") {
      if (!user) return sendJson(response, 401, { error: "Sign in to edit playlists." });
      const body = await readBody(request);
      const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : undefined;
      const description = typeof body.description === "string" ? body.description.trim().slice(0, 600) : undefined;
      const visibility = ["private", "shared", "public"].includes(body.visibility) ? body.visibility : undefined;

      const rows = await sql`
        update playlists
        set
          name = coalesce(${name || null}, name),
          description = coalesce(${description ?? null}, description),
          visibility = coalesce(${visibility || null}, visibility),
          updated_at = now()
        where id = ${playlistId}
          and owner_user_id = ${user.id}
        returning *
      `;

      if (!rows[0]) return sendJson(response, 403, { error: "Only the playlist owner can edit this playlist." });
      return sendJson(response, 200, mapPlaylist({ ...rows[0], is_owner: true }));
    }

    return sendJson(response, 405, { error: "Method not allowed." });
  } catch (error) {
    return sendJson(response, 500, { error: error instanceof Error ? error.message : "Playlist request failed." });
  }
}
