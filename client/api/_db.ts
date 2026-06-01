import { neon } from "@neondatabase/serverless";

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
  return {
    id: row.id,
    publicSlug: row.public_slug,
    name: row.name,
    description: row.description || "",
    visibility: row.visibility,
    creatorHandle: row.creator_handle || undefined,
    creatorDisplayName: row.creator_display_name || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    movies: movies.map(mapPlaylistMovie),
  };
}

export function mapPlaylistMovie(row: any) {
  return {
    id: row.id,
    playlistId: row.playlist_id,
    tmdbId: row.tmdb_id,
    title: row.title,
    releaseYear: row.year || undefined,
    posterUrl: row.poster_url || undefined,
    overview: row.overview || "",
    genres: [],
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
  "plex",
  "public",
  "playlists",
  "roulette",
  "flim",
]);

export const demoUserId = "demo-user";

export async function ensureUserProfilesTable(sql: any) {
  await sql`create extension if not exists pgcrypto`;
  await sql`
    create table if not exists user_profiles (
      id uuid primary key default gen_random_uuid(),
      user_id text not null unique,
      display_name text not null default '',
      handle text not null unique,
      bio text,
      country_code text not null default '',
      region text,
      postal_code text,
      streaming_region text not null default '',
      preferred_providers jsonb not null default '[]'::jsonb,
      show_country_publicly boolean not null default false,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;
  await sql`create unique index if not exists user_profiles_handle_unique on user_profiles (handle)`;
  await sql`create unique index if not exists user_profiles_user_id_unique on user_profiles (user_id)`;
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
    region: row.region || "",
    postalCode: row.postal_code || "",
    streamingRegion: row.streaming_region || "",
    preferredProviders: Array.isArray(row.preferred_providers) ? row.preferred_providers : [],
    showCountryPublicly: Boolean(row.show_country_publicly),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapPublicUserProfile(row: any) {
  return {
    displayName: row.display_name || row.handle,
    handle: row.handle,
    bio: row.bio || "",
    countryCode: row.show_country_publicly ? row.country_code || undefined : undefined,
  };
}
