import { neon } from "@neondatabase/serverless";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

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
  response.end(JSON.stringify(body));
}

export function readBody(request: any): Promise<any> {
  if (request.body) {
    if (typeof request.body !== "string") return Promise.resolve(request.body);

    try {
      return Promise.resolve(JSON.parse(request.body || "{}"));
    } catch {
      return Promise.resolve({});
    }
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
      profile_image_url text,
      hero_image_url text,
      favorite_movie text,
      favorite_genre text,
      favorite_director text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;
  await sql`alter table user_profiles add column if not exists province_state text`;
  await sql`alter table user_profiles add column if not exists profile_image_url text`;
  await sql`alter table user_profiles add column if not exists hero_image_url text`;
  await sql`alter table user_profiles add column if not exists favorite_movie text`;
  await sql`alter table user_profiles add column if not exists favorite_genre text`;
  await sql`alter table user_profiles add column if not exists favorite_director text`;
  await sql`create unique index if not exists user_profiles_handle_unique on user_profiles (handle)`;
  await sql`create unique index if not exists user_profiles_user_id_unique on user_profiles (user_id)`;
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
    profileImageUrl: row.profile_image_url || "",
    heroImageUrl: row.hero_image_url || "",
    favoriteMovie: row.favorite_movie || "",
    favoriteGenre: row.favorite_genre || "",
    favoriteDirector: row.favorite_director || "",
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
    profileImageUrl: row.profile_image_url || "",
    heroImageUrl: row.hero_image_url || "",
    favoriteMovie: row.favorite_movie || "",
    favoriteGenre: row.favorite_genre || "",
    favoriteDirector: row.favorite_director || "",
    joinedAt: row.created_at,
    isOwnProfile: Boolean(row.is_own_profile),
    isFollowing: Boolean(row.is_following),
    countryCode: row.show_country_publicly ? row.country_code || undefined : undefined,
    stats: row.stats || undefined,
    publicPlaylists,
  };
}
