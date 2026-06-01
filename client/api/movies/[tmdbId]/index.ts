import { db, sendJson } from "../../_db.js";
import { fetchTmdbMovieDetails } from "../../_tmdb.js";

const MOVIE_CACHE_DAYS = 30;

export default async function handler(request: any, response: any) {
  if (request.method !== "GET") {
    return sendJson(response, 405, { error: "Method not allowed." });
  }

  const tmdbId = Number(request.query.tmdbId);
  if (!Number.isFinite(tmdbId)) {
    return sendJson(response, 400, { error: "A valid TMDb movie ID is required." });
  }

  try {
    const sql = db();
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
  } catch (error) {
    return sendJson(response, 500, { error: error instanceof Error ? error.message : "Movie details failed." });
  }
}
