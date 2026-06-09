const TMDB_API_BASE_URL = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE_URL = "https://image.tmdb.org/t/p/w500";

interface TmdbSearchMovie {
  id: number;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  release_date?: string;
  first_air_date?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  genre_ids?: number[];
  original_language?: string;
  popularity?: number;
}

interface TmdbMovieDetails extends TmdbSearchMovie {
  runtime?: number;
  status?: string;
  genres?: Array<{ id: number; name: string }>;
  number_of_seasons?: number;
  number_of_episodes?: number;
  episode_run_time?: number[];
  release_dates?: {
    results?: Array<{
      iso_3166_1: string;
      release_dates?: Array<{ certification?: string }>;
    }>;
  };
  content_ratings?: {
    results?: Array<{
      iso_3166_1: string;
      rating?: string;
    }>;
  };
  seasons?: Array<{
    id?: number;
    season_number?: number;
    name?: string;
    episode_count?: number;
    poster_path?: string | null;
    air_date?: string;
  }>;
}

interface TmdbSeasonDetails {
  id?: number;
  season_number?: number;
  name?: string;
  overview?: string;
  poster_path?: string | null;
  air_date?: string;
  episodes?: Array<{
    id?: number;
    episode_number?: number;
    season_number?: number;
    name?: string;
    overview?: string;
    runtime?: number;
    air_date?: string;
    still_path?: string | null;
  }>;
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
  const releaseDate = mediaType === "tv" ? movie.first_air_date : movie.release_date;
  return {
    tmdbId: movie.id,
    mediaType,
    title: movie.title || movie.name || "Untitled movie",
    originalTitle: movie.original_title || movie.original_name || undefined,
    releaseDate: releaseDate || undefined,
    releaseYear: releaseYear(releaseDate),
    overview: movie.overview || "No overview is available yet.",
    posterPath: movie.poster_path || undefined,
    posterUrl: posterUrl(movie.poster_path),
    backdropUrl: posterUrl(movie.backdrop_path),
    genreIds: movie.genre_ids || [],
    language: movie.original_language || undefined,
    popularity: movie.popularity,
  };
}

function firstNonEmptyRating(values: Array<string | undefined>) {
  return values.find((value) => Boolean(value?.trim()))?.trim();
}

function mapContentRatings(payload: TmdbMovieDetails, mediaType: "movie" | "tv") {
  if (mediaType === "tv") {
    return (payload.content_ratings?.results || [])
      .map((result) => ({
        countryCode: result.iso_3166_1,
        rating: result.rating?.trim() || "",
      }))
      .filter((result) => result.countryCode && result.rating);
  }

  return (payload.release_dates?.results || [])
    .map((result) => ({
      countryCode: result.iso_3166_1,
      rating: firstNonEmptyRating((result.release_dates || []).map((release) => release.certification)) || "",
    }))
    .filter((result) => result.countryCode && result.rating);
}

function chooseContentRating(ratings: Array<{ countryCode: string; rating: string }>) {
  return (
    ratings.find((rating) => rating.countryCode === "CA") ||
    ratings.find((rating) => rating.countryCode === "US") ||
    ratings[0]
  )?.rating;
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
  await runSchemaStatement(sql`
    create table if not exists tmdb_tv_season_cache (
      id uuid primary key default gen_random_uuid(),
      tmdb_show_id integer not null,
      season_number integer not null,
      response_json jsonb not null,
      created_at timestamptz not null default now(),
      expires_at timestamptz not null
    )
  `);
  await runSchemaStatement(sql`create unique index if not exists tmdb_tv_season_cache_show_season_unique on tmdb_tv_season_cache (tmdb_show_id, season_number)`);
  await runSchemaStatement(sql`create index if not exists tmdb_tv_season_cache_expires_at_idx on tmdb_tv_season_cache (expires_at)`);
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
    throw new Error("Movie search failed.");
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
  url.searchParams.set("append_to_response", mediaType === "tv" ? "content_ratings" : "release_dates");

  const response = await fetch(url, applyTmdbAuth(url));
  if (!response.ok) {
    throw new Error("Title details failed.");
  }

  const payload = (await response.json()) as TmdbMovieDetails;
  const base = mapSearchMovie(payload, mediaType);
  const contentRatings = mapContentRatings(payload, mediaType);

  return {
    ...base,
    runtimeMinutes: mediaType === "tv" ? payload.episode_run_time?.[0] : payload.runtime,
    genres: payload.genres?.map((genre) => genre.name) || [],
    seasonCount: payload.number_of_seasons,
    episodeCount: payload.number_of_episodes,
    seasons: mediaType === "tv"
      ? (payload.seasons || [])
        .filter((season) => Number(season.season_number) > 0)
        .map((season) => ({
          tmdbId: season.id,
          seasonNumber: Number(season.season_number),
          title: season.name || `Season ${season.season_number}`,
          episodeCount: season.episode_count || 0,
          posterUrl: posterUrl(season.poster_path),
          airDate: season.air_date || undefined,
        }))
      : undefined,
    firstAirYear: releaseYear(payload.first_air_date),
    contentRating: chooseContentRating(contentRatings),
    contentRatings,
    contentRatingVersion: 1,
    status: payload.status,
  };
}

export async function fetchTmdbTvSeasonDetails(tmdbShowId: number, seasonNumber: number) {
  if (!hasServerTmdbCredential()) {
    throw new Error("TMDb server credentials are missing.");
  }

  const url = new URL(`${TMDB_API_BASE_URL}/tv/${tmdbShowId}/season/${seasonNumber}`);
  url.searchParams.set("language", "en-US");

  const response = await fetch(url, applyTmdbAuth(url));
  if (!response.ok) {
    throw new Error("TV season details failed.");
  }

  const payload = (await response.json()) as TmdbSeasonDetails;
  return {
    tmdbId: payload.id,
    seasonNumber: Number(payload.season_number || seasonNumber),
    title: payload.name || `Season ${seasonNumber}`,
    overview: payload.overview || "",
    posterUrl: posterUrl(payload.poster_path),
    airDate: payload.air_date || undefined,
    episodes: (payload.episodes || [])
      .filter((episode) => Number(episode.episode_number) > 0)
      .map((episode) => ({
        tmdbId: episode.id,
        seasonNumber: Number(episode.season_number || seasonNumber),
        episodeNumber: Number(episode.episode_number),
        title: episode.name || `Episode ${episode.episode_number}`,
        overview: episode.overview || "",
        runtimeMinutes: episode.runtime || undefined,
        airDate: episode.air_date || undefined,
        stillUrl: posterUrl(episode.still_path),
      })),
  };
}
