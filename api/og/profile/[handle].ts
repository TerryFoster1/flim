import { db, ensureUserFollowsTable, ensureUserProfilesTable } from "../../_db.js";
import { fallbackShareCard, renderShareCard, sendSvg } from "../../_shareCards.js";

function profileHandle(request: any) {
  const value = request.query.handle;
  return Array.isArray(value) ? String(value[0] || "") : String(value || "");
}

export default async function handler(request: any, response: any) {
  if (request.method !== "GET") {
    response.statusCode = 405;
    response.end("Method not allowed.");
    return;
  }

  try {
    const handle = profileHandle(request).replace(/^@/, "").toLowerCase();
    const sql = db();
    await ensureUserProfilesTable(sql);
    await ensureUserFollowsTable(sql);

    const rows = await sql`
      select
        up.*,
        (
          select count(*)::int
          from user_follows uf
          where uf.followed_user_id = up.user_id::uuid
        ) as follower_count,
        (
          select count(*)::int
          from playlists p
          where p.owner_user_id::text = up.user_id
            and p.visibility = 'public'
        ) as playlist_count,
        coalesce((
          select json_agg(json_build_object(
            'name', p.name,
            'posterUrl', (
              select pm.poster_url
              from playlist_movies pm
              where pm.playlist_id = p.id
                and pm.poster_url is not null
              order by coalesce(pm.sort_order, 2147483647), pm.added_at desc
              limit 1
            )
          ) order by p.updated_at desc)
          from playlists p
          where p.owner_user_id::text = up.user_id
            and p.visibility = 'public'
          limit 3
        ), '[]') as featured_playlists
      from user_profiles up
      where up.handle = ${handle}
      limit 1
    `;

    if (!rows[0]) return sendSvg(response, fallbackShareCard("profile"));

    const profile = rows[0];
    const displayName = profile.display_name || `@${profile.handle}`;
    const playlists = Array.isArray(profile.featured_playlists) ? profile.featured_playlists : [];

    return sendSvg(response, renderShareCard({
      kind: "profile",
      title: displayName,
      subtitle: `@${profile.handle}`,
      eyebrow: "Flim Curator",
      description: profile.bio || "Explore this curator's public playlists on Flim.",
      avatarUrl: profile.profile_image_url || undefined,
      posters: playlists.map((playlist: any) => ({ url: playlist.posterUrl, label: playlist.name })),
      statLine: `${profile.playlist_count || 0} Public ${(profile.playlist_count || 0) === 1 ? "Playlist" : "Playlists"} | ${profile.follower_count || 0} ${(profile.follower_count || 0) === 1 ? "Follower" : "Followers"}`,
      cta: "Follow Curator",
      urlLabel: `flim.ca/@${profile.handle}`,
    }));
  } catch (error) {
    console.error("profile_og_failed", error instanceof Error ? error.message : "Profile OG failed.");
    return sendSvg(response, fallbackShareCard("profile"));
  }
}
