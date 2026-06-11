import { db, ensurePlaylistFollowsTable, ensurePlaylistLikesTable, ensureUserProfilesTable, mapPlaylist } from "../../_db.js";
import { ensureDirectorSeed } from "../../_director.js";
import { fallbackShareCard, renderShareCard, sendSvg } from "../../_shareCards.js";

function renderCard(playlist: any, slug: string) {
  const mapped = mapPlaylist(playlist, playlist.movies || []);
  const creator = mapped.creatorDisplayName || (mapped.creatorHandle ? `@${mapped.creatorHandle}` : "Flim curator");
  const titleCount = mapped.movies.length;
  const followerCount = mapped.followerCount || 0;
  return renderShareCard({
    kind: "playlist",
    title: mapped.name,
    subtitle: `by ${creator}`,
    description: mapped.description || "A curated Flim playlist.",
    cta: "Open Playlist",
    urlLabel: `flim.ca/p/${slug}`,
    posters: mapped.movies.slice(0, 4).map((movie) => ({ url: movie.posterUrl, label: movie.title })),
    statLine: `${titleCount} ${titleCount === 1 ? "Title" : "Titles"} | ${followerCount} ${followerCount === 1 ? "Follower" : "Followers"}`,
  });
}

export default async function handler(request: any, response: any) {
  if (request.method !== "GET") {
    response.statusCode = 405;
    response.end("Method not allowed.");
    return;
  }

  const slug = String(Array.isArray(request.query.slug) ? request.query.slug[0] : request.query.slug || "");
  try {
    const sql = db();
    await ensureUserProfilesTable(sql);
    await ensurePlaylistFollowsTable(sql);
    await ensurePlaylistLikesTable(sql);
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
      limit 1
    `;

    sendSvg(response, rows[0] ? renderCard(rows[0], slug) : fallbackShareCard("playlist"));
  } catch (error) {
    console.error("playlist_og_failed", error instanceof Error ? error.message : "Playlist OG failed.");
    sendSvg(response, fallbackShareCard("playlist"));
  }
}
