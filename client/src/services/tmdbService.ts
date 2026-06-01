import type { MediaType, MovieDetails, MovieSearchResult } from "../types";

async function apiRequest<T>(path: string): Promise<T> {
  const response = await fetch(path, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error || "Movie request failed.");
  }

  return response.json() as Promise<T>;
}

export function hasTmdbApiKey() {
  // TMDb credentials are now server-side only. This remains true so existing UI
  // flows do not expose or require browser-side movie API secrets.
  return true;
}

export type MediaSearchMode = MediaType | "both";

export async function searchMovies(query: string, mediaType: MediaSearchMode = "both"): Promise<MovieSearchResult[]> {
  const cleanQuery = query.trim();
  if (!cleanQuery) return [];

  return apiRequest<MovieSearchResult[]>(`/api/movies/search?q=${encodeURIComponent(cleanQuery)}&type=${mediaType}`);
}

export async function getMovieDetails(tmdbId: number): Promise<MovieDetails> {
  if (!Number.isFinite(tmdbId)) {
    throw new Error("A valid TMDb movie ID is required.");
  }

  return apiRequest<MovieDetails>(`/api/movies/${tmdbId}`);
}

export async function getTvDetails(tmdbId: number): Promise<MovieDetails> {
  if (!Number.isFinite(tmdbId)) {
    throw new Error("A valid TMDb TV ID is required.");
  }

  return apiRequest<MovieDetails>(`/api/movies/tv/${tmdbId}`);
}
