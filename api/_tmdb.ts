const TMDB_API_BASE_URL = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE_URL = "https://image.tmdb.org/t/p/w500";

interface TmdbSearchMovie {
  id: number;
  title?: string;
  name?: string;
  release_date?: string;
  overview?: string;
  poster_path?: string | null;
  genre_ids?: number[];
}

interface TmdbMovieDetails extends TmdbSearchMovie {
  runtime?: number;
  genres?: Array<{ id: number; name: string }>;
}

function tmdbAccessToken() {
  return process.env.TMDB_ACCESS_TOKEN?.trim() || process.env.MOVIE_API_ACCESS_TOKEN?.trim();
}

function tmdbApiKey() {
  return process.env.TMDB_API_KEY?.trim() || process.env.MOVIE_API_KEY?.trim();
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

function mapSearchMovie(movie: TmdbSearchMovie) {
  return {
    tmdbId: movie.id,
    title: movie.title || movie.name || "Untitled movie",
    releaseYear: releaseYear(movie.release_date),
    overview: movie.overview || "No overview is available yet.",
    posterPath: movie.poster_path || undefined,
    posterUrl: posterUrl(movie.poster_path),
    genreIds: movie.genre_ids || [],
  };
}

export function normalizeMovieQuery(query: string) {
  return query.trim().toLowerCase();
}

export async function fetchTmdbSearch(query: string) {
  if (!hasServerTmdbCredential()) {
    throw new Error("TMDb server credentials are missing.");
  }

  const url = new URL(`${TMDB_API_BASE_URL}/search/movie`);
  url.searchParams.set("query", query);
  url.searchParams.set("include_adult", "false");
  url.searchParams.set("language", "en-US");

  const response = await fetch(url, applyTmdbAuth(url));
  if (!response.ok) {
    throw new Error("TMDb movie search failed.");
  }

  const payload = (await response.json()) as { results?: TmdbSearchMovie[] };
  return (payload.results || []).map(mapSearchMovie);
}

export async function fetchTmdbMovieDetails(tmdbId: number) {
  if (!hasServerTmdbCredential()) {
    throw new Error("TMDb server credentials are missing.");
  }

  const url = new URL(`${TMDB_API_BASE_URL}/movie/${tmdbId}`);
  url.searchParams.set("language", "en-US");

  const response = await fetch(url, applyTmdbAuth(url));
  if (!response.ok) {
    throw new Error("TMDb movie details failed.");
  }

  const payload = (await response.json()) as TmdbMovieDetails;
  const base = mapSearchMovie(payload);

  return {
    ...base,
    runtimeMinutes: payload.runtime,
    genres: payload.genres?.map((genre) => genre.name) || [],
  };
}
