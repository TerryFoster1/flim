import { neon } from "@neondatabase/serverless";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const maxRequestBodyBytes = 128 * 1024;

export class RequestBodyTooLargeError extends Error {
  statusCode = 413;

  constructor() {
    super("Request body too large.");
  }
}

export class RateLimitError extends Error {
  statusCode = 429;

  constructor() {
    super("Too many requests. Please slow down.");
  }
}

export function db() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured.");
  }

  return neon(databaseUrl);
}

export async function ensurePgCrypto(sql: any) {
  try {
    await sql`create extension if not exists pgcrypto`;
  } catch (error) {
    const message = error instanceof Error ? error.message : String((error as any)?.message || "");
    if (message.includes("pg_type_typname_nsp_index") || message.includes("already exists")) return;
    throw error;
  }
}

export function sendJson(response: any, status: number, body: unknown) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(body));
}

export function errorStatus(error: unknown, fallback = 500) {
  const status = Number((error as any)?.statusCode || (error as any)?.status);
  return Number.isFinite(status) && status >= 400 && status < 600 ? status : fallback;
}

export function readBody(request: any): Promise<any> {
  if (request.body) {
    if (typeof request.body !== "string") return Promise.resolve(request.body);
    if (Buffer.byteLength(request.body, "utf8") > maxRequestBodyBytes) {
      return Promise.reject(new RequestBodyTooLargeError());
    }

    try {
      return Promise.resolve(JSON.parse(request.body || "{}"));
    } catch {
      return Promise.resolve({});
    }
  }

  return new Promise((resolve, reject) => {
    let raw = "";
    let bytes = 0;
    let rejected = false;
    request.on("data", (chunk: Buffer) => {
      if (rejected) return;
      bytes += chunk.length;
      if (bytes > maxRequestBodyBytes) {
        rejected = true;
        reject(new RequestBodyTooLargeError());
        request.destroy();
        return;
      }
      raw += chunk.toString();
    });
    request.on("end", () => {
      if (rejected) return;
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        resolve({});
      }
    });
    request.on("error", reject);
  });
}

export function createPublicSlugBase(name: string) {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || "playlist";
}

export function createPublicSlug(name: string) {
  const base = createPublicSlugBase(name);
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base}-${suffix}`;
}

export function mapPlaylist(row: any, movies: any[] = []) {
  const followerCount = Number(row.follower_count || 0);
  const likeCount = Number(row.like_count || 0);

  return {
    id: row.id,
    publicSlug: row.public_slug,
    sharedSlug: row.expose_shared_slug ? row.shared_slug : undefined,
    name: row.name,
    description: row.description || "",
    visibility: row.visibility,
    creatorHandle: row.creator_handle || undefined,
    creatorDisplayName: row.creator_display_name || undefined,
    ownerUserId: row.owner_user_id || undefined,
    isOwner: Boolean(row.is_owner),
    canAddTitles: Boolean(row.can_add_titles || row.is_owner),
    canRemoveTitles: Boolean(row.can_remove_titles || row.is_owner),
    canReorderTitles: Boolean(row.can_reorder_titles || row.is_owner),
    canEditPlaylist: Boolean(row.can_edit_playlist || row.is_owner),
    accessMode: row.access_mode || (row.is_owner ? "owner" : row.visibility === "public" ? "public" : "private"),
    isFollowing: Boolean(row.is_following),
    followerCount: Number.isFinite(followerCount) ? followerCount : 0,
    isLiked: Boolean(row.is_liked),
    likeCount: Number.isFinite(likeCount) ? likeCount : 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    movies: movies.map(mapPlaylistMovie),
  };
}

export function mapPlaylistMovie(row: any) {
  const genres = normalizeGenreList(row.genres || row.media_genres);
  return {
    id: row.id,
    playlistId: row.playlist_id,
    mediaItemId: row.media_item_id || undefined,
    mediaType: row.media_type || "movie",
    tmdbId: row.tmdb_id,
    title: row.title,
    releaseYear: row.year || undefined,
    posterUrl: row.poster_url || undefined,
    overview: row.overview || "",
    genres: genres.length > 0 ? genres : genresFromIds(row.genre_ids || row.genreIds),
    runtimeMinutes: row.runtime_minutes || undefined,
    seasonCount: row.season_count || undefined,
    episodeCount: row.episode_count || undefined,
    sortOrder: typeof row.sort_order === "number" ? row.sort_order : undefined,
    addedAt: row.added_at,
    watchStatus: row.watched ? "watched" : "not_watched",
  };
}

const tmdbGenreNames: Record<number, string> = {
  12: "Adventure",
  14: "Fantasy",
  16: "Animation",
  18: "Drama",
  27: "Horror",
  28: "Action",
  35: "Comedy",
  36: "History",
  37: "Western",
  53: "Thriller",
  80: "Crime",
  99: "Documentary",
  878: "Science Fiction",
  9648: "Mystery",
  10402: "Music",
  10749: "Romance",
  10751: "Family",
  10752: "War",
  10759: "Action & Adventure",
  10762: "Kids",
  10763: "News",
  10764: "Reality",
  10765: "Sci-Fi & Fantasy",
  10766: "Soap",
  10767: "Talk",
  10768: "War & Politics",
  10770: "TV Movie",
};

function genresFromIds(value: any): string[] {
  const ids = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];
  return ids
    .map((id) => tmdbGenreNames[Number(id)])
    .filter(Boolean);
}

function normalizeGenreList(value: any): string[] {
  if (!value) return [];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return normalizeGenreList(parsed);
    } catch {
      return value
        .split(",")
        .map((genre) => genre.trim())
        .filter(Boolean);
    }
  }
  if (!Array.isArray(value)) return [];
  return value
    .map((genre) => {
      if (typeof genre === "string") return genre;
      if (genre && typeof genre === "object") return String(genre.name || genre.label || genre.title || "");
      return "";
    })
    .map((genre) => genre.trim())
    .filter(Boolean);
}

export const reservedProfileHandles = new Set([
  "admin",
  "support",
  "help",
  "api",
  "settings",
  "login",
  "logout",
  "signin",
  "signup",
  "profile",
  "profiles",
  "username",
  "flix",
  "plex",
  "movies",
  "movie",
  "tv",
  "actor",
  "actors",
  "collection",
  "collections",
  "public",
  "playlists",
  "playlist",
  "roulette",
  "discover",
  "discovery",
  "curators",
  "director",
  "director-admin",
  "followed-titles",
  "upcoming",
  "progress",
  "hall-of-fame",
  "challenges",
  "settings",
  "notifications",
  "providers",
  "provider-icons",
  "brand",
  "manifest",
  "manifest.json",
  "favicon",
  "favicon.png",
  "terms",
  "privacy",
  "about",
  "contact",
  "flim",
  "www",
]);

export const demoUserId = "demo-user";
const sessionCookieName = "flim_session";

export async function ensureAuthTables(sql: any) {
  await ensurePgCrypto(sql);
  await sql`
    create table if not exists users (
      id uuid primary key default gen_random_uuid(),
      email text not null unique,
      password_hash text not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;
  await sql`alter table users add column if not exists updated_at timestamptz not null default now()`;
  await sql`create unique index if not exists users_email_unique on users (email)`;
  await sql`
    create table if not exists user_sessions (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references users(id) on delete cascade,
      token_hash text not null unique,
      created_at timestamptz not null default now(),
      expires_at timestamptz not null
    )
  `;
  await sql`create index if not exists user_sessions_user_id_idx on user_sessions (user_id)`;
  await sql`create index if not exists user_sessions_expires_at_idx on user_sessions (expires_at)`;
}

export async function ensureRateLimitTable(sql: any) {
  await ensurePgCrypto(sql);
  await sql`
    create table if not exists api_rate_limits (
      bucket text not null,
      identifier_hash text not null,
      window_start timestamptz not null,
      request_count integer not null default 0,
      updated_at timestamptz not null default now(),
      primary key (bucket, identifier_hash)
    )
  `;
  await sql`create index if not exists api_rate_limits_updated_at_idx on api_rate_limits (updated_at)`;
}

function requestIp(request: any) {
  const forwarded = String(request.headers?.["x-forwarded-for"] || "");
  const firstForwarded = forwarded.split(",")[0]?.trim();
  return firstForwarded || String(request.headers?.["x-real-ip"] || request.socket?.remoteAddress || "unknown");
}

export async function checkRateLimit(
  sql: any,
  request: any,
  bucket: string,
  identifier: string | undefined,
  maxRequests: number,
  windowSeconds: number,
) {
  await ensureRateLimitTable(sql);
  const rawIdentifier = identifier || requestIp(request);
  const identifierHash = createHash("sha256")
    .update(`${bucket}:${rawIdentifier}`)
    .digest("hex");
  const rows = await sql`
    insert into api_rate_limits (bucket, identifier_hash, window_start, request_count, updated_at)
    values (${bucket}, ${identifierHash}, now(), 1, now())
    on conflict (bucket, identifier_hash)
    do update set
      window_start = case
        when api_rate_limits.window_start < now() - (${windowSeconds} * interval '1 second') then now()
        else api_rate_limits.window_start
      end,
      request_count = case
        when api_rate_limits.window_start < now() - (${windowSeconds} * interval '1 second') then 1
        else api_rate_limits.request_count + 1
      end,
      updated_at = now()
    returning request_count
  `;
  if (Number(rows[0]?.request_count || 0) > maxRequests) {
    throw new RateLimitError();
  }
}

export function normalizeEmail(email: string) {
  return email.toLowerCase().trim();
}

export function hashPassword(password: string, salt = randomBytes(16).toString("hex")) {
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string) {
  const [salt, hash] = storedHash.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const original = Buffer.from(hash, "hex");
  return original.length === candidate.length && timingSafeEqual(original, candidate);
}

export function createSessionToken() {
  return randomBytes(32).toString("hex");
}

export function createSharedPlaylistToken() {
  return randomBytes(18).toString("base64url");
}

export function hashSessionToken(token: string) {
  return scryptSync(token, "flim-session-token", 64).toString("hex");
}

export function getCookie(request: any, name: string) {
  const header = String(request.headers?.cookie || "");
  const cookies = header.split(";").map((part) => part.trim());
  const match = cookies.find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : "";
}

export function setSessionCookie(response: any, token: string) {
  response.setHeader(
    "Set-Cookie",
    `${sessionCookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`,
  );
}

export function clearSessionCookie(response: any) {
  response.setHeader("Set-Cookie", `${sessionCookieName}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
}

export async function getCurrentUser(sql: any, request: any) {
  await ensureAuthTables(sql);
  const token = getCookie(request, sessionCookieName);
  if (!token) return null;
  const rows = await sql`
    select u.id, u.email, u.created_at
    from user_sessions s
    inner join users u on u.id = s.user_id
    where s.token_hash = ${hashSessionToken(token)}
      and s.expires_at > now()
    limit 1
  `;
  return rows[0] || null;
}

export function mapCurrentUser(user: any, profile?: any) {
  return {
    id: user.id,
    email: user.email,
    profile: profile ? mapUserProfile(profile) : null,
  };
}

export async function ensureUserProfilesTable(sql: any) {
  await ensureAuthTables(sql);
  await ensurePgCrypto(sql);
  await sql`
    create table if not exists user_profiles (
      id uuid primary key default gen_random_uuid(),
      user_id text not null unique,
      display_name text not null default '',
      handle text not null unique,
      bio text,
      country_code text not null default '',
      province_state text,
      region text,
      postal_code text,
      streaming_region text not null default '',
      preferred_providers jsonb not null default '[]'::jsonb,
      show_country_publicly boolean not null default false,
      avatar_key text not null default 'director',
      avatar_customization jsonb not null default '{}'::jsonb,
      profile_image_url text,
      hero_image_url text,
      favorite_movie text,
      favorite_genre text,
      favorite_director text,
      profile_status text,
      featured_playlist_ids jsonb not null default '[]'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;
  await sql`alter table user_profiles add column if not exists province_state text`;
  await sql`alter table user_profiles add column if not exists avatar_key text not null default 'director'`;
  await sql`alter table user_profiles add column if not exists avatar_customization jsonb not null default '{}'::jsonb`;
  await sql`alter table user_profiles add column if not exists profile_image_url text`;
  await sql`alter table user_profiles add column if not exists hero_image_url text`;
  await sql`alter table user_profiles add column if not exists favorite_movie text`;
  await sql`alter table user_profiles add column if not exists favorite_genre text`;
  await sql`alter table user_profiles add column if not exists favorite_director text`;
  await sql`alter table user_profiles add column if not exists profile_status text`;
  await sql`alter table user_profiles add column if not exists featured_playlist_ids jsonb not null default '[]'::jsonb`;
  await sql`create unique index if not exists user_profiles_handle_unique on user_profiles (handle)`;
  await sql`create unique index if not exists user_profiles_user_id_unique on user_profiles (user_id)`;
  await sql`create index if not exists user_profiles_updated_at_idx on user_profiles (updated_at desc)`;
}

export async function ensureUserFollowsTable(sql: any) {
  await ensureUserProfilesTable(sql);
  await ensurePgCrypto(sql);
  await sql`
    create table if not exists user_follows (
      id uuid primary key default gen_random_uuid(),
      follower_user_id uuid not null references users(id) on delete cascade,
      followed_user_id uuid not null references users(id) on delete cascade,
      created_at timestamptz not null default now(),
      check (follower_user_id <> followed_user_id)
    )
  `;
  await sql`create unique index if not exists user_follows_pair_unique on user_follows (follower_user_id, followed_user_id)`;
  await sql`create index if not exists user_follows_follower_idx on user_follows (follower_user_id)`;
  await sql`create index if not exists user_follows_followed_idx on user_follows (followed_user_id)`;
}

export async function ensurePlaylistMediaColumns(sql: any) {
  await sql`alter table playlist_movies add column if not exists media_type text not null default 'movie'`;
  await sql`alter table playlist_movies add column if not exists runtime_minutes integer`;
  await sql`alter table playlist_movies add column if not exists season_count integer`;
  await sql`alter table playlist_movies add column if not exists episode_count integer`;
  await sql`alter table playlist_movies add column if not exists sort_order integer`;
  await sql`
    do $$
    declare
      legacy_constraint record;
      legacy_index record;
    begin
      for legacy_constraint in
        select distinct c.conname
        from pg_constraint c
        left join pg_class i on i.oid = c.conindid
        where c.conrelid = 'playlist_movies'::regclass
          and (
            c.conname = 'playlist_movies_playlist_id_tmdb_id_key'
            or i.relname = 'playlist_movies_playlist_id_tmdb_id_key'
          )
      loop
        execute format('alter table playlist_movies drop constraint %I', legacy_constraint.conname);
      end loop;

      for legacy_index in
        select i.oid::regclass::text as index_name
        from pg_class i
        where i.relname = 'playlist_movies_playlist_id_tmdb_id_key'
          and i.relkind = 'i'
          and not exists (
            select 1
            from pg_constraint c
            where c.conindid = i.oid
          )
      loop
        execute format('drop index if exists %s', legacy_index.index_name);
      end loop;
    end $$;
  `;
  await sql`create unique index if not exists playlist_movies_playlist_media_tmdb_unique on playlist_movies (playlist_id, media_type, tmdb_id)`;
  await sql`create index if not exists playlist_movies_media_type_idx on playlist_movies (media_type)`;
  await sql`create index if not exists playlist_movies_watched_idx on playlist_movies (watched)`;
  await sql`create index if not exists playlist_movies_sort_order_idx on playlist_movies (playlist_id, sort_order)`;
}

export async function ensurePlaylistSharingColumns(sql: any) {
  await sql`alter table playlists add column if not exists shared_slug text`;
  await sql`
    create unique index if not exists playlists_shared_slug_unique
    on playlists (shared_slug)
    where shared_slug is not null
  `;
}

export async function ensureSharedPlaylistSlug(sql: any, playlistId: string) {
  await ensurePlaylistSharingColumns(sql);
  const existing = await sql`select shared_slug from playlists where id = ${playlistId} limit 1`;
  if (existing[0]?.shared_slug) {
    await sql`update playlists set visibility = 'shared', updated_at = now() where id = ${playlistId}`;
    return existing[0].shared_slug;
  }

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const token = createSharedPlaylistToken();
    const updated = await sql`
      update playlists
      set shared_slug = ${token}, visibility = 'shared', updated_at = now()
      where id = ${playlistId}
        and shared_slug is null
      returning shared_slug
    `.catch((error: any) => {
      if (String(error?.message || "").includes("duplicate key")) return [];
      throw error;
    });

    if (updated[0]?.shared_slug) return updated[0].shared_slug;

    const latest = await sql`select shared_slug from playlists where id = ${playlistId} limit 1`;
    if (latest[0]?.shared_slug) return latest[0].shared_slug;
  }

  throw new Error("Unable to create shared playlist link.");
}

export async function ensurePlaylistFollowsTable(sql: any) {
  await ensureAuthTables(sql);
  await ensurePgCrypto(sql);
  await sql`
    create table if not exists playlist_follows (
      id uuid primary key default gen_random_uuid(),
      playlist_id uuid not null references playlists(id) on delete cascade,
      follower_user_id uuid references users(id) on delete cascade,
      follower_session_id text,
      created_at timestamptz not null default now(),
      check (follower_user_id is not null or nullif(follower_session_id, '') is not null)
    )
  `;
  await sql`
    create unique index if not exists playlist_follows_user_unique
    on playlist_follows (playlist_id, follower_user_id)
    where follower_user_id is not null
  `;
  await sql`
    create unique index if not exists playlist_follows_session_unique
    on playlist_follows (playlist_id, follower_session_id)
    where follower_session_id is not null
  `;
  await sql`create index if not exists playlist_follows_playlist_id_idx on playlist_follows (playlist_id)`;
  await sql`create index if not exists playlist_follows_user_id_idx on playlist_follows (follower_user_id)`;
}

export async function ensurePlaylistLikesTable(sql: any) {
  await ensureAuthTables(sql);
  await ensurePgCrypto(sql);
  try {
    await sql`
      create table if not exists playlist_likes (
        id uuid primary key default gen_random_uuid(),
        playlist_id uuid not null references playlists(id) on delete cascade,
        user_id uuid not null references users(id) on delete cascade,
        created_at timestamptz not null default now()
      )
    `;
  } catch (error) {
    const message = error instanceof Error ? error.message : String((error as any)?.message || "");
    if (!message.includes("pg_type_typname_nsp_index") && !message.includes("already exists")) {
      throw error;
    }
  }
  await sql`create unique index if not exists playlist_likes_playlist_user_unique on playlist_likes (playlist_id, user_id)`;
  await sql`create index if not exists playlist_likes_playlist_id_idx on playlist_likes (playlist_id)`;
  await sql`create index if not exists playlist_likes_user_id_idx on playlist_likes (user_id)`;
  await sql`create index if not exists playlist_likes_created_at_idx on playlist_likes (created_at desc)`;
}

export async function ensureTitleRatingsTable(sql: any) {
  await ensureAuthTables(sql);
  await ensurePgCrypto(sql);
  await sql`
    create table if not exists title_ratings (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references users(id) on delete cascade,
      media_type text not null check (media_type in ('movie', 'tv')),
      tmdb_id integer not null,
      rating integer not null check (rating between 1 and 3),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;
  await sql`
    create unique index if not exists title_ratings_user_title_unique
    on title_ratings (user_id, media_type, tmdb_id)
  `;
  await sql`create index if not exists title_ratings_title_idx on title_ratings (media_type, tmdb_id)`;
}

export async function ensureTriviaTables(sql: any) {
  await ensureAuthTables(sql);
  await ensurePgCrypto(sql);
  await sql`
    create table if not exists title_trivia (
      id uuid primary key default gen_random_uuid(),
      tmdb_id integer not null,
      media_type text not null check (media_type in ('movie', 'tv')),
      source_hash text not null,
      question text not null,
      answer text not null,
      options jsonb not null default '[]'::jsonb,
      explanation text,
      difficulty text not null default 'easy',
      spoiler_level text not null default 'none',
      source_urls jsonb not null default '[]'::jsonb,
      source_labels jsonb not null default '[]'::jsonb,
      confidence numeric not null default 0.8,
      status text not null default 'auto_generated',
      report_count integer not null default 0,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;
  await sql`alter table title_trivia add column if not exists source_urls jsonb not null default '[]'::jsonb`;
  await sql`alter table title_trivia add column if not exists source_labels jsonb not null default '[]'::jsonb`;
  await sql`alter table title_trivia add column if not exists confidence numeric not null default 0.8`;
  await sql`alter table title_trivia add column if not exists report_count integer not null default 0`;
  await sql`alter table title_trivia add column if not exists status text not null default 'auto_generated'`;
  await sql`create index if not exists title_trivia_media_status_idx on title_trivia (media_type, tmdb_id, status)`;
  await sql`create unique index if not exists title_trivia_media_source_question_unique on title_trivia (media_type, tmdb_id, source_hash, question)`;

  await sql`
    create table if not exists trivia_sets (
      id uuid primary key default gen_random_uuid(),
      tmdb_id integer not null,
      media_type text not null check (media_type in ('movie', 'tv')),
      title text not null,
      year integer,
      spoiler_mode boolean not null default false,
      question_count integer not null default 25,
      prompt_version text not null,
      generated_by text not null default 'openai',
      model text,
      status text not null default 'ready' check (status in ('ready', 'failed', 'archived')),
      error text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;
  await sql`alter table trivia_sets add column if not exists year integer`;
  await sql`alter table trivia_sets add column if not exists spoiler_mode boolean not null default false`;
  await sql`alter table trivia_sets add column if not exists question_count integer not null default 25`;
  await sql`alter table trivia_sets add column if not exists prompt_version text not null default 'movie-fan-v8-openai'`;
  await sql`alter table trivia_sets add column if not exists generated_by text not null default 'openai'`;
  await sql`alter table trivia_sets add column if not exists model text`;
  await sql`alter table trivia_sets add column if not exists status text not null default 'ready'`;
  await sql`alter table trivia_sets add column if not exists error text`;
  await sql`
    create unique index if not exists trivia_sets_title_settings_unique
    on trivia_sets (tmdb_id, media_type, spoiler_mode, question_count, prompt_version)
  `;
  await sql`create index if not exists trivia_sets_title_lookup_idx on trivia_sets (media_type, tmdb_id, status, updated_at desc)`;

  await sql`
    create table if not exists trivia_questions (
      id uuid primary key default gen_random_uuid(),
      trivia_set_id uuid not null references trivia_sets(id) on delete cascade,
      tmdb_id integer not null,
      media_type text not null check (media_type in ('movie', 'tv')),
      question_order integer not null,
      category text not null,
      difficulty text not null check (difficulty in ('easy', 'medium', 'hard')),
      question text not null,
      choices jsonb not null default '[]'::jsonb,
      correct_answer text not null,
      explanation text not null,
      spoiler boolean not null default false,
      source_hash text not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;
  await sql`alter table trivia_questions add column if not exists question_order integer not null default 0`;
  await sql`alter table trivia_questions add column if not exists category text not null default 'story'`;
  await sql`alter table trivia_questions add column if not exists difficulty text not null default 'medium'`;
  await sql`alter table trivia_questions add column if not exists choices jsonb not null default '[]'::jsonb`;
  await sql`alter table trivia_questions add column if not exists correct_answer text not null default ''`;
  await sql`alter table trivia_questions add column if not exists explanation text not null default ''`;
  await sql`alter table trivia_questions add column if not exists spoiler boolean not null default false`;
  await sql`alter table trivia_questions add column if not exists source_hash text not null default ''`;
  await sql`
    create unique index if not exists trivia_questions_set_order_unique
    on trivia_questions (trivia_set_id, question_order)
  `;
  await sql`
    create unique index if not exists trivia_questions_set_question_unique
    on trivia_questions (trivia_set_id, question)
  `;
  await sql`create index if not exists trivia_questions_title_idx on trivia_questions (media_type, tmdb_id, difficulty, category)`;

  await sql`
    create table if not exists trivia_generation_jobs (
      id uuid primary key default gen_random_uuid(),
      tmdb_id integer not null,
      media_type text not null check (media_type in ('movie', 'tv')),
      language text not null default 'en',
      version text not null,
      status text not null default 'queued',
      interest_source text not null default 'unknown',
      requested_count integer not null default 40,
      question_count integer not null default 0,
      error text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;
  await sql`alter table trivia_generation_jobs add column if not exists language text not null default 'en'`;
  await sql`alter table trivia_generation_jobs add column if not exists version text not null default 'movie-fan-v4'`;
  await sql`alter table trivia_generation_jobs add column if not exists interest_source text not null default 'unknown'`;
  await sql`alter table trivia_generation_jobs add column if not exists requested_count integer not null default 40`;
  await sql`alter table trivia_generation_jobs add column if not exists question_count integer not null default 0`;
  await sql`alter table trivia_generation_jobs add column if not exists error text`;
  await sql`
    create unique index if not exists trivia_generation_jobs_title_version_unique
    on trivia_generation_jobs (media_type, tmdb_id, language, version)
  `;
  await sql`create index if not exists trivia_generation_jobs_status_idx on trivia_generation_jobs (status, updated_at desc)`;

  await sql`
    create table if not exists title_trivia_reports (
      id uuid primary key default gen_random_uuid(),
      trivia_id uuid not null references title_trivia(id) on delete cascade,
      user_id uuid references users(id) on delete set null,
      reason text not null,
      created_at timestamptz not null default now()
    )
  `;
  await sql`create index if not exists title_trivia_reports_trivia_idx on title_trivia_reports (trivia_id, created_at desc)`;
  await sql`create index if not exists title_trivia_reports_reason_idx on title_trivia_reports (reason)`;
  await sql`
    create unique index if not exists title_trivia_reports_user_unique
    on title_trivia_reports (trivia_id, user_id)
    where user_id is not null
  `;

  await sql`
    create table if not exists title_easter_eggs (
      id uuid primary key default gen_random_uuid(),
      tmdb_id integer not null,
      media_type text not null check (media_type in ('movie', 'tv')),
      source_hash text not null,
      title text not null,
      prompt text not null,
      hint text,
      answer text not null,
      explanation text not null default '',
      difficulty text not null default 'easy',
      spoiler_level text not null default 'minor',
      source_urls jsonb not null default '[]'::jsonb,
      source_labels jsonb not null default '[]'::jsonb,
      confidence numeric not null default 0.8,
      status text not null default 'auto_generated',
      report_count integer not null default 0,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;
  await sql`alter table title_easter_eggs add column if not exists explanation text not null default ''`;
  await sql`
    update title_easter_eggs
    set status = 'hidden', updated_at = now()
    where status in ('approved', 'auto_generated')
      and (
        prompt like 'Watch for one piece of technology%'
        or prompt like 'Look for a repeated object%'
      )
  `;
  await sql`
    update title_easter_eggs
    set
      title = 'Twin Pines / Lone Pine',
      answer = 'Twin Pines Mall became Lone Pine Mall.',
      explanation = 'Marty runs over one of Old Man Peabody''s twin pine trees in 1955, changing the mall name in 1985.',
      updated_at = now()
    where media_type = 'movie'
      and tmdb_id = 105
      and prompt = 'Watch for the mall sign near the beginning and again after Marty returns to 1985.'
  `;
  await sql`
    update title_easter_eggs
    set
      explanation = 'The flyer is a small detail that becomes the key to Doc and Marty''s final plan.',
      updated_at = now()
    where media_type = 'movie'
      and tmdb_id = 105
      and prompt = 'Notice how the town clock becomes important before the climax explains why.'
  `;
  await sql`create unique index if not exists title_easter_eggs_media_source_prompt_unique on title_easter_eggs (media_type, tmdb_id, source_hash, prompt)`;
  await sql`create index if not exists title_easter_eggs_media_status_idx on title_easter_eggs (media_type, tmdb_id, status)`;

  await sql`
    create table if not exists title_easter_egg_reports (
      id uuid primary key default gen_random_uuid(),
      easter_egg_id uuid not null references title_easter_eggs(id) on delete cascade,
      user_id uuid references users(id) on delete set null,
      reason text not null,
      created_at timestamptz not null default now()
    )
  `;
  await sql`create index if not exists title_easter_egg_reports_hunt_idx on title_easter_egg_reports (easter_egg_id, created_at desc)`;
  await sql`
    create unique index if not exists title_easter_egg_reports_user_unique
    on title_easter_egg_reports (easter_egg_id, user_id)
    where user_id is not null
  `;

  await sql`
    create table if not exists user_trivia_progress (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references users(id) on delete cascade,
      trivia_id uuid not null references title_trivia(id) on delete cascade,
      tmdb_id integer not null,
      media_type text not null check (media_type in ('movie', 'tv')),
      completed_at timestamptz not null default now(),
      created_at timestamptz not null default now()
    )
  `;
  await sql`create unique index if not exists user_trivia_progress_user_trivia_unique on user_trivia_progress (user_id, trivia_id)`;
  await sql`create index if not exists user_trivia_progress_user_title_idx on user_trivia_progress (user_id, media_type, tmdb_id)`;

  await sql`
    create table if not exists user_easter_egg_progress (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references users(id) on delete cascade,
      easter_egg_id uuid not null references title_easter_eggs(id) on delete cascade,
      tmdb_id integer not null,
      media_type text not null check (media_type in ('movie', 'tv')),
      status text not null default 'started' check (status in ('started', 'hint_used', 'answered', 'completed')),
      answer text,
      is_correct boolean,
      hint_used boolean not null default false,
      started_at timestamptz not null default now(),
      completed_at timestamptz,
      created_at timestamptz not null default now()
    )
  `;
  await sql`alter table user_easter_egg_progress add column if not exists status text not null default 'completed'`;
  await sql`alter table user_easter_egg_progress add column if not exists answer text`;
  await sql`alter table user_easter_egg_progress add column if not exists is_correct boolean`;
  await sql`alter table user_easter_egg_progress add column if not exists hint_used boolean not null default false`;
  await sql`alter table user_easter_egg_progress add column if not exists started_at timestamptz not null default now()`;
  await sql`alter table user_easter_egg_progress alter column completed_at drop not null`;
  await sql`update user_easter_egg_progress set status = 'completed', is_correct = true, started_at = coalesce(started_at, created_at), completed_at = coalesce(completed_at, created_at) where completed_at is not null and status = 'started'`;
  await sql`create unique index if not exists user_easter_egg_progress_user_hunt_unique on user_easter_egg_progress (user_id, easter_egg_id)`;
  await sql`create index if not exists user_easter_egg_progress_user_title_idx on user_easter_egg_progress (user_id, media_type, tmdb_id)`;

  await sql`
    create table if not exists friend_trivia_challenges (
      id uuid primary key default gen_random_uuid(),
      token text not null unique,
      challenger_user_id uuid references users(id) on delete set null,
      challenger_name text not null default 'A Flim player',
      media_type text not null check (media_type in ('movie', 'tv')),
      tmdb_id integer not null,
      title text not null,
      score integer not null default 0,
      correct_count integer not null default 0,
      total_count integer not null default 0,
      question_pack jsonb not null default '[]'::jsonb,
      answer_key jsonb not null default '{}'::jsonb,
      status text not null default 'active' check (status in ('active', 'archived')),
      completed_at timestamptz not null default now(),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;
  await sql`alter table friend_trivia_challenges add column if not exists answer_key jsonb not null default '{}'::jsonb`;
  await sql`alter table friend_trivia_challenges add column if not exists correct_count integer not null default 0`;
  await sql`alter table friend_trivia_challenges add column if not exists total_count integer not null default 0`;
  await sql`alter table friend_trivia_challenges add column if not exists status text not null default 'active'`;
  await sql`create unique index if not exists friend_trivia_challenges_token_unique on friend_trivia_challenges (token)`;
  await sql`create index if not exists friend_trivia_challenges_user_created_idx on friend_trivia_challenges (challenger_user_id, created_at desc)`;
  await sql`create index if not exists friend_trivia_challenges_title_idx on friend_trivia_challenges (media_type, tmdb_id, created_at desc)`;

  await sql`
    create table if not exists friend_trivia_attempts (
      id uuid primary key default gen_random_uuid(),
      challenge_id uuid not null references friend_trivia_challenges(id) on delete cascade,
      user_id uuid references users(id) on delete set null,
      player_name text not null default 'Friend',
      score integer not null default 0,
      correct_count integer not null default 0,
      total_count integer not null default 0,
      result text not null check (result in ('won', 'lost', 'tie')),
      answers jsonb not null default '{}'::jsonb,
      completed_at timestamptz not null default now(),
      created_at timestamptz not null default now()
    )
  `;
  await sql`create index if not exists friend_trivia_attempts_challenge_score_idx on friend_trivia_attempts (challenge_id, score desc, completed_at desc)`;
  await sql`create index if not exists friend_trivia_attempts_user_created_idx on friend_trivia_attempts (user_id, created_at desc)`;

  await sql`
    create table if not exists achievements (
      id text primary key,
      name text not null,
      description text not null,
      badge_icon text not null default 'star',
      category text not null default 'companion',
      rarity text not null default 'common',
      tier text,
      points integer not null default 0,
      goal_count integer not null default 1,
      unlock_requirements jsonb not null default '{}'::jsonb,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;
  await sql`alter table achievements add column if not exists rarity text not null default 'common'`;
  await sql`alter table achievements add column if not exists tier text`;
  await sql`alter table achievements add column if not exists points integer not null default 0`;
  await sql`alter table achievements add column if not exists unlock_requirements jsonb not null default '{}'::jsonb`;
  await sql`create index if not exists achievements_category_idx on achievements (category)`;
  await sql`create index if not exists achievements_rarity_idx on achievements (rarity)`;

  await sql`
    create table if not exists user_achievements (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references users(id) on delete cascade,
      achievement_id text not null references achievements(id) on delete cascade,
      progress_count integer not null default 0,
      progress numeric not null default 0,
      completion_percentage integer not null default 0,
      goal_count integer not null default 1,
      earned_at timestamptz,
      unlocked_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;
  await sql`alter table user_achievements add column if not exists progress numeric not null default 0`;
  await sql`alter table user_achievements add column if not exists completion_percentage integer not null default 0`;
  await sql`alter table user_achievements add column if not exists earned_at timestamptz`;
  await sql`update user_achievements set earned_at = unlocked_at where earned_at is null and unlocked_at is not null`;
  await sql`create unique index if not exists user_achievements_user_achievement_unique on user_achievements (user_id, achievement_id)`;
  await sql`create index if not exists user_achievements_user_unlocked_idx on user_achievements (user_id, unlocked_at desc)`;
  await sql`create index if not exists user_achievements_user_earned_idx on user_achievements (user_id, earned_at desc)`;

  await sql`
    insert into achievements (id, name, description, badge_icon, category, rarity, tier, points, goal_count, unlock_requirements, metadata)
    values
      ('first_movie_watched', 'First Movie Watched', 'Mark your first movie as watched.', 'clapper', 'movies', 'common', 'bronze', 10, 1, '{"metric":"movies_watched","threshold":1}'::jsonb, '{}'::jsonb),
      ('movie_explorer_bronze', 'Movie Explorer Bronze', 'Mark 10 movies as watched.', 'compass', 'movies', 'common', 'bronze', 10, 10, '{"metric":"movies_watched","threshold":10}'::jsonb, '{}'::jsonb),
      ('movie_collector_silver', 'Movie Collector Silver', 'Mark 50 movies as watched.', 'film-stack', 'movies', 'rare', 'silver', 25, 50, '{"metric":"movies_watched","threshold":50}'::jsonb, '{}'::jsonb),
      ('episode_tracker_bronze', 'Episode Tracker Bronze', 'Track 10 TV episodes.', 'tv', 'tv', 'common', 'bronze', 10, 10, '{"metric":"episodes_watched","threshold":10}'::jsonb, '{}'::jsonb),
      ('season_finisher_silver', 'Season Finisher Silver', 'Finish 3 TV seasons.', 'season', 'tv', 'rare', 'silver', 25, 3, '{"metric":"seasons_completed","threshold":3}'::jsonb, '{}'::jsonb),
      ('binge_watcher_gold', 'Binge Watcher Gold', 'Track 100 watched episodes.', 'bolt', 'tv', 'epic', 'gold', 50, 100, '{"metric":"episodes_watched","threshold":100}'::jsonb, '{}'::jsonb),
      ('playlist_creator_bronze', 'Playlist Creator Bronze', 'Create your first playlist.', 'playlist', 'playlists', 'common', 'bronze', 10, 1, '{"metric":"playlists_created","threshold":1}'::jsonb, '{}'::jsonb),
      ('playlist_collector_bronze', 'Playlist Collector Bronze', 'Follow 5 public playlists.', 'bookmark', 'playlists', 'common', 'bronze', 10, 5, '{"metric":"playlists_followed","threshold":5}'::jsonb, '{}'::jsonb),
      ('playlist_curator_silver', 'Playlist Curator Silver', 'Publish 3 public playlists.', 'spark', 'playlists', 'rare', 'silver', 25, 3, '{"metric":"public_playlists_created","threshold":3}'::jsonb, '{}'::jsonb),
      ('movie_buff_bronze', 'Movie Buff Bronze', 'Answer 10 trivia questions.', 'star', 'trivia', 'common', 'bronze', 10, 10, '{"metric":"trivia_completed","threshold":10}'::jsonb, '{}'::jsonb),
      ('film_fanatic_silver', 'Film Fanatic Silver', 'Answer 50 trivia questions.', 'stars', 'trivia', 'rare', 'silver', 25, 50, '{"metric":"trivia_completed","threshold":50}'::jsonb, '{}'::jsonb),
      ('trivia_master_gold', 'Trivia Master Gold', 'Answer 100 trivia questions.', 'trophy', 'trivia', 'epic', 'gold', 50, 100, '{"metric":"trivia_completed","threshold":100}'::jsonb, '{}'::jsonb),
      ('movie_detective', 'Movie Detective', 'Complete 10 trivia questions.', 'detective', 'trivia', 'common', 'bronze', 10, 10, '{"metric":"trivia_completed","threshold":10}'::jsonb, '{}'::jsonb),
      ('easter_egg_hunter', 'Easter Egg Hunter', 'Complete 5 Easter Egg Hunts.', 'egg', 'easter_eggs', 'common', 'bronze', 10, 5, '{"metric":"easter_eggs_completed","threshold":5}'::jsonb, '{}'::jsonb),
      ('easter_egg_hunter_silver', 'Easter Egg Hunter Silver', 'Complete 25 Easter Egg Hunts.', 'egg', 'easter_eggs', 'rare', 'silver', 25, 25, '{"metric":"easter_eggs_completed","threshold":25}'::jsonb, '{}'::jsonb),
      ('easter_egg_hunter_gold', 'Easter Egg Hunter Gold', 'Complete 100 Easter Egg Hunts.', 'target', 'easter_eggs', 'epic', 'gold', 50, 100, '{"metric":"easter_eggs_completed","threshold":100}'::jsonb, '{}'::jsonb),
      ('master_hunter_gold', 'Master Hunter Gold', 'Complete 25 Easter Egg Hunts.', 'target', 'easter_eggs', 'epic', 'gold', 50, 25, '{"metric":"easter_eggs_completed","threshold":25}'::jsonb, '{}'::jsonb),
      ('sci_fi_expert_bronze', 'Sci-Fi Expert Bronze', 'Complete companion progress in 3 sci-fi titles.', 'rocket', 'collections', 'common', 'bronze', 10, 3, '{"metric":"genre_titles_completed","genre":"Science Fiction","threshold":3}'::jsonb, '{}'::jsonb),
      ('horror_expert_bronze', 'Horror Expert Bronze', 'Complete companion progress in 3 horror titles.', 'mask', 'collections', 'common', 'bronze', 10, 3, '{"metric":"genre_titles_completed","genre":"Horror","threshold":3}'::jsonb, '{}'::jsonb),
      ('comedy_expert_bronze', 'Comedy Expert Bronze', 'Complete companion progress in 3 comedy titles.', 'laugh', 'collections', 'common', 'bronze', 10, 3, '{"metric":"genre_titles_completed","genre":"Comedy","threshold":3}'::jsonb, '{}'::jsonb),
      ('disaster_expert_bronze', 'Disaster Expert Bronze', 'Complete companion progress in 3 disaster titles.', 'storm', 'collections', 'common', 'bronze', 10, 3, '{"metric":"playlist_keyword_watched","keyword":"disaster","threshold":3}'::jsonb, '{}'::jsonb),
      ('franchise_expert_bronze', 'Franchise Expert Bronze', 'Complete companion progress in 3 related franchise titles.', 'collection', 'collections', 'common', 'bronze', 10, 3, '{"metric":"collection_titles_completed","threshold":3}'::jsonb, '{}'::jsonb),
      ('back_to_the_future_expert', 'Back to the Future Expert', 'Complete every available trivia question and Easter Egg Hunt for Back to the Future.', 'clock', 'collections', 'rare', 'gold', 50, 1, '{"metric":"title_companion_complete","mediaType":"movie","tmdbId":105,"threshold":1}'::jsonb, '{"mediaType":"movie","tmdbId":105}'::jsonb)
    on conflict (id) do update set
      name = excluded.name,
      description = excluded.description,
      badge_icon = excluded.badge_icon,
      category = excluded.category,
      rarity = excluded.rarity,
      tier = excluded.tier,
      points = excluded.points,
      goal_count = excluded.goal_count,
      unlock_requirements = excluded.unlock_requirements,
      metadata = excluded.metadata,
      updated_at = now()
  `;
}

export async function ensureNotificationsTable(sql: any) {
  await ensureAuthTables(sql);
  await ensurePgCrypto(sql);
  await sql`
    create table if not exists notifications (
      id uuid primary key default gen_random_uuid(),
      recipient_user_id uuid not null references users(id) on delete cascade,
      actor_user_id uuid references users(id) on delete set null,
      type text not null,
      entity_type text not null,
      entity_id uuid,
      source_release_event_id uuid,
      title text not null,
      message text not null,
      read_at timestamptz,
      created_at timestamptz not null default now()
    )
  `;
  await sql`alter table notifications add column if not exists source_release_event_id uuid`;
  await sql`create index if not exists notifications_recipient_created_idx on notifications (recipient_user_id, created_at desc)`;
  await sql`create index if not exists notifications_recipient_unread_idx on notifications (recipient_user_id, read_at)`;
  await sql`
    create unique index if not exists notifications_playlist_followed_unique
    on notifications (recipient_user_id, actor_user_id, type, entity_type, entity_id)
    where actor_user_id is not null
  `;
  await sql`create index if not exists notifications_type_idx on notifications (type)`;
  await sql`create index if not exists notifications_entity_idx on notifications (entity_type, entity_id)`;
  await sql`
    create unique index if not exists notifications_release_event_recipient_unique
    on notifications (recipient_user_id, source_release_event_id)
    where source_release_event_id is not null
  `;
}

export async function ensureFollowTitleTables(sql: any) {
  await ensureAuthTables(sql);
  await ensureNotificationsTable(sql);
  await ensurePgCrypto(sql);
  await sql`
    create table if not exists followed_titles (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references users(id) on delete cascade,
      media_item_id uuid not null references media_items(id) on delete cascade,
      media_type text not null check (media_type in ('movie', 'tv')),
      notification_settings jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;
  await sql`alter table followed_titles add column if not exists notification_settings jsonb not null default '{}'::jsonb`;
  await sql`create unique index if not exists followed_titles_user_media_unique on followed_titles (user_id, media_item_id)`;
  await sql`create index if not exists followed_titles_user_created_idx on followed_titles (user_id, created_at desc)`;
  await sql`create index if not exists followed_titles_media_item_idx on followed_titles (media_item_id)`;

  await sql`
    create table if not exists notification_preferences (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references users(id) on delete cascade,
      followed_title_id uuid not null references followed_titles(id) on delete cascade,
      media_item_id uuid not null references media_items(id) on delete cascade,
      preferences jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;
  await sql`create unique index if not exists notification_preferences_followed_title_unique on notification_preferences (followed_title_id)`;
  await sql`create index if not exists notification_preferences_user_idx on notification_preferences (user_id)`;

  await sql`
    create table if not exists release_tracking (
      id uuid primary key default gen_random_uuid(),
      media_item_id uuid not null references media_items(id) on delete cascade,
      media_type text not null check (media_type in ('movie', 'tv')),
      release_date date,
      status text,
      upcoming boolean not null default false,
      trailer_count integer not null default 0,
      provider_hash text,
      season_count integer,
      episode_count integer,
      last_checked_at timestamptz,
      change_hash text,
      season_data jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      cached_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;
  await sql`alter table release_tracking add column if not exists season_data jsonb not null default '{}'::jsonb`;
  await sql`alter table release_tracking add column if not exists trailer_count integer not null default 0`;
  await sql`alter table release_tracking add column if not exists provider_hash text`;
  await sql`alter table release_tracking add column if not exists season_count integer`;
  await sql`alter table release_tracking add column if not exists episode_count integer`;
  await sql`alter table release_tracking add column if not exists last_checked_at timestamptz`;
  await sql`alter table release_tracking add column if not exists change_hash text`;
  await sql`alter table release_tracking add column if not exists last_release_check_status text`;
  await sql`alter table release_tracking add column if not exists created_at timestamptz not null default now()`;
  await sql`create unique index if not exists release_tracking_media_item_unique on release_tracking (media_item_id)`;
  await sql`create index if not exists release_tracking_upcoming_idx on release_tracking (upcoming, release_date)`;
  await sql`create index if not exists release_tracking_last_checked_idx on release_tracking (last_checked_at)`;

  await sql`
    create table if not exists notification_events (
      id uuid primary key default gen_random_uuid(),
      media_item_id uuid not null references media_items(id) on delete cascade,
      media_type text not null check (media_type in ('movie', 'tv')),
      tmdb_id integer not null,
      event_type text not null,
      title text not null,
      body text not null,
      change_hash text not null,
      old_state jsonb not null default '{}'::jsonb,
      new_state jsonb not null default '{}'::jsonb,
      event_date timestamptz not null default now(),
      source text not null default 'release_intelligence',
      created_at timestamptz not null default now()
    )
  `;
  await sql`create unique index if not exists notification_events_media_event_change_unique on notification_events (media_item_id, event_type, change_hash)`;
  await sql`create index if not exists notification_events_media_created_idx on notification_events (media_item_id, created_at desc)`;
  await sql`create index if not exists notification_events_type_created_idx on notification_events (event_type, created_at desc)`;

  await sql`
    create table if not exists release_events (
      id uuid primary key default gen_random_uuid(),
      media_item_id uuid not null references media_items(id) on delete cascade,
      media_type text not null check (media_type in ('movie', 'tv')),
      tmdb_id integer not null,
      event_type text not null,
      old_value jsonb,
      new_value jsonb,
      old_state jsonb not null default '{}'::jsonb,
      new_state jsonb not null default '{}'::jsonb,
      title text not null,
      body text not null,
      change_hash text not null,
      source text not null default 'release_intelligence',
      created_at timestamptz not null default now()
    )
  `;
  await sql`create unique index if not exists release_events_media_event_change_unique on release_events (media_item_id, event_type, change_hash)`;
  await sql`create index if not exists release_events_media_created_idx on release_events (media_item_id, created_at desc)`;
  await sql`create index if not exists release_events_type_created_idx on release_events (event_type, created_at desc)`;

  await sql`
    create table if not exists release_event_notifications (
      id uuid primary key default gen_random_uuid(),
      release_event_id uuid not null references release_events(id) on delete cascade,
      notification_id uuid not null references notifications(id) on delete cascade,
      recipient_user_id uuid not null references users(id) on delete cascade,
      created_at timestamptz not null default now()
    )
  `;
  await sql`create unique index if not exists release_event_notifications_event_recipient_unique on release_event_notifications (release_event_id, recipient_user_id)`;
  await sql`create index if not exists release_event_notifications_recipient_idx on release_event_notifications (recipient_user_id, created_at desc)`;
  await sql`create index if not exists release_event_notifications_notification_idx on release_event_notifications (notification_id)`;
}

export function normalizeHandle(handle: string) {
  return handle.toLowerCase().trim();
}

export function validateProfileHandle(handle: string) {
  const normalized = normalizeHandle(handle);

  if (!normalized) return "Choose a username for your Flim URL.";
  if (!/^[a-z0-9_-]+$/.test(normalized)) return "Use lowercase letters, numbers, hyphens, or underscores only.";
  if (reservedProfileHandles.has(normalized)) return "That username is reserved by Flim.";

  return "";
}

export function mapUserProfile(row: any) {
  return {
    id: row.id,
    userId: row.user_id,
    displayName: row.display_name || "",
    handle: row.handle || "",
    bio: row.bio || "",
    countryCode: row.country_code || "",
    region: row.province_state || row.region || "",
    provinceState: row.province_state || row.region || "",
    postalCode: row.postal_code || "",
    streamingRegion: row.streaming_region || "",
    preferredProviders: Array.isArray(row.preferred_providers) ? row.preferred_providers : [],
    showCountryPublicly: Boolean(row.show_country_publicly),
    avatarKey: row.avatar_key || "director",
    avatarCustomization: row.avatar_customization && typeof row.avatar_customization === "object" ? row.avatar_customization : {},
    profileImageUrl: row.profile_image_url || "",
    heroImageUrl: row.hero_image_url || "",
    favoriteMovie: row.favorite_movie || "",
    favoriteGenre: row.favorite_genre || "",
    favoriteDirector: row.favorite_director || "",
    profileStatus: row.profile_status || "",
    featuredPlaylistIds: Array.isArray(row.featured_playlist_ids) ? row.featured_playlist_ids : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapPublicUserProfile(row: any) {
  const publicPlaylists = Array.isArray(row.public_playlists)
    ? row.public_playlists.map((playlist: any) => mapPlaylist(playlist, playlist.movies || []))
    : [];

  return {
    displayName: row.display_name || row.handle,
    handle: row.handle,
    bio: row.bio || "",
    avatarKey: row.avatar_key || "director",
    avatarCustomization: row.avatar_customization && typeof row.avatar_customization === "object" ? row.avatar_customization : {},
    profileImageUrl: row.profile_image_url || "",
    heroImageUrl: row.hero_image_url || "",
    favoriteMovie: row.favorite_movie || "",
    favoriteGenre: row.favorite_genre || "",
    favoriteDirector: row.favorite_director || "",
    profileStatus: row.profile_status || "",
    featuredPlaylistIds: Array.isArray(row.featured_playlist_ids) ? row.featured_playlist_ids : [],
    favoriteGenres: row.favorite_genre ? [row.favorite_genre] : [],
    joinedAt: row.created_at,
    isOwnProfile: Boolean(row.is_own_profile),
    isFollowing: Boolean(row.is_following),
    countryCode: row.show_country_publicly ? row.country_code || undefined : undefined,
    stats: row.stats || undefined,
    achievements: row.achievement_summary || undefined,
    challenges: row.challenge_summary || undefined,
    seasonalChallenges: row.seasonal_challenge_summary || undefined,
    triviaAndChallenges: row.trivia_and_challenges_summary || undefined,
    hallOfFame: row.hall_of_fame_summary || undefined,
    publicPlaylists,
  };
}
