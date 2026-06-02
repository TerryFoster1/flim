import { db, sendJson } from "../_db.js";
import { ensureTmdbCacheTables, fetchTmdbMovieDetails } from "../_tmdb.js";

const MOVIE_CACHE_DAYS = 30;
const CONTENT_RATING_VERSION = 1;

function titlePath(request: any) {
  const pathname = new URL(request.url || "", "https://www.flim.ca").pathname;
  const fromPath = pathname.split("/api/title-details/").pop()?.split("?")[0];
  if (fromPath && fromPath !== pathname) return fromPath;
  const value = request.query.title;
  return Array.isArray(value) ? value.map(String).join("/") : String(value || "");
}

async function handleTitleDetails(tmdbId: number, mediaType: "movie" | "tv", response: any) {
  response.setHeader("X-Flim-Title-Details", "ratings-v1");
  const sql = db();
  await ensureTmdbCacheTables(sql);
  const cached = await sql`
    select response_json
    from tmdb_movie_cache
    where tmdb_id = ${tmdbId}
      and media_type = ${mediaType}
      and expires_at > now()
    order by created_at desc
    limit 1
  `;

  if (cached[0]?.response_json?.contentRatingVersion === CONTENT_RATING_VERSION) {
    response.setHeader("X-Flim-Cache", "HIT");
    return sendJson(response, 200, cached[0].response_json);
  }

  const title = await fetchTmdbMovieDetails(tmdbId, mediaType);
  await sql`
    insert into tmdb_movie_cache (tmdb_id, media_type, response_json, expires_at)
    values (${tmdbId}, ${mediaType}, ${JSON.stringify(title)}::jsonb, now() + (${MOVIE_CACHE_DAYS} * interval '1 day'))
    on conflict (media_type, tmdb_id)
    do update set
      response_json = excluded.response_json,
      created_at = now(),
      expires_at = excluded.expires_at
  `;

  response.setHeader("X-Flim-Cache", "MISS");
  return sendJson(response, 200, title);
}

export default async function handler(request: any, response: any) {
  if (request.method !== "GET") return sendJson(response, 405, { error: "Method not allowed." });

  try {
    const requestedType = Array.isArray(request.query.type) ? request.query.type[0] : request.query.type;
    const mediaType = requestedType === "tv" ? "tv" : "movie";
    const tmdbId = Number(titlePath(request));
    if (!Number.isFinite(tmdbId)) {
      return sendJson(response, 400, { error: mediaType === "tv" ? "A valid TV show ID is required." : "A valid movie ID is required." });
    }

    return handleTitleDetails(tmdbId, mediaType, response);
  } catch (error) {
    console.error("title_details_failed", {
      message: error instanceof Error ? error.message : "Unknown title details error",
    });
    return sendJson(response, 500, { error: "Title details failed. Please try again." });
  }
}
