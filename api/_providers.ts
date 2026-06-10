import { db } from "./_db.js";

export type ProviderMediaType = "movie" | "tv";

export interface ProviderAvailabilityLink {
  providerId: string;
  providerName: string;
  region: string;
  availabilityType: "subscription" | "rent" | "buy" | "free" | "library" | "unknown";
  deepLink?: string;
  searchFallbackUrl?: string;
  logoUrl?: string;
  source: "watchmode" | "justwatch" | "streaming_availability" | "tmdb" | "plex" | "manual";
}

const CACHE_DAYS = 3;
const TMDB_API_BASE_URL = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE_URL = "https://image.tmdb.org/t/p/w92";

const providerAliases: Record<string, string> = {
  "apple tv": "apple",
  "apple tv+": "apple",
  "crave": "crave",
  "disney plus": "disney",
  "disney+": "disney",
  "google play movies": "google_tv",
  "google tv": "google_tv",
  "hbo max": "max",
  "hulu": "hulu",
  "max": "max",
  "netflix": "netflix",
  "paramount plus": "paramount",
  "paramount+": "paramount",
  "plex": "plex",
  "prime video": "prime",
  "amazon prime video": "prime",
  "tubi": "tubi",
  "youtube": "youtube",
  "youtube movies": "youtube",
};

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

function normalizeProviderId(name: string) {
  const clean = name.toLowerCase().replace(/\s+/g, " ").trim();
  return providerAliases[clean] || clean.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function normalizedRegion(region?: string) {
  const clean = region?.trim().toUpperCase();
  return clean || "CA";
}

function searchFallbackUrl(providerId: string, title: string) {
  const template = fallbackTemplates[providerId];
  if (!template) return undefined;
  return template.replace("{title}", encodeURIComponent(title.trim()));
}

function mapWatchmodeAccessType(type?: string): ProviderAvailabilityLink["availabilityType"] {
  if (type === "sub") return "subscription";
  if (type === "rent") return "rent";
  if (type === "buy") return "buy";
  if (type === "free") return "free";
  return "unknown";
}

function watchmodeApiKey() {
  return process.env.WATCHMODE_API_KEY?.trim() || "";
}

function tmdbAccessToken() {
  return (
    process.env.TMDB_ACCESS_TOKEN?.trim() ||
    process.env.MOVIE_API_ACCESS_TOKEN?.trim() ||
    process.env.VITE_TMDB_ACCESS_TOKEN?.trim()
  );
}

function tmdbApiKey() {
  return (
    process.env.TMDB_API_KEY?.trim() ||
    process.env.MOVIE_API_KEY?.trim()
  );
}

function hasTmdbProviderSource() {
  return Boolean(tmdbAccessToken() || tmdbApiKey());
}

function applyTmdbAuth(url: URL): RequestInit {
  const token = tmdbAccessToken();
  if (token) {
    return {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    };
  }

  const key = tmdbApiKey();
  if (key) {
    url.searchParams.set("api_key", key);
  }

  return {};
}

async function runSchemaStatement(statement: Promise<unknown>) {
  try {
    await statement;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (
      message.includes("pg_type_typname_nsp_index") ||
      message.includes("pg_class_relname_nsp_index") ||
      message.includes("duplicate key value violates unique constraint") ||
      message.includes("already exists")
    ) {
      return;
    }
    throw error;
  }
}

export async function ensureProviderAvailabilityTables(sql: any) {
  await runSchemaStatement(sql`
    create table if not exists watch_providers (
      id text primary key,
      name text not null,
      logo_url text,
      icon_key text,
      source text not null default 'manual',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);
  await runSchemaStatement(sql`
    create table if not exists title_availability (
      id uuid primary key default gen_random_uuid(),
      media_type text not null check (media_type in ('movie', 'tv')),
      tmdb_id integer not null,
      region text not null default 'CA',
      provider_id text not null,
      provider_name text not null,
      logo_url text,
      availability_type text not null default 'unknown',
      deep_link text,
      search_fallback_url text,
      source text not null default 'manual',
      cached_at timestamptz not null default now(),
      expires_at timestamptz not null
    )
  `);
  await runSchemaStatement(sql`
    create table if not exists provider_links (
      id uuid primary key default gen_random_uuid(),
      media_type text not null check (media_type in ('movie', 'tv')),
      tmdb_id integer not null,
      provider_id text not null,
      region text not null default 'CA',
      deep_link text,
      search_fallback_url text,
      link_type text not null default 'search_fallback',
      created_at timestamptz not null default now()
    )
  `);
  await runSchemaStatement(sql`
    create table if not exists provider_region (
      id uuid primary key default gen_random_uuid(),
      provider_id text not null,
      region text not null default 'CA',
      supported boolean not null default true,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);
  await runSchemaStatement(sql`
    create table if not exists provider_availability_cache (
      id uuid primary key default gen_random_uuid(),
      media_type text not null check (media_type in ('movie', 'tv')),
      tmdb_id integer not null,
      region text not null default 'CA',
      source text not null,
      cached_at timestamptz not null default now(),
      expires_at timestamptz not null
    )
  `);
  await runSchemaStatement(sql`create unique index if not exists watch_providers_name_unique on watch_providers (name)`);
  await runSchemaStatement(sql`create unique index if not exists title_availability_media_provider_region_unique on title_availability (media_type, tmdb_id, region, provider_id, availability_type)`);
  await runSchemaStatement(sql`create index if not exists title_availability_media_tmdb_region_idx on title_availability (media_type, tmdb_id, region)`);
  await runSchemaStatement(sql`create index if not exists title_availability_expires_at_idx on title_availability (expires_at)`);
  await runSchemaStatement(sql`create index if not exists provider_links_media_tmdb_region_idx on provider_links (media_type, tmdb_id, region)`);
  await runSchemaStatement(sql`
    delete from provider_links a
    using provider_links b
    where a.ctid < b.ctid
      and a.media_type = b.media_type
      and a.tmdb_id = b.tmdb_id
      and a.provider_id = b.provider_id
      and a.region = b.region
      and a.link_type = b.link_type
  `);
  await runSchemaStatement(sql`create unique index if not exists provider_links_media_provider_region_unique on provider_links (media_type, tmdb_id, provider_id, region, link_type)`);
  await runSchemaStatement(sql`create unique index if not exists provider_region_provider_region_unique on provider_region (provider_id, region)`);
  await runSchemaStatement(sql`create unique index if not exists provider_availability_cache_media_region_unique on provider_availability_cache (media_type, tmdb_id, region, source)`);
  await runSchemaStatement(sql`create index if not exists provider_availability_cache_expires_at_idx on provider_availability_cache (expires_at)`);
  await runSchemaStatement(sql`
    create or replace view provider_availability as
    select
      id,
      media_type,
      tmdb_id,
      region,
      provider_id,
      provider_name,
      logo_url,
      availability_type,
      deep_link,
      search_fallback_url,
      source,
      cached_at,
      expires_at
    from title_availability
  `);
}

async function fetchWatchmodeAvailability(mediaType: ProviderMediaType, tmdbId: number, region: string, title: string) {
  const apiKey = watchmodeApiKey();
  if (!apiKey) return null;

  const watchmodeType = mediaType === "tv" ? "tv" : "movie";
  const url = new URL(`https://api.watchmode.com/v1/title/${watchmodeType}-${tmdbId}/sources/`);
  url.searchParams.set("apiKey", apiKey);
  url.searchParams.set("regions", region);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Provider availability lookup failed.");
  }

  const payload = (await response.json()) as Array<{
    source_id?: number;
    name?: string;
    type?: string;
    region?: string;
    web_url?: string;
    ios_url?: string;
    android_url?: string;
    logo_100px?: string;
  }>;

  const links = new Map<string, ProviderAvailabilityLink>();
  for (const item of payload || []) {
    if (!item.name) continue;
    const providerId = normalizeProviderId(item.name);
    const availabilityType = mapWatchmodeAccessType(item.type);
    const key = `${providerId}:${availabilityType}`;
    if (links.has(key)) continue;
    links.set(key, {
      providerId,
      providerName: item.name,
      region,
      availabilityType,
      deepLink: item.web_url || item.ios_url || item.android_url || undefined,
      searchFallbackUrl: searchFallbackUrl(providerId, title),
      logoUrl: item.logo_100px || undefined,
      source: "watchmode",
    });
  }

  return [...links.values()];
}

function mapTmdbAccessType(type: string): ProviderAvailabilityLink["availabilityType"] {
  if (type === "flatrate") return "subscription";
  if (type === "rent") return "rent";
  if (type === "buy") return "buy";
  if (type === "free" || type === "ads") return "free";
  return "unknown";
}

async function fetchTmdbProviderAvailability(mediaType: ProviderMediaType, tmdbId: number, region: string, title: string) {
  if (!hasTmdbProviderSource()) return null;

  const url = new URL(`${TMDB_API_BASE_URL}/${mediaType}/${tmdbId}/watch/providers`);
  const response = await fetch(url, applyTmdbAuth(url));
  if (!response.ok) {
    throw new Error("Provider availability lookup failed.");
  }

  const payload = (await response.json()) as {
    results?: Record<string, {
      link?: string;
      flatrate?: Array<{ provider_name?: string; logo_path?: string | null }>;
      rent?: Array<{ provider_name?: string; logo_path?: string | null }>;
      buy?: Array<{ provider_name?: string; logo_path?: string | null }>;
      free?: Array<{ provider_name?: string; logo_path?: string | null }>;
      ads?: Array<{ provider_name?: string; logo_path?: string | null }>;
    }>;
  };

  const regionPayload = payload.results?.[region];
  if (!regionPayload) return [];

  const links = new Map<string, ProviderAvailabilityLink>();
  for (const availabilityType of ["flatrate", "free", "ads", "rent", "buy"]) {
    const providers = regionPayload[availabilityType as keyof typeof regionPayload];
    if (!Array.isArray(providers)) continue;

    for (const provider of providers) {
      if (!provider.provider_name) continue;
      const providerId = normalizeProviderId(provider.provider_name);
      const accessType = mapTmdbAccessType(availabilityType);
      const key = `${providerId}:${accessType}`;
      if (links.has(key)) continue;

      links.set(key, {
        providerId,
        providerName: provider.provider_name,
        region,
        availabilityType: accessType,
        searchFallbackUrl: searchFallbackUrl(providerId, title) || regionPayload.link,
        logoUrl: provider.logo_path ? `${TMDB_IMAGE_BASE_URL}${provider.logo_path}` : undefined,
        source: "tmdb",
      });
    }
  }

  return [...links.values()];
}

export async function getCachedProviderAvailability(mediaType: ProviderMediaType, tmdbId: number, region = "CA") {
  const sql = db();
  await ensureProviderAvailabilityTables(sql);
  const rows = await sql`
    select provider_id, provider_name, region, availability_type, deep_link, search_fallback_url, logo_url, source, cached_at
    from title_availability
    where media_type = ${mediaType}
      and tmdb_id = ${tmdbId}
      and region = ${normalizedRegion(region)}
      and expires_at > now()
    order by
      case availability_type
        when 'library' then 0
        when 'subscription' then 1
        when 'free' then 2
        when 'rent' then 3
        when 'buy' then 4
        else 5
      end,
      provider_name asc
  `;

  return rows.map((row: any) => ({
    providerId: row.provider_id,
    providerName: row.provider_name,
    region: row.region,
    availabilityType: row.availability_type,
    deepLink: row.deep_link || undefined,
    searchFallbackUrl: row.search_fallback_url || undefined,
    logoUrl: row.logo_url || undefined,
    source: row.source,
  })) as ProviderAvailabilityLink[];
}

export async function getProviderAvailabilityCacheStatus(mediaType: ProviderMediaType, tmdbId: number, region = "CA") {
  const sql = db();
  await ensureProviderAvailabilityTables(sql);
  const rows = await sql`
    select source, cached_at
    from provider_availability_cache
    where media_type = ${mediaType}
      and tmdb_id = ${tmdbId}
      and region = ${normalizedRegion(region)}
      and expires_at > now()
    order by cached_at desc
    limit 1
  `;
  return rows[0] || null;
}

async function markProviderAvailabilityChecked(sql: any, mediaType: ProviderMediaType, tmdbId: number, region: string, source: string) {
  await sql`
    insert into provider_availability_cache (media_type, tmdb_id, region, source, cached_at, expires_at)
    values (${mediaType}, ${tmdbId}, ${region}, ${source}, now(), now() + (${CACHE_DAYS} * interval '1 day'))
    on conflict (media_type, tmdb_id, region, source)
    do update set
      cached_at = now(),
      expires_at = excluded.expires_at
  `;
}

export async function fetchAndCacheProviderAvailability(mediaType: ProviderMediaType, tmdbId: number, region = "CA", title: string) {
  const cleanRegion = normalizedRegion(region);
  const links = await fetchWatchmodeAvailability(mediaType, tmdbId, cleanRegion, title) ??
    await fetchTmdbProviderAvailability(mediaType, tmdbId, cleanRegion, title);
  if (!links) return null;

  const sql = db();
  await ensureProviderAvailabilityTables(sql);
  await markProviderAvailabilityChecked(sql, mediaType, tmdbId, cleanRegion, links[0]?.source || (hasTmdbProviderSource() ? "tmdb" : "watchmode"));
  for (const link of links) {
    await sql`
      insert into watch_providers (id, name, logo_url, icon_key, source, updated_at)
      values (${link.providerId}, ${link.providerName}, ${link.logoUrl || null}, ${link.providerId}, ${link.source}, now())
      on conflict (id)
      do update set
        name = excluded.name,
        logo_url = coalesce(excluded.logo_url, watch_providers.logo_url),
        icon_key = excluded.icon_key,
        source = excluded.source,
        updated_at = now()
    `;
    await sql`
      insert into provider_region (provider_id, region, supported, updated_at)
      values (${link.providerId}, ${cleanRegion}, true, now())
      on conflict (provider_id, region)
      do update set supported = true, updated_at = now()
    `;
    await sql`
      insert into title_availability (
        media_type,
        tmdb_id,
        region,
        provider_id,
        provider_name,
        logo_url,
        availability_type,
        deep_link,
        search_fallback_url,
        source,
        cached_at,
        expires_at
      )
      values (
        ${mediaType},
        ${tmdbId},
        ${cleanRegion},
        ${link.providerId},
        ${link.providerName},
        ${link.logoUrl || null},
        ${link.availabilityType},
        ${link.deepLink || null},
        ${link.searchFallbackUrl || null},
        ${link.source},
        now(),
        now() + (${CACHE_DAYS} * interval '1 day')
      )
      on conflict (media_type, tmdb_id, region, provider_id, availability_type)
      do update set
        provider_name = excluded.provider_name,
        logo_url = excluded.logo_url,
        deep_link = excluded.deep_link,
        search_fallback_url = excluded.search_fallback_url,
        source = excluded.source,
        cached_at = now(),
        expires_at = excluded.expires_at
    `;
    await sql`
      insert into provider_links (
        media_type,
        tmdb_id,
        provider_id,
        region,
        deep_link,
        search_fallback_url,
        link_type
      )
      values (
        ${mediaType},
        ${tmdbId},
        ${link.providerId},
        ${cleanRegion},
        ${link.deepLink || null},
        ${link.searchFallbackUrl || null},
        ${link.deepLink ? "exact" : "search_fallback"}
      )
      on conflict (media_type, tmdb_id, provider_id, region, link_type)
      do update set
        deep_link = excluded.deep_link,
        search_fallback_url = excluded.search_fallback_url
    `;
  }

  return links;
}

export function hasProviderAvailabilitySource() {
  return Boolean(watchmodeApiKey() || hasTmdbProviderSource());
}
