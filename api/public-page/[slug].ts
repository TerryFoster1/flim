import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { db, mapPlaylist } from "../_db.js";
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
  const description = mapped.description || `${movieCount} ${movieCount === 1 ? "movie" : "movies"} shared via Flim.`;
  const url = `https://www.flim.ca/p/${slug}`;
  const image = mapped.movies.find((movie: any) => movie.posterUrl)?.posterUrl || "https://www.flim.ca/brand/flim-og-image.png";
  const replacement = [
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}" />`,
    `<meta property="og:title" content="${escapeHtml(mapped.name)}" />`,
    `<meta property="og:description" content="${escapeHtml(`${movieCount} ${movieCount === 1 ? "Movie" : "Movies"} · Shared via Flim`)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:image" content="${escapeHtml(image)}" />`,
    `<meta property="og:url" content="${escapeHtml(url)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeHtml(mapped.name)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(description)}" />`,
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
    await ensureDirectorSeed(sql).catch((error) => {
      console.error("director_seed_failed", error instanceof Error ? error.message : "Director seed failed");
    });

    const rows = await sql`
      select
        p.*,
        coalesce(
          json_agg(pm order by coalesce(pm.sort_order, 2147483647), pm.added_at desc) filter (where pm.id is not null),
          '[]'
        ) as movies
      from playlists p
      left join playlist_movies pm on pm.playlist_id = p.id
      where p.public_slug = ${slug}
        and p.visibility = 'public'
      group by p.id
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
