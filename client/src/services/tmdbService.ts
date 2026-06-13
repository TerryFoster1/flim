import type { MediaType, MovieDetails, MovieSearchResult } from "../types";

interface ApiRequestOptions extends RequestInit {
  timeoutMs?: number;
}

async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const controller = new AbortController();
  const timeoutMs = typeof options.timeoutMs === "number" ? options.timeoutMs : 15000;
  const timeout = timeoutMs > 0 ? window.setTimeout(() => controller.abort(), timeoutMs) : null;
  const startedAt = performance.now();
  let response: Response;
  const { timeoutMs: _timeoutMs, ...fetchOptions } = options;

  try {
    response = await fetch(path, {
      headers: {
        Accept: "application/json",
        ...fetchOptions.headers,
      },
      ...fetchOptions,
      signal: fetchOptions.signal || controller.signal,
    });
  } catch (error) {
    const reason = error instanceof DOMException && error.name === "AbortError" ? "timeout" : "network";
    console.warn("tmdb_client_request_failed", {
      path,
      reason,
      durationMs: Math.round(performance.now() - startedAt),
      message: error instanceof Error ? error.message : "Movie request failed.",
    });
    throw error;
  } finally {
    if (timeout) window.clearTimeout(timeout);
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    console.warn("tmdb_client_response_failed", {
      path,
      status: response.status,
      durationMs: Math.round(performance.now() - startedAt),
      reason: payload?.error || response.statusText || "Movie request failed.",
    });
    throw new Error(payload?.error || "Movie request failed.");
  }

  try {
    const payload = await response.json() as T;
    if (path.startsWith("/api/movies/")) {
      console.info("tmdb_client_request_complete", {
        path,
        status: response.status,
        durationMs: Math.round(performance.now() - startedAt),
        cache: response.headers.get("X-Flim-Cache"),
        catalog: response.headers.get("X-Flim-Catalog"),
      });
    }
    return payload;
  } catch (error) {
    console.warn("tmdb_client_parse_failed", {
      path,
      durationMs: Math.round(performance.now() - startedAt),
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
  refreshMode?: "cache-first" | "source";
  timeoutMs?: number;
}

function detailPath(tmdbId: number, mediaType: MediaType, options: DetailRequestOptions = {}) {
  const params = new URLSearchParams({ type: mediaType });
  if (options.refreshMode) params.set("refreshMode", options.refreshMode);
  params.set("_ts", String(Date.now()));
  return `/api/movies/${tmdbId}?${params.toString()}`;
}

export async function getMovieDetails(tmdbId: number, options: DetailRequestOptions = {}): Promise<MovieDetails> {
  if (!Number.isFinite(tmdbId)) {
    throw new Error("A valid movie ID is required.");
  }

  return apiRequest<MovieDetails>(detailPath(tmdbId, "movie", options), {
    cache: "no-store" as RequestCache,
    timeoutMs: options.timeoutMs ?? 45000,
  });
}

export async function getTvDetails(tmdbId: number, options: DetailRequestOptions = {}): Promise<MovieDetails> {
  if (!Number.isFinite(tmdbId)) {
    throw new Error("A valid TV show ID is required.");
  }

  return apiRequest<MovieDetails>(detailPath(tmdbId, "tv", options), {
    cache: "no-store" as RequestCache,
    timeoutMs: options.timeoutMs ?? 45000,
  });
}
