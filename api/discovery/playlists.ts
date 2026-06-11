import { db, ensurePlaylistFollowsTable, ensurePlaylistLikesTable, ensureUserProfilesTable, getCurrentUser, mapPlaylist, sendJson } from "../_db.js";
import { ensureDirectorSeed } from "../_director.js";

function section(playlists: any[], sortBy: "likes" | "followers" | "trending" | "recent") {
  const sorted = [...playlists].sort((a, b) => {
    if (sortBy === "likes") {
      return (b.likeCount || 0) - (a.likeCount || 0) || (b.followerCount || 0) - (a.followerCount || 0);
    }
    if (sortBy === "followers") {
      return (b.followerCount || 0) - (a.followerCount || 0) || (b.likeCount || 0) - (a.likeCount || 0);
    }
    if (sortBy === "trending") {
      return (b.likeCount || 0) * 2 + (b.followerCount || 0) - ((a.likeCount || 0) * 2 + (a.followerCount || 0));
    }
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
  return sorted.slice(0, 12);
}

export default async function handler(request: any, response: any) {
  if (request.method !== "GET") return sendJson(response, 405, { error: "Method not allowed." });

  try {
    const sql = db();
    await ensureUserProfilesTable(sql);
    await ensurePlaylistFollowsTable(sql);
    await ensurePlaylistLikesTable(sql);
    await ensureDirectorSeed(sql).catch((error) => {
      console.error("director_seed_failed", error instanceof Error ? error.message : "Director seed failed");
    });
    const user = await getCurrentUser(sql, request);

    const rows = await sql`
      select
        p.*,
        up.handle as creator_handle,
        coalesce(
          nullif(up.display_name, ''),
          nullif(initcap(trim(regexp_replace(split_part(u.email, '@', 1), '[^a-zA-Z0-9]+', ' ', 'g'))), '')
        ) as creator_display_name,
        false as is_owner,
        false as expose_shared_slug,
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
      where p.visibility = 'public'
        and not (
          lower(p.name) like '%codex vercel curl add test%'
          or lower(p.name) like '%temporary production verification%'
          or lower(p.name) like '%production verification playlist%'
        )
      group by p.id, up.handle, up.display_name, u.email
    `;

    const playlists = rows.map((playlist: any) => mapPlaylist(playlist, playlist.movies || []));
    return sendJson(response, 200, {
      mostLiked: section(playlists, "likes"),
      mostFollowed: section(playlists, "followers"),
      trending: section(playlists, "trending"),
      recentlyPopular: section(playlists, "recent"),
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("playlist_discovery_failed", error instanceof Error ? error.message : "Playlist discovery failed.");
    return sendJson(response, 500, { error: "Playlist discovery failed. Please try again." });
  }
}
