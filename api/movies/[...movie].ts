import { db, sendJson } from "../_db.js";
import { ensureTmdbCacheTables, fetchTmdbMovieDetails, fetchTmdbSearch, normalizeMovieQuery } from "../_tmdb.js";

const SEARCH_CACHE_DAYS = 7;
const MOVIE_CACHE_DAYS = 30;

function moviePath(request: any) {
  const pathname = new URL(request.url || "", "https://www.flim.ca").pathname;
  const fromPath = pathname.split("/api/movies/").pop()?.split("?")[0];
  if (fromPath && fromPath !== pathname) return fromPath;
  const value = request.query.movie;
  return Array.isArray(value) ? value.map(String).join("/") : String(value || "");
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
    response.setHeader("X-Flim-Cache", "HIT");
    return sendJson(response, 200, cached[0].response_json);
  }

  const movies = await fetchTmdbSearch(cleanQuery, mediaType);
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

  response.setHeader("X-Flim-Cache", "MISS");
  return sendJson(response, 200, movies);
}

async function handleMovieDetails(tmdbId: number, response: any) {
  response.setHeader("X-Flim-Movie-Function", "ratings-v1");
  const sql = db();
  await ensureTmdbCacheTables(sql);
  const cached = await sql`
      select response_json
      from tmdb_movie_cache
      where tmdb_id = ${tmdbId}
        and media_type = 'movie'
      and expires_at > now()
    order by created_at desc
    limit 1
  `;

  if (cached[0]?.response_json?.contentRatingVersion === 1) {
    response.setHeader("X-Flim-Cache", "HIT");
    return sendJson(response, 200, cached[0].response_json);
  }

  const movie = await fetchTmdbMovieDetails(tmdbId, "movie");
  await sql`
    insert into tmdb_movie_cache (tmdb_id, media_type, response_json, expires_at)
    values (${tmdbId}, 'movie', ${JSON.stringify(movie)}::jsonb, now() + (${MOVIE_CACHE_DAYS} * interval '1 day'))
    on conflict (media_type, tmdb_id)
    do update set
      response_json = excluded.response_json,
      created_at = now(),
      expires_at = excluded.expires_at
  `;

  response.setHeader("X-Flim-Cache", "MISS");
  return sendJson(response, 200, movie);
}

async function handleTvDetails(tmdbId: number, response: any) {
  response.setHeader("X-Flim-Movie-Function", "ratings-v1");
  const sql = db();
  await ensureTmdbCacheTables(sql);
  const cached = await sql`
    select response_json
    from tmdb_movie_cache
    where tmdb_id = ${tmdbId}
      and media_type = 'tv'
      and expires_at > now()
    order by created_at desc
    limit 1
  `;

  if (cached[0]?.response_json?.contentRatingVersion === 1) {
    response.setHeader("X-Flim-Cache", "HIT");
    return sendJson(response, 200, cached[0].response_json);
  }

  const show = await fetchTmdbMovieDetails(tmdbId, "tv");
  await sql`
    insert into tmdb_movie_cache (tmdb_id, media_type, response_json, expires_at)
    values (${tmdbId}, 'tv', ${JSON.stringify(show)}::jsonb, now() + (${MOVIE_CACHE_DAYS} * interval '1 day'))
    on conflict (media_type, tmdb_id)
    do update set
      response_json = excluded.response_json,
      created_at = now(),
      expires_at = excluded.expires_at
  `;

  response.setHeader("X-Flim-Cache", "MISS");
  return sendJson(response, 200, show);
}

export default async function handler(request: any, response: any) {
  if (request.method !== "GET") return sendJson(response, 405, { error: "Method not allowed." });

  try {
    const path = moviePath(request);
    if (path === "search") return handleSearch(request, response);
    const requestedType = Array.isArray(request.query.type) ? request.query.type[0] : request.query.type;
    if (path.startsWith("tv/")) {
      const tmdbId = Number(path.split("/")[1]);
      if (!Number.isFinite(tmdbId)) return sendJson(response, 400, { error: "A valid TV show ID is required." });
      return handleTvDetails(tmdbId, response);
    }

    const tmdbId = Number(path);
    if (!Number.isFinite(tmdbId)) return sendJson(response, 400, { error: "A valid movie ID is required." });
    if (requestedType === "tv") return handleTvDetails(tmdbId, response);
    return handleMovieDetails(tmdbId, response);
  } catch (error) {
    return sendJson(response, 500, { error: error instanceof Error ? error.message : "Movie request failed." });
  }
}
