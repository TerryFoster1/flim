import { db, ensureNotificationsTable, ensurePlaylistFollowsTable, ensureUserProfilesTable, getCurrentUser, sendJson } from "../../_db.js";

async function readFollowState(sql: any, playlistId: string, userId: string) {
  const [state] = await sql`
    select
      (
        select count(*)::int
        from playlist_follows pf
        where pf.playlist_id = p.id
      ) as follower_count,
      exists (
        select 1
        from playlist_follows my_pf
        where my_pf.playlist_id = p.id
          and my_pf.follower_user_id = ${userId}
      ) as is_following
    from playlists p
    where p.id = ${playlistId}
      and p.visibility = 'public'
    limit 1
  `;

  return state;
}

export default async function handler(request: any, response: any) {
  const playlistId = request.query.id as string;

  try {
    const sql = db();
    await ensureUserProfilesTable(sql);
    await ensurePlaylistFollowsTable(sql);
    await ensureNotificationsTable(sql);
    const user = await getCurrentUser(sql, request);

    if (!user) return sendJson(response, 401, { error: "Sign in to follow playlists." });

    const [playlist] = await sql`
      select
        p.id,
        p.owner_user_id,
        p.name,
        coalesce(
          nullif(actor_profile.display_name, ''),
          nullif(actor_profile.handle, ''),
          nullif(initcap(trim(regexp_replace(split_part(actor.email, '@', 1), '[^a-zA-Z0-9]+', ' ', 'g'))), ''),
          'Someone'
        ) as actor_name
      from playlists
      p
      left join user_profiles actor_profile on actor_profile.user_id = ${user?.id || null}::text
      left join users actor on actor.id = ${user?.id || null}::uuid
      where p.id = ${playlistId}
        and p.visibility = 'public'
      limit 1
    `;

    if (!playlist) return sendJson(response, 404, { error: "Public playlist not found." });
    if (playlist.owner_user_id === user.id) {
      const state = await readFollowState(sql, playlistId, user.id);
      return sendJson(response, 200, {
        ok: true,
        followerCount: Number(state?.follower_count || 0),
        isFollowing: Boolean(state?.is_following),
        isOwner: true,
      });
    }

    if (request.method === "POST") {
      const inserted = await sql`
        insert into playlist_follows (playlist_id, follower_user_id)
        values (${playlistId}, ${user.id})
        on conflict do nothing
        returning id
      `;
      if (inserted[0] && playlist.owner_user_id) {
        await sql`
          insert into notifications (
            recipient_user_id,
            actor_user_id,
            type,
            entity_type,
            entity_id,
            title,
            message
          )
          values (
            ${playlist.owner_user_id},
            ${user.id},
            'playlist_followed',
            'playlist',
            ${playlistId},
            'New playlist follower',
            ${`${playlist.actor_name} followed your playlist "${playlist.name}."`}
          )
          on conflict do nothing
        `;
      }
      const state = await readFollowState(sql, playlistId, user.id);
      return sendJson(response, 200, {
        ok: true,
        followerCount: Number(state?.follower_count || 0),
        isFollowing: Boolean(state?.is_following),
      });
    }

    if (request.method === "DELETE") {
      await sql`
        delete from playlist_follows
        where playlist_id = ${playlistId}
          and follower_user_id = ${user.id}
      `;
      const state = await readFollowState(sql, playlistId, user.id);
      return sendJson(response, 200, {
        ok: true,
        followerCount: Number(state?.follower_count || 0),
        isFollowing: Boolean(state?.is_following),
      });
    }

    return sendJson(response, 405, { error: "Method not allowed." });
  } catch (error) {
    console.error("playlist_follow_failed", error instanceof Error ? error.message : "Playlist follow failed.");
    return sendJson(response, 500, { error: "Unable to update playlist follow. Please try again." });
  }
}
