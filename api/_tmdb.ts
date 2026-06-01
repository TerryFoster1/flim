const TMDB_API_BASE_URL = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE_URL = "https://image.tmdb.org/t/p/w500";

interface TmdbSearchMovie {
  id: number;
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  overview?: string;
  poster_path?: string | null;
  genre_ids?: number[];
}

interface TmdbMovieDetails extends TmdbSearchMovie {
  runtime?: number;
  genres?: Array<{ id: number; name: string }>;
  number_of_seasons?: number;
  number_of_episodes?: number;
  episode_run_time?: number[];
}

function tmdbAccessToken() {
  return (
    process.env.TMDB_ACCESS_TOKEN?.trim() ||
    process.env.MOVIE_API_ACCESS_TOKEN?.trim() ||
    // Temporary server-side compatibility for the existing Vercel env name.
    // The browser bundle does not read this value; migrate Vercel to
    // TMDB_ACCESS_TOKEN and remove this fallback later.
    process.env.VITE_TMDB_ACCESS_TOKEN?.trim()
  );
}

function tmdbApiKey() {
  return (
    process.env.TMDB_API_KEY?.trim() ||
    process.env.MOVIE_API_KEY?.trim()
  );
}

export function hasServerTmdbCredential() {
  return Boolean(tmdbAccessToken() || tmdbApiKey());
}

function posterUrl(posterPath?: string | null) {
  return posterPath ? `${TMDB_IMAGE_BASE_URL}${posterPath}` : undefined;
}

function releaseYear(date?: string) {
  return date ? date.slice(0, 4) : undefined;
}

function applyTmdbAuth(url: URL): RequestInit {
  const token = tmdbAccessToken();
  if (token) {
    return {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    };
  }

  const key = tmdbApiKey();
  if (key) {
    url.searchParams.set("api_key", key);
  }

  return {};
}

function mapSearchMovie(movie: TmdbSearchMovie, mediaType: "movie" | "tv" = "movie") {
  return {
    tmdbId: movie.id,
    mediaType,
    title: movie.title || movie.name || "Untitled movie",
    releaseYear: releaseYear(mediaType === "tv" ? movie.first_air_date : movie.release_date),
    overview: movie.overview || "No overview is available yet.",
    posterPath: movie.poster_path || undefined,
    posterUrl: posterUrl(movie.poster_path),
    genreIds: movie.genre_ids || [],
  };
}

export function normalizeMovieQuery(query: string) {
  return query.trim().toLowerCase();
}

async function runSchemaStatement(statement: Promise<unknown>) {
  try {
    await statement;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (
      message.includes("pg_type_typname_nsp_index") ||
      message.includes("pg_class_relname_nsp_index") ||
      message.includes("duplicate key value violates unique constraint") ||
      message.includes("already exists")
    ) {
      return;
    }
    throw error;
  }
}

export async function ensureTmdbCacheTables(sql: any) {
  // Additive safety net for Vercel deployments where the SQL setup has not been
  // applied yet. The canonical schema still lives in server/sql/neon-setup.sql.
  await runSchemaStatement(sql`
    create table if not exists tmdb_search_cache (
      id uuid primary key default gen_random_uuid(),
      query text not null,
      normalized_query text not null,
      media_type text not null default 'movie',
      response_json jsonb not null,
      created_at timestamptz not null default now(),
      expires_at timestamptz not null
    )
  `);
  await runSchemaStatement(sql`alter table tmdb_search_cache add column if not exists media_type text not null default 'movie'`);
  await runSchemaStatement(sql`alter table tmdb_search_cache drop constraint if exists tmdb_search_cache_normalized_query_key`);
  await runSchemaStatement(sql`create unique index if not exists tmdb_search_cache_media_query_unique on tmdb_search_cache (media_type, normalized_query)`);
  await runSchemaStatement(sql`create index if not exists tmdb_search_cache_normalized_query_idx on tmdb_search_cache (normalized_query)`);
  await runSchemaStatement(sql`create index if not exists tmdb_search_cache_expires_at_idx on tmdb_search_cache (expires_at)`);
  await runSchemaStatement(sql`
    create table if not exists tmdb_movie_cache (
      id uuid primary key default gen_random_uuid(),
      tmdb_id integer not null unique,
      response_json jsonb not null,
      created_at timestamptz not null default now(),
      expires_at timestamptz not null
    )
  `);
  await runSchemaStatement(sql`alter table tmdb_movie_cache add column if not exists media_type text not null default 'movie'`);
  await runSchemaStatement(sql`alter table tmdb_movie_cache drop constraint if exists tmdb_movie_cache_tmdb_id_key`);
  await runSchemaStatement(sql`create unique index if not exists tmdb_movie_cache_media_tmdb_unique on tmdb_movie_cache (media_type, tmdb_id)`);
  await runSchemaStatement(sql`create index if not exists tmdb_movie_cache_tmdb_id_idx on tmdb_movie_cache (tmdb_id)`);
  await runSchemaStatement(sql`create index if not exists tmdb_movie_cache_expires_at_idx on tmdb_movie_cache (expires_at)`);
}

async function fetchTmdbSearchByType(query: string, mediaType: "movie" | "tv") {
  if (!hasServerTmdbCredential()) {
    throw new Error("TMDb server credentials are missing.");
  }

  const url = new URL(`${TMDB_API_BASE_URL}/search/${mediaType}`);
  url.searchParams.set("query", query);
  url.searchParams.set("include_adult", "false");
  url.searchParams.set("language", "en-US");

  const response = await fetch(url, applyTmdbAuth(url));
  if (!response.ok) {
    throw new Error("TMDb movie search failed.");
  }

  const payload = (await response.json()) as { results?: TmdbSearchMovie[] };
  return (payload.results || []).map((item) => mapSearchMovie(item, mediaType));
}

export async function fetchTmdbSearch(query: string, mediaType: "movie" | "tv" | "both" = "movie") {
  if (mediaType === "both") {
    const [movies, tvShows] = await Promise.all([fetchTmdbSearchByType(query, "movie"), fetchTmdbSearchByType(query, "tv")]);
    return [...movies, ...tvShows].sort((a, b) => (b.posterUrl ? 1 : 0) - (a.posterUrl ? 1 : 0));
  }

  return fetchTmdbSearchByType(query, mediaType);
}

export async function fetchTmdbMovieDetails(tmdbId: number, mediaType: "movie" | "tv" = "movie") {
  if (!hasServerTmdbCredential()) {
    throw new Error("TMDb server credentials are missing.");
  }

  const url = new URL(`${TMDB_API_BASE_URL}/${mediaType}/${tmdbId}`);
  url.searchParams.set("language", "en-US");

  const response = await fetch(url, applyTmdbAuth(url));
  if (!response.ok) {
    throw new Error("TMDb movie details failed.");
  }

  const payload = (await response.json()) as TmdbMovieDetails;
  const base = mapSearchMovie(payload, mediaType);

  return {
    ...base,
    runtimeMinutes: mediaType === "tv" ? payload.episode_run_time?.[0] : payload.runtime,
    genres: payload.genres?.map((genre) => genre.name) || [],
    seasonCount: payload.number_of_seasons,
    episodeCount: payload.number_of_episodes,
    firstAirYear: releaseYear(payload.first_air_date),
  };
}
