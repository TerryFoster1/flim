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
  const cleanQuery = typeof query === "string" ? query.trim() : "";
  const normalizedQuery = normalizeMovieQuery(cleanQuery);

  if (!normalizedQuery) return sendJson(response, 200, []);

  const sql = db();
  await ensureTmdbCacheTables(sql);
  const cached = await sql`
    select response_json
    from tmdb_search_cache
    where normalized_query = ${normalizedQuery}
      and expires_at > now()
    order by created_at desc
    limit 1
  `;

  if (cached[0]) {
    response.setHeader("X-Flim-Cache", "HIT");
    return sendJson(response, 200, cached[0].response_json);
  }

  const movies = await fetchTmdbSearch(cleanQuery);
  await sql`
    insert into tmdb_search_cache (query, normalized_query, response_json, expires_at)
    values (${cleanQuery}, ${normalizedQuery}, ${JSON.stringify(movies)}::jsonb, now() + (${SEARCH_CACHE_DAYS} * interval '1 day'))
    on conflict (normalized_query)
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
  const sql = db();
  await ensureTmdbCacheTables(sql);
  const cached = await sql`
    select response_json
    from tmdb_movie_cache
    where tmdb_id = ${tmdbId}
      and expires_at > now()
    order by created_at desc
    limit 1
  `;

  if (cached[0]) {
    response.setHeader("X-Flim-Cache", "HIT");
    return sendJson(response, 200, cached[0].response_json);
  }

  const movie = await fetchTmdbMovieDetails(tmdbId);
  await sql`
    insert into tmdb_movie_cache (tmdb_id, response_json, expires_at)
    values (${tmdbId}, ${JSON.stringify(movie)}::jsonb, now() + (${MOVIE_CACHE_DAYS} * interval '1 day'))
    on conflict (tmdb_id)
    do update set
      response_json = excluded.response_json,
      created_at = now(),
      expires_at = excluded.expires_at
  `;

  response.setHeader("X-Flim-Cache", "MISS");
  return sendJson(response, 200, movie);
}

export default async function handler(request: any, response: any) {
  if (request.method !== "GET") return sendJson(response, 405, { error: "Method not allowed." });

  try {
    const path = moviePath(request);
    if (path === "search") return handleSearch(request, response);

    const tmdbId = Number(path);
    if (!Number.isFinite(tmdbId)) return sendJson(response, 400, { error: "A valid TMDb movie ID is required." });
    return handleMovieDetails(tmdbId, response);
  } catch (error) {
    return sendJson(response, 500, { error: error instanceof Error ? error.message : "Movie request failed." });
  }
}
