import { db, ensurePlaylistLikesTable, ensureUserProfilesTable, getCurrentUser, sendJson } from "../../_db.js";

async function readLikeState(sql: any, playlistId: string, userId: string) {
  const [state] = await sql`
    select
      (
        select count(*)::int
        from playlist_likes pl
        where pl.playlist_id = p.id
      ) as like_count,
      exists (
        select 1
        from playlist_likes my_pl
        where my_pl.playlist_id = p.id
          and my_pl.user_id = ${userId}
      ) as is_liked
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
    await ensurePlaylistLikesTable(sql);
    const user = await getCurrentUser(sql, request);

    if (!user) return sendJson(response, 401, { error: "Sign in to like playlists." });

    const [playlist] = await sql`
      select id
      from playlists
      where id = ${playlistId}
        and visibility = 'public'
      limit 1
    `;

    if (!playlist) return sendJson(response, 404, { error: "Public playlist not found." });

    if (request.method === "POST") {
      await sql`
        insert into playlist_likes (playlist_id, user_id)
        values (${playlistId}, ${user.id})
        on conflict (playlist_id, user_id) do nothing
      `;
      const state = await readLikeState(sql, playlistId, user.id);
      return sendJson(response, 200, {
        ok: true,
        likeCount: Number(state?.like_count || 0),
        isLiked: Boolean(state?.is_liked),
      });
    }

    if (request.method === "DELETE") {
      await sql`
        delete from playlist_likes
        where playlist_id = ${playlistId}
          and user_id = ${user.id}
      `;
      const state = await readLikeState(sql, playlistId, user.id);
      return sendJson(response, 200, {
        ok: true,
        likeCount: Number(state?.like_count || 0),
        isLiked: Boolean(state?.is_liked),
      });
    }

    return sendJson(response, 405, { error: "Method not allowed." });
  } catch (error) {
    console.error("playlist_like_failed", error instanceof Error ? error.message : "Playlist like failed.");
    return sendJson(response, 500, { error: "Unable to update playlist like. Please try again." });
  }
}
