import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { db, ensurePlaylistFollowsTable, ensurePlaylistLikesTable, ensureUserProfilesTable, mapPlaylist } from "../_db.js";
import { ensureDirectorSeed } from "../_director.js";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function getBuiltIndexHtml(request: any) {
  const host = request.headers?.host;
  if (host) {
    try {
      const protocol = host.includes("localhost") ? "http" : "https";
      const result = await fetch(`${protocol}://${host}/index.html`);
      if (result.ok) return result.text();
    } catch {
      // Fall back to local file lookup below.
    }
  }

  const candidates = [
    join(process.cwd(), "client", "dist", "index.html"),
    join(process.cwd(), "dist", "index.html"),
  ];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (found) return readFileSync(found, "utf8");

  return `<!doctype html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>Flim</title></head><body><div id="root"></div></body></html>`;
}

function injectPlaylistMeta(indexHtml: string, playlist: any, slug: string) {
  const mapped = mapPlaylist(playlist, playlist.movies || []);
  const movieCount = mapped.movies.length;
  const title = `${mapped.name} | Flim`;
  const creator = mapped.creatorDisplayName || (mapped.creatorHandle ? `@${mapped.creatorHandle}` : "Flim curator");
  const likeCount = mapped.likeCount || 0;
  const followerCount = mapped.followerCount || 0;
  const description = mapped.description || `${movieCount} ${movieCount === 1 ? "title" : "titles"} by ${creator}. Discover this playlist on Flim.`;
  const url = `https://www.flim.ca/p/${slug}`;
  const image = `https://www.flim.ca/api/og/playlist/${encodeURIComponent(slug)}`;
  const socialDescription = `${movieCount} ${movieCount === 1 ? "Title" : "Titles"} | ${followerCount} ${followerCount === 1 ? "Follower" : "Followers"} | ${likeCount} ${likeCount === 1 ? "Like" : "Likes"} | by ${creator} | Discover on Flim`;
  const replacement = [
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}" />`,
    `<meta property="og:title" content="${escapeHtml(mapped.name)}" />`,
    `<meta property="og:description" content="${escapeHtml(socialDescription)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:image" content="${escapeHtml(image)}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:url" content="${escapeHtml(url)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeHtml(mapped.name)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(socialDescription)}" />`,
    `<meta name="twitter:image" content="${escapeHtml(image)}" />`,
  ].join("\n    ");

  const cleaned = indexHtml
    .replace(/<title>.*?<\/title>/s, "")
    .replace(/\s*<meta name="description"[^>]*>\s*/g, "\n")
    .replace(/\s*<meta property="og:[^"]+"[^>]*>\s*/g, "\n")
    .replace(/\s*<meta name="twitter:[^"]+"[^>]*>\s*/g, "\n");

  return cleaned.replace("</head>", `    ${replacement}\n  </head>`);
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
