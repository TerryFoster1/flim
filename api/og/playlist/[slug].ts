import { db, ensurePlaylistFollowsTable, ensurePlaylistLikesTable, ensureUserProfilesTable, mapPlaylist } from "../../_db.js";
import { ensureDirectorSeed } from "../../_director.js";

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function truncate(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1).trim()}...` : value;
}

function posterTile(url: string | undefined, x: number, y: number, rotate = 0) {
  if (!url) {
    return `<rect x="${x}" y="${y}" width="156" height="232" rx="20" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.15)" />`;
  }
  return `
    <g transform="rotate(${rotate} ${x + 78} ${y + 116})">
      <clipPath id="poster-${x}-${y}">
        <rect x="${x}" y="${y}" width="156" height="232" rx="20" />
      </clipPath>
      <image href="${escapeXml(url)}" x="${x}" y="${y}" width="156" height="232" preserveAspectRatio="xMidYMid slice" clip-path="url(#poster-${x}-${y})" />
      <rect x="${x}" y="${y}" width="156" height="232" rx="20" fill="none" stroke="rgba(255,255,255,0.18)" />
    </g>
  `;
}

function renderCard(playlist: any, slug: string) {
  const mapped = mapPlaylist(playlist, playlist.movies || []);
  const movies = mapped.movies.slice(0, 4);
  const title = truncate(mapped.name, 44);
  const creator = mapped.creatorDisplayName || (mapped.creatorHandle ? `@${mapped.creatorHandle}` : "Flim curator");
  const titleCount = mapped.movies.length;
  const followerCount = mapped.followerCount || 0;
  const likeCount = mapped.likeCount || 0;
  const cardUrl = `flim.ca/p/${slug}`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="#12040b" />
      <stop offset="52%" stop-color="#07070c" />
      <stop offset="100%" stop-color="#1a0e10" />
    </linearGradient>
    <radialGradient id="warm" cx="18%" cy="18%" r="70%">
      <stop offset="0%" stop-color="#ffb84d" stop-opacity="0.32" />
      <stop offset="55%" stop-color="#ff4f6d" stop-opacity="0.12" />
      <stop offset="100%" stop-color="#000000" stop-opacity="0" />
    </radialGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)" />
  <rect width="1200" height="630" fill="url(#warm)" />
  <circle cx="1040" cy="120" r="270" fill="#ff4f6d" opacity="0.08" />
  <circle cx="1030" cy="520" r="230" fill="#ffb84d" opacity="0.08" />

  ${posterTile(movies[0]?.posterUrl, 720, 92, -5)}
  ${posterTile(movies[1]?.posterUrl, 880, 64, 6)}
  ${posterTile(movies[2]?.posterUrl, 780, 318, 4)}
  ${posterTile(movies[3]?.posterUrl, 970, 286, -4)}

  <rect x="0" y="0" width="1200" height="630" fill="rgba(0,0,0,0.12)" />
  <g transform="translate(76 72)">
    <rect x="0" y="0" width="72" height="72" rx="18" fill="#ffb84d" />
    <text x="36" y="48" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="42" font-weight="900" fill="#130508">F</text>
    <text x="92" y="49" font-family="Arial, Helvetica, sans-serif" font-size="40" font-weight="900" fill="#fff3db">Flim</text>
  </g>

  <g transform="translate(76 188)">
    <text x="0" y="0" font-family="Arial, Helvetica, sans-serif" font-size="76" font-weight="900" fill="#ffffff">${escapeXml(title)}</text>
    <text x="0" y="66" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="700" fill="#ffd79b">by ${escapeXml(creator)}</text>
    <text x="0" y="126" font-family="Arial, Helvetica, sans-serif" font-size="30" fill="#f6e8d9">${titleCount} ${titleCount === 1 ? "Title" : "Titles"} | ${followerCount} ${followerCount === 1 ? "Follower" : "Followers"} | ${likeCount} ${likeCount === 1 ? "Like" : "Likes"}</text>
  </g>

  <g transform="translate(76 506)">
    <rect x="0" y="0" width="288" height="58" rx="29" fill="url(#bg)" stroke="#ffb84d" opacity="0.96" />
    <text x="144" y="38" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="900" fill="#fff3db">Discover on Flim</text>
    <text x="318" y="38" font-family="Arial, Helvetica, sans-serif" font-size="22" fill="#cfc7bc">${escapeXml(cardUrl)}</text>
  </g>
</svg>`;
}

function fallbackCard() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#08070b" />
  <text x="96" y="160" font-family="Arial, Helvetica, sans-serif" font-size="48" font-weight="900" fill="#ffb84d">Flim</text>
  <text x="96" y="300" font-family="Arial, Helvetica, sans-serif" font-size="72" font-weight="900" fill="#ffffff">Discover movie playlists</text>
  <text x="96" y="372" font-family="Arial, Helvetica, sans-serif" font-size="30" fill="#f6e8d9">Explore this playlist on Flim.</text>
</svg>`;
}

export default async function handler(request: any, response: any) {
  if (request.method !== "GET") {
    response.statusCode = 405;
    response.end("Method not allowed.");
    return;
  }

  const slug = String(Array.isArray(request.query.slug) ? request.query.slug[0] : request.query.slug || "");
  response.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
  response.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800");

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

    response.statusCode = 200;
    response.end(rows[0] ? renderCard(rows[0], slug) : fallbackCard());
  } catch (error) {
    console.error("playlist_og_failed", error instanceof Error ? error.message : "Playlist OG failed.");
    response.statusCode = 200;
    response.end(fallbackCard());
  }
}
