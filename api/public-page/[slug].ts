import { db, ensurePlaylistFollowsTable, ensurePlaylistLikesTable, ensureUserProfilesTable, mapPlaylist } from "../_db.js";
import { ensureDirectorSeed } from "../_director.js";
import { getBuiltIndexHtml, injectMeta } from "../_shareCards.js";

function injectPlaylistMeta(indexHtml: string, playlist: any, slug: string) {
  const mapped = mapPlaylist(playlist, playlist.movies || []);
  const movieCount = mapped.movies.length;
  const title = `${mapped.name} | Flim`;
  const creator = mapped.creatorDisplayName || (mapped.creatorHandle ? `@${mapped.creatorHandle}` : "Flim curator");
  const followerCount = mapped.followerCount || 0;
  const description = mapped.description || `${movieCount} ${movieCount === 1 ? "title" : "titles"} by ${creator}. Discover this playlist on Flim.`;
  const url = `https://www.flim.ca/p/${slug}`;
  const image = `https://www.flim.ca/api/og/playlist/${encodeURIComponent(slug)}`;
  const socialDescription = `${movieCount} ${movieCount === 1 ? "Title" : "Titles"} | ${followerCount} ${followerCount === 1 ? "Follower" : "Followers"} | by ${creator} | Discover on Flim`;

  return injectMeta(indexHtml, {
    title,
    description: socialDescription || description,
    url,
    image,
  });
}

export default async function handler(request: any, response: any) {
  if (request.method !== "GET") {
    response.statusCode = 405;
    response.end("Method not allowed.");
    return;
  }

  const slug = request.query.slug as string;
  const indexHtml = await getBuiltIndexHtml(request);

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
    `;

    response.statusCode = 200;
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end(rows[0] ? injectPlaylistMeta(indexHtml, rows[0], slug) : indexHtml);
  } catch {
    response.statusCode = 200;
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end(indexHtml);
  }
}
