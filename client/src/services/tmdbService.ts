import type { MediaType, MovieDetails, MovieSearchResult } from "../types";

async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15000);
  let response: Response;

  try {
    response = await fetch(path, {
      headers: {
        Accept: "application/json",
        ...options.headers,
      },
      ...options,
      signal: options.signal || controller.signal,
    });
  } catch (error) {
    const reason = error instanceof DOMException && error.name === "AbortError" ? "timeout" : "network";
    console.warn("tmdb_client_request_failed", {
      path,
      reason,
      message: error instanceof Error ? error.message : "Movie request failed.",
    });
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    console.warn("tmdb_client_response_failed", {
      path,
      status: response.status,
      reason: payload?.error || response.statusText || "Movie request failed.",
    });
    throw new Error(payload?.error || "Movie request failed.");
  }

  try {
    return await response.json() as T;
  } catch (error) {
    console.warn("tmdb_client_parse_failed", {
      path,
      message: error instanceof Error ? error.message : "Movie response could not be parsed.",
    });
    throw error;
  }
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

interface DetailRequestOptions {
  bypassCache?: boolean;
}

function detailPath(tmdbId: number, mediaType: MediaType, options: DetailRequestOptions = {}) {
  const params = new URLSearchParams({ type: mediaType });
  if (options.bypassCache) params.set("_retry", String(Date.now()));
  return `/api/movies/${tmdbId}?${params.toString()}`;
}

export async function getMovieDetails(tmdbId: number, options: DetailRequestOptions = {}): Promise<MovieDetails> {
  if (!Number.isFinite(tmdbId)) {
    throw new Error("A valid movie ID is required.");
  }

  return apiRequest<MovieDetails>(detailPath(tmdbId, "movie", options), options.bypassCache ? { cache: "no-store" } : undefined);
}

export async function getTvDetails(tmdbId: number, options: DetailRequestOptions = {}): Promise<MovieDetails> {
  if (!Number.isFinite(tmdbId)) {
    throw new Error("A valid TV show ID is required.");
  }

  return apiRequest<MovieDetails>(detailPath(tmdbId, "tv", options), options.bypassCache ? { cache: "no-store" } : undefined);
}
