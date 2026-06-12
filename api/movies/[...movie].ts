import { db, sendJson } from "../_db.js";
import {
  findCatalogSearchResults,
  getCatalogMediaItem,
  mapCatalogDetails,
  mapCatalogSearchResult,
  upsertMediaCast,
  upsertMediaItem,
  upsertMediaItems,
} from "../_mediaCatalog.js";
import { ensureTmdbCacheTables, fetchTmdbMovieDetails, fetchTmdbSearch, normalizeMovieQuery } from "../_tmdb.js";

const SEARCH_CACHE_DAYS = 7;
const MOVIE_CACHE_DAYS = 30;
const USEFUL_SEARCH_RESULT_COUNT = 8;
const MAX_SEARCH_RESULTS = 24;

function hasCoreTitlePayload(details: any, mediaType: "movie" | "tv", tmdbId: number) {
  const id = Number(details?.tmdbId ?? details?.tmdb_id);
  const title = typeof details?.title === "string" ? details.title.trim() : "";
  const type = details?.mediaType || details?.media_type || mediaType;
  return Number.isFinite(id) && id === tmdbId && type === mediaType && title.length > 0;
}

function titleFailureReason(error: unknown) {
  return error instanceof Error ? error.message : "TMDb details fetch failed.";
}

function logTitleDetailsIssue(event: string, details: Record<string, unknown>) {
  console.warn(event, {
    route: `/api/movies/${details.mediaType === "tv" ? `${details.tmdbId}?type=tv` : details.tmdbId}`,
    ...details,
  });
}

function sendDetailsJson(response: any, status: number, payload: any, startedAt: number, details: Record<string, unknown>) {
  const durationMs = Date.now() - startedAt;
  response.setHeader("X-Flim-Details-Duration-Ms", String(durationMs));
  console.info("title_details_api_complete", {
    durationMs,
    cache: response.getHeader?.("X-Flim-Cache"),
    catalog: response.getHeader?.("X-Flim-Catalog"),
    ...details,
  });
  return sendJson(response, status, payload);
}

function moviePath(request: any) {
  const pathname = new URL(request.url || "", "https://www.flim.ca").pathname;
  const fromPath = pathname.split("/api/movies/").pop()?.split("?")[0];
  if (fromPath && fromPath !== pathname) return fromPath;
  const value = request.query.movie;
  return Array.isArray(value) ? value.map(String).join("/") : String(value || "");
}

function mergeSearchResults(primary: any[], secondary: any[]) {
  const seen = new Set<string>();
  const merged: any[] = [];

  for (const item of [...primary, ...secondary]) {
    const key = `${item.mediaType || "movie"}-${item.tmdbId}`;
    if (!item.tmdbId || seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
    if (merged.length >= MAX_SEARCH_RESULTS) break;
  }

  return merged;
}

async function handleSearch(request: any, response: any) {
  const query = Array.isArray(request.query.q) ? request.query.q[0] : request.query.q;
  const requestedType = Array.isArray(request.query.type) ? request.query.type[0] : request.query.type;
  const mediaType = requestedType === "movie" || requestedType === "tv" ? requestedType : "both";
  const cleanQuery = typeof query === "string" ? query.trim() : "";
  const normalizedQuery = normalizeMovieQuery(cleanQuery);

  if (!cleanQuery || !normalizedQuery) return sendJson(response, 200, []);

  const sql = db();
  await ensureTmdbCacheTables(sql);
  const catalogRows = await findCatalogSearchResults(sql, cleanQuery, mediaType);
  const catalogResults = catalogRows.map(mapCatalogSearchResult);
  if (catalogResults.length >= USEFUL_SEARCH_RESULT_COUNT) {
    response.setHeader("X-Flim-Catalog", "HIT");
    response.setHeader("X-Flim-Cache", "SKIP");
    return sendJson(response, 200, catalogResults.slice(0, MAX_SEARCH_RESULTS));
  }

  const cached = await sql`
      select response_json
      from tmdb_search_cache
      where normalized_query = ${normalizedQuery}
        and media_type = ${mediaType}
      and expires_at > now()
    order by created_at desc
    limit 1
  `;

  if (cached[0]) {
    await upsertMediaItems(sql, cached[0].response_json || []);
    response.setHeader("X-Flim-Catalog", catalogResults.length ? "PARTIAL" : "MISS");
    response.setHeader("X-Flim-Cache", "HIT");
    return sendJson(response, 200, mergeSearchResults(catalogResults, cached[0].response_json || []));
  }

  const movies = await fetchTmdbSearch(cleanQuery, mediaType);
  await upsertMediaItems(sql, movies);
  await sql`
    insert into tmdb_search_cache (query, normalized_query, media_type, response_json, expires_at)
    values (${cleanQuery}, ${normalizedQuery}, ${mediaType}, ${JSON.stringify(movies)}::jsonb, now() + (${SEARCH_CACHE_DAYS} * interval '1 day'))
    on conflict (media_type, normalized_query)
    do update set
      query = excluded.query,
      response_json = excluded.response_json,
      created_at = now(),
      expires_at = excluded.expires_at
  `;

  response.setHeader("X-Flim-Catalog", catalogResults.length ? "PARTIAL" : "MISS");
  response.setHeader("X-Flim-Cache", "MISS");
  return sendJson(response, 200, mergeSearchResults(catalogResults, movies));
}

async function handleMovieDetails(tmdbId: number, response: any, forceRefresh = false) {
  const startedAt = Date.now();
  response.setHeader("X-Flim-Movie-Function", "ratings-v1");
  const sql = db();
  await ensureTmdbCacheTables(sql);
  const catalogItem = await getCatalogMediaItem(sql, tmdbId, "movie");
  const catalogDetails = catalogItem ? mapCatalogDetails(catalogItem) : null;

  const cached = forceRefresh ? [] : await sql`
      select response_json
      from tmdb_movie_cache
      where tmdb_id = ${tmdbId}
        and media_type = 'movie'
      and expires_at > now()
    order by created_at desc
    limit 1
  `;
  const staleCached = await sql`
      select response_json
      from tmdb_movie_cache
      where tmdb_id = ${tmdbId}
        and media_type = 'movie'
    order by created_at desc
    limit 1
  `;

  if (hasCoreTitlePayload(cached[0]?.response_json, "movie", tmdbId)) {
    await upsertMediaItem(sql, cached[0].response_json);
    response.setHeader("X-Flim-Catalog", catalogItem ? "STALE" : "MISS");
    response.setHeader("X-Flim-Cache", "HIT");
    return sendDetailsJson(response, 200, cached[0].response_json, startedAt, { tmdbId, mediaType: "movie", source: "fresh_cache" });
  }

  if (!forceRefresh && hasCoreTitlePayload(catalogDetails, "movie", tmdbId)) {
    response.setHeader("X-Flim-Catalog", "HIT");
    response.setHeader("X-Flim-Cache", "MISS");
    return sendDetailsJson(response, 200, catalogDetails, startedAt, { tmdbId, mediaType: "movie", source: "catalog" });
  }

  let movie;
  try {
    movie = await fetchTmdbMovieDetails(tmdbId, "movie");
  } catch (error) {
    if (hasCoreTitlePayload(catalogDetails, "movie", tmdbId)) {
      logTitleDetailsIssue("title_details_catalog_fallback", {
        tmdbId,
        mediaType: "movie",
        reason: titleFailureReason(error),
        hasCoreData: true,
      });
      response.setHeader("X-Flim-Catalog", "FALLBACK");
      response.setHeader("X-Flim-Cache", "ERROR");
      return sendDetailsJson(response, 200, catalogDetails, startedAt, { tmdbId, mediaType: "movie", source: "catalog_fallback" });
    }
    if (hasCoreTitlePayload(staleCached[0]?.response_json, "movie", tmdbId)) {
      logTitleDetailsIssue("title_details_stale_cache_fallback", {
        tmdbId,
        mediaType: "movie",
        reason: titleFailureReason(error),
        hasCoreData: true,
      });
      response.setHeader("X-Flim-Catalog", catalogItem ? "STALE" : "MISS");
      response.setHeader("X-Flim-Cache", "STALE");
      return sendDetailsJson(response, 200, staleCached[0].response_json, startedAt, { tmdbId, mediaType: "movie", source: "stale_cache" });
    }
    logTitleDetailsIssue("title_details_fetch_failed", {
      tmdbId,
      mediaType: "movie",
      reason: titleFailureReason(error),
      hasCoreData: false,
    });
    throw error;
  }
  const mediaItem = await upsertMediaItem(sql, movie);
  await upsertMediaCast(sql, mediaItem, movie.cast || []);
  await sql`
    insert into tmdb_movie_cache (tmdb_id, media_type, response_json, expires_at)
    values (${tmdbId}, 'movie', ${JSON.stringify(movie)}::jsonb, now() + (${MOVIE_CACHE_DAYS} * interval '1 day'))
    on conflict (media_type, tmdb_id)
    do update set
      response_json = excluded.response_json,
      created_at = now(),
      expires_at = excluded.expires_at
  `;

  response.setHeader("X-Flim-Catalog", catalogItem ? "STALE" : "MISS");
  response.setHeader("X-Flim-Cache", "MISS");
  return sendDetailsJson(response, 200, movie, startedAt, { tmdbId, mediaType: "movie", source: "tmdb" });
}

async function handleTvDetails(tmdbId: number, response: any, forceRefresh = false) {
  const startedAt = Date.now();
  response.setHeader("X-Flim-Movie-Function", "ratings-v1");
  const sql = db();
  await ensureTmdbCacheTables(sql);
  const catalogItem = await getCatalogMediaItem(sql, tmdbId, "tv");
  const catalogDetails = catalogItem ? mapCatalogDetails(catalogItem) : null;

  const cached = forceRefresh ? [] : await sql`
    select response_json
    from tmdb_movie_cache
    where tmdb_id = ${tmdbId}
      and media_type = 'tv'
      and expires_at > now()
    order by created_at desc
    limit 1
  `;
  const staleCached = await sql`
    select response_json
    from tmdb_movie_cache
    where tmdb_id = ${tmdbId}
      and media_type = 'tv'
    order by created_at desc
    limit 1
  `;

  if (hasCoreTitlePayload(cached[0]?.response_json, "tv", tmdbId)) {
    await upsertMediaItem(sql, cached[0].response_json);
    response.setHeader("X-Flim-Catalog", catalogItem ? "STALE" : "MISS");
    response.setHeader("X-Flim-Cache", "HIT");
    return sendDetailsJson(response, 200, cached[0].response_json, startedAt, { tmdbId, mediaType: "tv", source: "fresh_cache" });
  }

  if (!forceRefresh && hasCoreTitlePayload(catalogDetails, "tv", tmdbId)) {
    response.setHeader("X-Flim-Catalog", "HIT");
    response.setHeader("X-Flim-Cache", "MISS");
    return sendDetailsJson(response, 200, catalogDetails, startedAt, { tmdbId, mediaType: "tv", source: "catalog" });
  }

  let show;
  try {
    show = await fetchTmdbMovieDetails(tmdbId, "tv");
  } catch (error) {
    if (hasCoreTitlePayload(catalogDetails, "tv", tmdbId)) {
      logTitleDetailsIssue("title_details_catalog_fallback", {
        tmdbId,
        mediaType: "tv",
        reason: titleFailureReason(error),
        hasCoreData: true,
      });
      response.setHeader("X-Flim-Catalog", "FALLBACK");
      response.setHeader("X-Flim-Cache", "ERROR");
      return sendDetailsJson(response, 200, catalogDetails, startedAt, { tmdbId, mediaType: "tv", source: "catalog_fallback" });
    }
    if (hasCoreTitlePayload(staleCached[0]?.response_json, "tv", tmdbId)) {
      logTitleDetailsIssue("title_details_stale_cache_fallback", {
        tmdbId,
        mediaType: "tv",
        reason: titleFailureReason(error),
        hasCoreData: true,
      });
      response.setHeader("X-Flim-Catalog", catalogItem ? "STALE" : "MISS");
      response.setHeader("X-Flim-Cache", "STALE");
      return sendDetailsJson(response, 200, staleCached[0].response_json, startedAt, { tmdbId, mediaType: "tv", source: "stale_cache" });
    }
    logTitleDetailsIssue("title_details_fetch_failed", {
      tmdbId,
      mediaType: "tv",
      reason: titleFailureReason(error),
      hasCoreData: false,
    });
    throw error;
  }
  const mediaItem = await upsertMediaItem(sql, show);
  await upsertMediaCast(sql, mediaItem, show.cast || []);
  await sql`
    insert into tmdb_movie_cache (tmdb_id, media_type, response_json, expires_at)
    values (${tmdbId}, 'tv', ${JSON.stringify(show)}::jsonb, now() + (${MOVIE_CACHE_DAYS} * interval '1 day'))
    on conflict (media_type, tmdb_id)
    do update set
      response_json = excluded.response_json,
      created_at = now(),
      expires_at = excluded.expires_at
  `;

  response.setHeader("X-Flim-Catalog", catalogItem ? "STALE" : "MISS");
  response.setHeader("X-Flim-Cache", "MISS");
  return sendDetailsJson(response, 200, show, startedAt, { tmdbId, mediaType: "tv", source: "tmdb" });
}

export default async function handler(request: any, response: any) {
  if (request.method !== "GET") return sendJson(response, 405, { error: "Method not allowed." });

  try {
    const path = moviePath(request);
    if (path === "search") return handleSearch(request, response);
    const requestedType = Array.isArray(request.query.type) ? request.query.type[0] : request.query.type;
    const refreshMode = Array.isArray(request.query.refreshMode) ? request.query.refreshMode[0] : request.query.refreshMode;
    const forceRefresh = refreshMode === "source" || request.query.refresh === "source";
    if (path.startsWith("tv/")) {
      const tmdbId = Number(path.split("/")[1]);
      if (!Number.isFinite(tmdbId)) return sendJson(response, 400, { error: "A valid TV show ID is required." });
      return handleTvDetails(tmdbId, response, forceRefresh);
    }

    const tmdbId = Number(path);
    if (!Number.isFinite(tmdbId)) return sendJson(response, 400, { error: "A valid movie ID is required." });
    if (requestedType === "tv") return handleTvDetails(tmdbId, response, forceRefresh);
    return handleMovieDetails(tmdbId, response, forceRefresh);
  } catch (error) {
    return sendJson(response, 500, { error: error instanceof Error ? error.message : "Movie request failed." });
  }
}
