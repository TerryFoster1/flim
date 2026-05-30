import type { MovieDetails, MovieSearchResult } from "../types";

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

function apiKey() {
  return import.meta.env.VITE_TMDB_API_KEY as string | undefined;
}

function posterUrl(posterPath?: string | null) {
  return posterPath ? `${TMDB_IMAGE_BASE_URL}${posterPath}` : undefined;
}

function releaseYear(date?: string) {
  return date ? date.slice(0, 4) : undefined;
}

function mapSearchMovie(movie: TmdbSearchMovie): MovieSearchResult {
  return {
    tmdbId: movie.id,
    title: movie.title || movie.name || "Movie Title",
    releaseYear: releaseYear(movie.release_date),
    overview: movie.overview || "No overview is available yet.",
    posterPath: movie.poster_path || undefined,
    posterUrl: posterUrl(movie.poster_path),
    genreIds: movie.genre_ids || [],
  };
}

export function hasTmdbApiKey() {
  return Boolean(apiKey());
}

export async function searchMovies(query: string): Promise<MovieSearchResult[]> {
  const key = apiKey();
  const cleanQuery = query.trim();

  if (!key || !cleanQuery) {
    return [];
  }

  const url = new URL(`${TMDB_API_BASE_URL}/search/movie`);
  url.searchParams.set("api_key", key);
  url.searchParams.set("query", cleanQuery);
  url.searchParams.set("include_adult", "false");
  url.searchParams.set("language", "en-US");

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("TMDb movie search failed.");
  }

  const payload = (await response.json()) as { results?: TmdbSearchMovie[] };
  return (payload.results || []).map(mapSearchMovie);
}

export async function getMovieDetails(tmdbId: number): Promise<MovieDetails> {
  const key = apiKey();
  if (!key) {
    throw new Error("TMDb API key is missing.");
  }

  const url = new URL(`${TMDB_API_BASE_URL}/movie/${tmdbId}`);
  url.searchParams.set("api_key", key);
  url.searchParams.set("language", "en-US");

  const response = await fetch(url);
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
