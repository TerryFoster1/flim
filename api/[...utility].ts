import { db, ensurePlaylistMediaColumns, getCurrentUser, mapPlaylistMovie, readBody, sendJson } from "./_db.js";
import { ensureTmdbCacheTables, fetchTmdbMovieDetails } from "./_tmdb.js";

const schemaVersion = "2026-06-01-neon-hardening";
const titleDetailsCacheDays = 30;
const contentRatingVersion = 1;

function utilityPath(request: any) {
  const pathname = new URL(request.url || "", "https://www.flim.ca").pathname;
  const fromPath = pathname.split("/api/").pop()?.split("?")[0];
  if (fromPath && fromPath !== pathname) return fromPath;
  const value = request.query.utility;
  return Array.isArray(value) ? value.map(String).join("/") : String(value || "");
}

async function safeRows(sql: any, query: Promise<any[]>) {
  try {
    return await query;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("does not exist")) return [];
    throw error;
  }
}

async function handleContact(request: any, response: any) {
  if (request.method !== "POST") {
    return sendJson(response, 405, { error: "Method not allowed." });
  }

  const body = await readBody(request);
  const requiredFields = ["name", "email", "subject", "message"];
  const missing = requiredFields.filter((field) => !String(body[field] || "").trim());
  if (missing.length > 0) {
    return sendJson(response, 400, { error: "Please complete all contact fields." });
  }

  // TODO: Deliver through Resend, email forwarding, or a support inbox once
  // transactional email is configured. Keep the destination address server-side.
  return sendJson(response, 202, { ok: true, delivery: "queued_placeholder" });
}

async function handleAdminExport(request: any, response: any) {
  if (request.method !== "GET") {
    return sendJson(response, 405, { error: "Method not allowed." });
  }

  const providedSecret = String(request.headers?.["x-admin-export-secret"] || "");
  const expectedSecret = process.env.ADMIN_EXPORT_SECRET?.trim();
  if (!providedSecret || !expectedSecret || providedSecret !== expectedSecret) {
    return sendJson(response, 401, { error: "Unauthorized." });
  }

  const sql = db();
  const [
    playlists,
    playlistMovies,
    users,
    userProfiles,
    tmdbSearchCache,
    tmdbMovieCache,
  ] = await Promise.all([
    safeRows(sql, sql`select * from playlists order by updated_at desc`),
    safeRows(sql, sql`select * from playlist_movies order by added_at desc`),
    safeRows(sql, sql`select id, email, created_at from users order by created_at desc`),
    safeRows(sql, sql`select * from user_profiles order by updated_at desc`),
    safeRows(sql, sql`select * from tmdb_search_cache order by created_at desc`),
    safeRows(sql, sql`select * from tmdb_movie_cache order by created_at desc`),
  ]);

  return sendJson(response, 200, {
    generated_at: new Date().toISOString(),
    schema_version: schemaVersion,
    table_counts: {
      playlists: playlists.length,
      playlist_movies: playlistMovies.length,
      users: users.length,
      user_profiles: userProfiles.length,
      tmdb_search_cache: tmdbSearchCache.length,
      tmdb_movie_cache: tmdbMovieCache.length,
    },
    data: {
      playlists,
      playlist_movies: playlistMovies,
      users,
      user_profiles: userProfiles,
      tmdb_search_cache: tmdbSearchCache,
      tmdb_movie_cache: tmdbMovieCache,
    },
  });
}

async function handleTitleDetails(request: any, response: any) {
  if (request.method !== "GET") {
    return sendJson(response, 405, { error: "Method not allowed." });
  }

  response.setHeader("X-Flim-Title-Details", "ratings-v1");
  const requestedType = Array.isArray(request.query.type) ? request.query.type[0] : request.query.type;
  const mediaType = requestedType === "tv" ? "tv" : "movie";
  const tmdbId = Number(Array.isArray(request.query.id) ? request.query.id[0] : request.query.id);
  if (!Number.isFinite(tmdbId)) {
    return sendJson(response, 400, { error: mediaType === "tv" ? "A valid TV show ID is required." : "A valid movie ID is required." });
  }

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

  if (cached[0]?.response_json?.contentRatingVersion === contentRatingVersion) {
    response.setHeader("X-Flim-Cache", "HIT");
    return sendJson(response, 200, cached[0].response_json);
  }

  const title = await fetchTmdbMovieDetails(tmdbId, mediaType);
  await sql`
    insert into tmdb_movie_cache (tmdb_id, media_type, response_json, expires_at)
    values (${tmdbId}, ${mediaType}, ${JSON.stringify(title)}::jsonb, now() + (${titleDetailsCacheDays} * interval '1 day'))
    on conflict (media_type, tmdb_id)
    do update set
      response_json = excluded.response_json,
      created_at = now(),
      expires_at = excluded.expires_at
  `;

  response.setHeader("X-Flim-Cache", "MISS");
  return sendJson(response, 200, title);
}

async function handlePlaylistMovies(request: any, response: any) {
  const playlistId = String(Array.isArray(request.query.id) ? request.query.id[0] : request.query.id || "");

  try {
    const sql = db();
    await ensurePlaylistMediaColumns(sql);
    const user = await getCurrentUser(sql, request);

    if (request.method === "GET") {
      const movies = await sql`
        select pm.*
        from playlist_movies pm
        inner join playlists p on p.id = pm.playlist_id
        where pm.playlist_id = ${playlistId}
          and (
            p.visibility = 'public'
            or (${user?.id || null}::uuid is not null and p.owner_user_id = ${user?.id || null}::uuid)
          )
        order by added_at desc
      `;

      return sendJson(response, 200, movies.map(mapPlaylistMovie));
    }

    if (request.method === "POST") {
      if (!user) return sendJson(response, 401, { error: "Sign in to add movies." });
      const ownsPlaylist = await sql`select id from playlists where id = ${playlistId} and owner_user_id = ${user.id} limit 1`;
      if (!ownsPlaylist[0]) return sendJson(response, 403, { error: "Only the playlist owner can add movies." });

      const body = await readBody(request);
      const mediaType = body.mediaType === "tv" ? "tv" : "movie";
      const tmdbId = Number(body.tmdbId);
      const title = String(body.title || "").trim();

      if (!Number.isFinite(tmdbId) || tmdbId <= 0 || !title) {
        return sendJson(response, 400, { error: "Choose a valid movie or TV show before adding it." });
      }

      const [movie] = await sql`
        insert into playlist_movies (playlist_id, media_type, tmdb_id, title, year, poster_url, overview, runtime_minutes, season_count, episode_count, watched)
        values (${playlistId}, ${mediaType}, ${tmdbId}, ${title}, ${body.releaseYear || body.firstAirYear || null}, ${body.posterUrl || null}, ${body.overview || null}, ${body.runtimeMinutes || null}, ${body.seasonCount || null}, ${body.episodeCount || null}, false)
        on conflict (playlist_id, media_type, tmdb_id)
        do update set
          title = excluded.title,
          year = excluded.year,
          poster_url = excluded.poster_url,
          overview = excluded.overview,
          runtime_minutes = excluded.runtime_minutes,
          season_count = excluded.season_count,
          episode_count = excluded.episode_count
        returning *
      `;

      return sendJson(response, 201, mapPlaylistMovie(movie));
    }

    return sendJson(response, 405, { error: "Method not allowed." });
  } catch (error) {
    console.error("playlist_movies_utility_failed", {
      playlistId,
      method: request.method,
      message: error instanceof Error ? error.message : "Unknown playlist movie error",
    });
    return sendJson(response, 500, { error: "Unable to add movie. Please try again." });
  }
}

export default async function handler(request: any, response: any) {
  try {
    const path = utilityPath(request);
    if (path === "contact") return handleContact(request, response);
    if (path === "admin/export") return handleAdminExport(request, response);
    if (path === "title-details") return handleTitleDetails(request, response);
    if (path === "playlist-movies") return handlePlaylistMovies(request, response);
    return sendJson(response, 404, { error: "Not found." });
  } catch (error) {
    return sendJson(response, 500, { error: error instanceof Error ? error.message : "Request failed." });
  }
}
