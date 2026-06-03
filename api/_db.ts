import { neon } from "@neondatabase/serverless";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export function db() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured.");
  }

  return neon(databaseUrl);
}

export function sendJson(response: any, status: number, body: unknown) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(body));
}

export function readBody(request: any): Promise<any> {
  if (request.body) {
    return Promise.resolve(typeof request.body === "string" ? JSON.parse(request.body || "{}") : request.body);
  }

  return new Promise((resolve, reject) => {
    let raw = "";
    request.on("data", (chunk: Buffer) => {
      raw += chunk.toString();
    });
    request.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
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

  return {
    id: row.id,
    publicSlug: row.public_slug,
    name: row.name,
    description: row.description || "",
    visibility: row.visibility,
    creatorHandle: row.creator_handle || undefined,
    creatorDisplayName: row.creator_display_name || undefined,
    ownerUserId: row.owner_user_id || undefined,
    isOwner: Boolean(row.is_owner),
    isFollowing: Boolean(row.is_following),
    followerCount: Number.isFinite(followerCount) ? followerCount : 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    movies: movies.map(mapPlaylistMovie),
  };
}

export function mapPlaylistMovie(row: any) {
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
    genres: [],
    runtimeMinutes: row.runtime_minutes || undefined,
    seasonCount: row.season_count || undefined,
    episodeCount: row.episode_count || undefined,
    sortOrder: typeof row.sort_order === "number" ? row.sort_order : undefined,
    addedAt: row.added_at,
    watchStatus: row.watched ? "watched" : "not_watched",
  };
}

export const reservedProfileHandles = new Set([
  "admin",
  "support",
  "help",
  "api",
  "settings",
  "login",
  "logout",
  "flix",
  "plex",
  "movies",
  "public",
  "playlists",
  "roulette",
  "flim",
]);

export const demoUserId = "demo-user";
const sessionCookieName = "flim_session";

export async function ensureAuthTables(sql: any) {
  await sql`create extension if not exists pgcrypto`;
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
  await sql`create extension if not exists pgcrypto`;
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
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;
  await sql`alter table user_profiles add column if not exists province_state text`;
  await sql`create unique index if not exists user_profiles_handle_unique on user_profiles (handle)`;
  await sql`create unique index if not exists user_profiles_user_id_unique on user_profiles (user_id)`;
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

export async function ensurePlaylistFollowsTable(sql: any) {
  await ensureAuthTables(sql);
  await sql`create extension if not exists pgcrypto`;
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
    countryCode: row.show_country_publicly ? row.country_code || undefined : undefined,
    stats: row.stats || undefined,
    publicPlaylists,
  };
}
