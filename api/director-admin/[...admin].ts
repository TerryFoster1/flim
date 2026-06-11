import { createHmac, timingSafeEqual } from "node:crypto";
import {
  createPublicSlug,
  createPublicSlugBase,
  db,
  ensurePlaylistMediaColumns,
  ensureUserProfilesTable,
  mapPlaylist,
  mapPlaylistMovie,
  readBody,
  sendJson,
} from "../_db.js";
import { directorHandle, directorUserId, ensureDirectorSeed } from "../_director.js";
import { cleanSeasonalChallengeInput, ensureSeasonalChallengeTables } from "../_seasonalChallenges.js";

const cookieName = "flim_director_admin";
const sessionMaxAgeSeconds = 60 * 60 * 8;

function getAdminConfig() {
  const username = process.env.DIRECTOR_ADMIN_USERNAME?.trim();
  const password = process.env.DIRECTOR_ADMIN_PASSWORD?.trim();
  return username && password ? { username, password } : null;
}

function sign(value: string, secret: string) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function createAdminToken(username: string, secret: string) {
  const payload = Buffer.from(JSON.stringify({ sub: username, exp: Date.now() + sessionMaxAgeSeconds * 1000 })).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

function getCookie(request: any, name: string) {
  const header = String(request.headers?.cookie || "");
  const match = header.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : "";
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function readAdminSession(request: any) {
  const config = getAdminConfig();
  if (!config) return null;
  const token = getCookie(request, cookieName);
  const [payload, signature] = token.split(".");
  if (!payload || !signature || !safeEqual(signature, sign(payload, config.password))) return null;

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (parsed.sub !== config.username || Number(parsed.exp) < Date.now()) return null;
    return { username: config.username };
  } catch {
    return null;
  }
}

function setAdminCookie(response: any, token: string) {
  response.setHeader(
    "Set-Cookie",
    `${cookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${sessionMaxAgeSeconds}`,
  );
}

function clearAdminCookie(response: any) {
  response.setHeader("Set-Cookie", `${cookieName}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
}

function getSegments(request: any) {
  const pathname = new URL(request.url || "", "https://www.flim.ca").pathname;
  const fromPathname = pathname.split("/api/director-admin/").pop();
  if (fromPathname && fromPathname !== pathname) return fromPathname.split("?")[0].split("/").filter(Boolean);

  const value = request.query.admin;
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  return String(value || "").split("/").filter(Boolean);
}

async function createUniquePublicSlug(sql: any, name: string, currentPlaylistId?: string) {
  const base = createPublicSlugBase(name);
  const candidates = [base, ...Array.from({ length: 5 }, () => createPublicSlug(name))];

  for (const candidate of candidates) {
    const rows = currentPlaylistId
      ? await sql`select id from playlists where public_slug = ${candidate} and id <> ${currentPlaylistId} limit 1`
      : await sql`select id from playlists where public_slug = ${candidate} limit 1`;
    if (!rows[0]) return candidate;
  }

  return createPublicSlug(name);
}

async function ensureDirectorProfile(sql: any) {
  await ensureUserProfilesTable(sql);
  await sql`
    create table if not exists director_profile (
      id text primary key default 'the-director',
      display_name text not null default 'The Director',
      bio text not null default 'Curating movie collections for Flim.',
      tagline text not null default 'Official Flim editorial curator.',
      quote text not null default 'Some movies deserve a second watch.',
      updated_at timestamptz not null default now()
    )
  `;
  await sql`
    insert into director_profile (id)
    values ('the-director')
    on conflict (id) do nothing
  `;
}

async function getDirectorPlaylists(sql: any) {
  await ensureDirectorSeed(sql);
  const rows = await sql`
    select
      p.*,
      ${directorHandle} as creator_handle,
      'The Director' as creator_display_name,
      true as is_owner,
      coalesce(
        json_agg(pm order by coalesce(pm.sort_order, 2147483647), pm.added_at desc) filter (where pm.id is not null),
        '[]'
      ) as movies
    from playlists p
    left join playlist_movies pm on pm.playlist_id = p.id
    where p.owner_user_id = ${directorUserId}
    group by p.id
    order by p.updated_at desc
  `;
  return rows.map((row: any) => mapPlaylist(row, row.movies || []));
}

async function handleSession(request: any, response: any) {
  const config = getAdminConfig();
  if (!config) return sendJson(response, 503, { error: "Director admin credentials are not configured." });

  if (request.method === "GET") {
    return sendJson(response, 200, { authenticated: Boolean(readAdminSession(request)) });
  }

  if (request.method === "POST") {
    const body = await readBody(request);
    const username = String(body.username || "").trim();
    const password = String(body.password || "");

    if (!safeEqual(username, config.username) || !safeEqual(password, config.password)) {
      clearAdminCookie(response);
      return sendJson(response, 401, { error: "Invalid username or password." });
    }

    setAdminCookie(response, createAdminToken(config.username, config.password));
    return sendJson(response, 200, { authenticated: true });
  }

  if (request.method === "DELETE" || request.method === "POST") {
    clearAdminCookie(response);
    return sendJson(response, 200, { ok: true });
  }

  return sendJson(response, 405, { error: "Method not allowed." });
}

async function handleLogout(response: any) {
  clearAdminCookie(response);
  return sendJson(response, 200, { ok: true });
}

async function handleProfile(request: any, response: any, sql: any) {
  await ensureDirectorProfile(sql);

  if (request.method === "GET") {
    const rows = await sql`select * from director_profile where id = 'the-director' limit 1`;
    return sendJson(response, 200, rows[0]);
  }

  if (request.method === "PATCH") {
    const body = await readBody(request);
    const [profile] = await sql`
      update director_profile
      set
        display_name = ${String(body.displayName || body.display_name || "The Director").trim().slice(0, 80)},
        bio = ${String(body.bio || "").trim().slice(0, 300)},
        tagline = ${String(body.tagline || "").trim().slice(0, 160)},
        quote = ${String(body.quote || "").trim().slice(0, 200)},
        updated_at = now()
      where id = 'the-director'
      returning *
    `;

    await sql`
      update user_profiles
      set display_name = ${profile.display_name}, bio = ${profile.bio}, updated_at = now()
      where user_id = ${directorUserId}
    `;

    return sendJson(response, 200, profile);
  }

  return sendJson(response, 405, { error: "Method not allowed." });
}

async function handleAnalytics(response: any, sql: any) {
  await ensureDirectorSeed(sql);
  const [counts] = await sql`
    select
      count(distinct p.id)::int as total_playlists,
      count(distinct p.id) filter (where p.visibility = 'public')::int as total_public_playlists,
      count(pm.id)::int as total_movies
    from playlists p
    left join playlist_movies pm on pm.playlist_id = p.id
    where p.owner_user_id = ${directorUserId}
  `;

  return sendJson(response, 200, {
    totalPlaylists: counts?.total_playlists || 0,
    totalPublicPlaylists: counts?.total_public_playlists || 0,
    totalMovies: counts?.total_movies || 0,
    publicPlaylistViews: null,
    shares: null,
    qrOpens: null,
    nowPlayingUses: null,
  });
}

async function handleSeasonalChallenges(request: any, response: any, sql: any, eventId?: string) {
  await ensureSeasonalChallengeTables(sql);

  if (request.method === "GET") {
    const rows = await sql`
      select *
      from seasonal_challenge_events
      order by start_date desc, name
    `;
    return sendJson(response, 200, rows);
  }

  if (request.method === "POST" && !eventId) {
    const input = cleanSeasonalChallengeInput(await readBody(request));
    if (!input.name || !input.startDate || !input.endDate || input.requirements.length === 0) {
      return sendJson(response, 400, { error: "Name, dates, and at least one requirement are required." });
    }
    const [event] = await sql`
      insert into seasonal_challenge_events (
        slug,
        name,
        description,
        start_date,
        end_date,
        badge,
        banner,
        season_key,
        is_active,
        difficulty,
        requirements,
        points,
        status,
        updated_at
      )
      values (
        ${input.slug},
        ${input.name},
        ${input.description},
        ${input.startDate},
        ${input.endDate},
        ${input.badge},
        ${input.banner},
        ${input.seasonKey},
        ${input.isActive},
        ${input.difficulty},
        ${JSON.stringify(input.requirements)}::jsonb,
        ${input.points},
        ${input.status},
        now()
      )
      returning *
    `;
    return sendJson(response, 201, event);
  }

  if (request.method === "PATCH" && eventId) {
    const input = cleanSeasonalChallengeInput(await readBody(request));
    const [event] = await sql`
      update seasonal_challenge_events
      set
        slug = ${input.slug},
        name = ${input.name},
        description = ${input.description},
        start_date = ${input.startDate},
        end_date = ${input.endDate},
        badge = ${input.badge},
        banner = ${input.banner},
        season_key = ${input.seasonKey},
        is_active = ${input.isActive},
        difficulty = ${input.difficulty},
        requirements = ${JSON.stringify(input.requirements)}::jsonb,
        points = ${input.points},
        status = ${input.status},
        updated_at = now()
      where id = ${eventId}
      returning *
    `;
    if (!event) return sendJson(response, 404, { error: "Seasonal challenge not found." });
    return sendJson(response, 200, event);
  }

  if (request.method === "DELETE" && eventId) {
    const rows = await sql`update seasonal_challenge_events set status = 'archived', updated_at = now() where id = ${eventId} returning id`;
    if (!rows[0]) return sendJson(response, 404, { error: "Seasonal challenge not found." });
    return sendJson(response, 200, { ok: true });
  }

  return sendJson(response, 405, { error: "Method not allowed." });
}

async function handlePlaylistCollection(request: any, response: any, sql: any) {
  if (request.method === "GET") {
    return sendJson(response, 200, await getDirectorPlaylists(sql));
  }

  if (request.method === "POST") {
    await ensureDirectorSeed(sql);
    const body = await readBody(request);
    const name = String(body.name || "Director Playlist").trim().slice(0, 120);
    const publicSlug = await createUniquePublicSlug(sql, name);
    const [playlist] = await sql`
      insert into playlists (public_slug, name, description, visibility, owner_user_id)
      values (${publicSlug}, ${name}, ${String(body.description || "").trim().slice(0, 600)}, ${body.visibility === "private" || body.visibility === "shared" ? body.visibility : "public"}, ${directorUserId})
      returning *
    `;
    return sendJson(response, 201, mapPlaylist({ ...playlist, creator_handle: directorHandle, creator_display_name: "The Director", is_owner: true }));
  }

  return sendJson(response, 405, { error: "Method not allowed." });
}

async function getDirectorPlaylist(sql: any, playlistId: string) {
  const rows = await sql`
    select
      p.*,
      ${directorHandle} as creator_handle,
      'The Director' as creator_display_name,
      true as is_owner,
      coalesce(
        json_agg(pm order by coalesce(pm.sort_order, 2147483647), pm.added_at desc) filter (where pm.id is not null),
        '[]'
      ) as movies
    from playlists p
    left join playlist_movies pm on pm.playlist_id = p.id
    where p.id = ${playlistId}
      and p.owner_user_id = ${directorUserId}
    group by p.id
    limit 1
  `;
  return rows[0] ? mapPlaylist(rows[0], rows[0].movies || []) : null;
}

async function handlePlaylistDetail(request: any, response: any, sql: any, playlistId: string) {
  if (request.method === "GET") {
    const playlist = await getDirectorPlaylist(sql, playlistId);
    if (!playlist) return sendJson(response, 404, { error: "Director playlist not found." });
    return sendJson(response, 200, playlist);
  }

  if (request.method === "PATCH") {
    const body = await readBody(request);
    const existing = await getDirectorPlaylist(sql, playlistId);
    if (!existing) return sendJson(response, 404, { error: "Director playlist not found." });
    const name = String(body.name || existing.name).trim().slice(0, 120);
    const visibility = ["private", "shared", "public"].includes(body.visibility) ? body.visibility : existing.visibility;
    const publicSlug = body.regenerateSlug ? await createUniquePublicSlug(sql, name, playlistId) : existing.publicSlug;
    const [playlist] = await sql`
      update playlists
      set
        name = ${name},
        description = ${String(body.description ?? existing.description ?? "").trim().slice(0, 600)},
        visibility = ${visibility},
        public_slug = ${publicSlug},
        updated_at = now()
      where id = ${playlistId}
        and owner_user_id = ${directorUserId}
      returning *
    `;
    return sendJson(response, 200, mapPlaylist({ ...playlist, creator_handle: directorHandle, creator_display_name: "The Director", is_owner: true }));
  }

  if (request.method === "DELETE") {
    const rows = await sql`delete from playlists where id = ${playlistId} and owner_user_id = ${directorUserId} returning id`;
    if (!rows[0]) return sendJson(response, 404, { error: "Director playlist not found." });
    return sendJson(response, 200, { ok: true });
  }

  return sendJson(response, 405, { error: "Method not allowed." });
}

async function handlePlaylistMovies(request: any, response: any, sql: any, playlistId: string, movieId?: string) {
  const playlist = await getDirectorPlaylist(sql, playlistId);
  if (!playlist) return sendJson(response, 404, { error: "Director playlist not found." });

  if (!movieId && request.method === "POST") {
    const body = await readBody(request);
    const mediaType = body.mediaType === "tv" ? "tv" : "movie";
    const tmdbId = Number(body.tmdbId);
    const title = String(body.title || "").trim();
    if (!Number.isFinite(tmdbId) || tmdbId <= 0 || !title) {
      return sendJson(response, 400, { error: "Choose a valid movie or TV show." });
    }

    const [nextOrder] = await sql`
      select coalesce(max(sort_order), -1) + 1 as sort_order
      from playlist_movies
      where playlist_id = ${playlistId}
    `;

    const [movie] = await sql`
      insert into playlist_movies (playlist_id, media_type, tmdb_id, title, year, poster_url, overview, runtime_minutes, season_count, episode_count, sort_order, watched)
      values (${playlistId}, ${mediaType}, ${tmdbId}, ${title}, ${body.releaseYear || body.firstAirYear || null}, ${body.posterUrl || null}, ${body.overview || ""}, ${body.runtimeMinutes || null}, ${body.seasonCount || null}, ${body.episodeCount || null}, ${nextOrder?.sort_order || 0}, false)
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

  if (movieId === "reorder" && request.method === "PATCH") {
    const body = await readBody(request);
    const movieIds = Array.isArray(body.movieIds) ? body.movieIds.map(String) : [];
    for (const [index, id] of movieIds.entries()) {
      await sql`
        update playlist_movies
        set sort_order = ${index}
        where id = ${id}
          and playlist_id = ${playlistId}
      `;
    }
    return sendJson(response, 200, { ok: true });
  }

  if (movieId && request.method === "DELETE") {
    const rows = await sql`
      delete from playlist_movies
      where id = ${movieId}
        and playlist_id = ${playlistId}
      returning id
    `;
    if (!rows[0]) return sendJson(response, 404, { error: "Movie not found in this playlist." });
    return sendJson(response, 200, { ok: true });
  }

  return sendJson(response, 405, { error: "Method not allowed." });
}

export default async function handler(request: any, response: any) {
  try {
    const [resource, id, child, childId] = getSegments(request);

    if (resource === "session") return handleSession(request, response);
    if (resource === "logout") return handleLogout(response);

    const session = readAdminSession(request);
    if (!session) return sendJson(response, 401, { error: "Director admin sign-in required." });

    const sql = db();
    await ensureUserProfilesTable(sql);
    await ensurePlaylistMediaColumns(sql);
    await ensureDirectorProfile(sql);

    if (!resource || resource === "dashboard") return handleAnalytics(response, sql);
    if (resource === "profile") return handleProfile(request, response, sql);
    if (resource === "analytics") return handleAnalytics(response, sql);
    if (resource === "seasonal-challenges") return handleSeasonalChallenges(request, response, sql, id);
    if (resource === "playlists" && !id) return handlePlaylistCollection(request, response, sql);
    if (resource === "playlists" && id && child === "movies") return handlePlaylistMovies(request, response, sql, id, childId);
    if (resource === "playlists" && id) return handlePlaylistDetail(request, response, sql, id);

    return sendJson(response, 404, { error: "Director admin route not found." });
  } catch (error) {
    console.error("director_admin_failed", {
      method: request.method,
      message: error instanceof Error ? error.message : "Unknown Director admin error",
    });
    return sendJson(response, 500, { error: "Director admin request failed." });
  }
}
