import { db, sendJson } from "../../_db.js";

type ProviderMediaType = "movie" | "tv";

const fallbackTemplates: Record<string, string> = {
  apple: "https://tv.apple.com/search?term={title}",
  crave: "https://www.crave.ca/en/search?query={title}",
  disney: "https://www.disneyplus.com/search?q={title}",
  google_tv: "https://tv.google.com/search/{title}",
  hulu: "https://www.hulu.com/search?q={title}",
  max: "https://www.max.com/search?q={title}",
  netflix: "https://www.netflix.com/search?q={title}",
  paramount: "https://www.paramountplus.com/search/?query={title}",
  plex: "https://watch.plex.tv/search?q={title}",
  prime: "https://www.primevideo.com/search/ref=atv_nb_sr?phrase={title}",
  tubi: "https://tubitv.com/search/{title}",
  youtube: "https://www.youtube.com/results?search_query={title}+movie",
};

function firstQueryValue(value: unknown) {
  return Array.isArray(value) ? String(value[0] || "") : String(value || "");
}

function normalizeMediaType(value: string): ProviderMediaType {
  return value === "tv" ? "tv" : "movie";
}

function normalizeRegion(value: string) {
  return value.trim().toUpperCase() || "CA";
}

function normalizeLinkType(value: string) {
  return value === "exact" ? "exact" : "search_fallback";
}

function buildSearchFallback(providerId: string, title: string) {
  const template = fallbackTemplates[providerId];
  const cleanTitle = title.trim();
  if (!template || !cleanTitle) return "";
  return template.replace("{title}", encodeURIComponent(cleanTitle));
}

function isSafeDestination(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

async function ensureAffiliateTables(sql: any) {
  await sql`
    create table if not exists provider_clicks (
      id uuid primary key default gen_random_uuid(),
      provider_id text not null,
      media_type text not null check (media_type in ('movie', 'tv')),
      tmdb_id integer not null,
      region text not null default 'CA',
      link_type text not null default 'search_fallback',
      destination_url text not null,
      referrer text,
      user_agent text,
      clicked_at timestamptz not null default now()
    )
  `;
  await sql`create index if not exists provider_clicks_provider_clicked_idx on provider_clicks (provider_id, clicked_at desc)`;
  await sql`create index if not exists provider_clicks_media_clicked_idx on provider_clicks (media_type, tmdb_id, clicked_at desc)`;
}

export default async function handler(request: any, response: any) {
  if (request.method !== "GET") return sendJson(response, 405, { error: "Method not allowed." });

  const providerId = String(request.query.providerId || "").trim();
  const tmdbId = Number(request.query.tmdbId);
  const mediaType = normalizeMediaType(firstQueryValue(request.query.mediaType));
  const region = normalizeRegion(firstQueryValue(request.query.region));
  const linkType = normalizeLinkType(firstQueryValue(request.query.linkType));
  const title = firstQueryValue(request.query.title);

  if (!providerId || !Number.isFinite(tmdbId)) {
    return sendJson(response, 400, { error: "A valid provider and title ID are required." });
  }

  try {
    const sql = db();
    await ensureAffiliateTables(sql);

    const rows = await sql`
      select coalesce(deep_link, search_fallback_url) as destination_url
      from provider_links
      where provider_id = ${providerId}
        and tmdb_id = ${tmdbId}
        and media_type = ${mediaType}
        and region = ${region}
        and link_type = ${linkType}
      order by created_at desc
      limit 1
    `;
    const destination = String(rows[0]?.destination_url || buildSearchFallback(providerId, title));

    if (!isSafeDestination(destination)) {
      return sendJson(response, 404, { error: "Provider destination is not available yet." });
    }

    await sql`
      insert into provider_clicks (
        provider_id,
        media_type,
        tmdb_id,
        region,
        link_type,
        destination_url,
        referrer,
        user_agent
      )
      values (
        ${providerId},
        ${mediaType},
        ${tmdbId},
        ${region},
        ${linkType},
        ${destination},
        ${String(request.headers.referer || request.headers.referrer || "").slice(0, 512) || null},
        ${String(request.headers["user-agent"] || "").slice(0, 512) || null}
      )
    `;

    response.statusCode = 302;
    response.setHeader("Location", destination);
    response.setHeader("Cache-Control", "no-store");
    response.end();
  } catch (error) {
    return sendJson(response, 500, { error: error instanceof Error ? error.message : "Provider link failed." });
  }
}
