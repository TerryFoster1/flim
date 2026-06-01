import { db, sendJson } from "../../_db.js";
import { fetchTmdbSearch, normalizeMovieQuery } from "../../_tmdb.js";

const SEARCH_CACHE_DAYS = 7;

export default async function handler(request: any, response: any) {
  if (request.method !== "GET") {
    return sendJson(response, 405, { error: "Method not allowed." });
  }

  const query = Array.isArray(request.query.q) ? request.query.q[0] : request.query.q;
  const cleanQuery = typeof query === "string" ? query.trim() : "";
  const normalizedQuery = normalizeMovieQuery(cleanQuery);

  if (!normalizedQuery) {
    return sendJson(response, 200, []);
  }

  try {
    const sql = db();
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
  } catch (error) {
    return sendJson(response, 500, { error: error instanceof Error ? error.message : "Movie search failed." });
  }
}
