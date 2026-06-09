import type { ContinueWatchingItem, EpisodeProgressStatus, TvShowProgress } from "../types";

async function tvProgressRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "TV progress request failed.");
  return payload as T;
}

export function getTvProgress(tmdbShowId: number) {
  return tvProgressRequest<TvShowProgress>(`/api/tv-progress/${tmdbShowId}`);
}

export function updateEpisodeProgress(tmdbShowId: number, seasonNumber: number, episodeNumber: number, status: EpisodeProgressStatus) {
  return tvProgressRequest<TvShowProgress>(`/api/tv-progress/${tmdbShowId}`, {
    method: "PATCH",
    body: JSON.stringify({ action: "episode", seasonNumber, episodeNumber, status }),
  });
}

export function markSeasonProgress(tmdbShowId: number, seasonNumber: number, watched: boolean) {
  return tvProgressRequest<TvShowProgress>(`/api/tv-progress/${tmdbShowId}`, {
    method: "PATCH",
    body: JSON.stringify({ action: "season", seasonNumber, watched }),
  });
}

export function markShowProgress(tmdbShowId: number, watched: boolean) {
  return tvProgressRequest<TvShowProgress>(`/api/tv-progress/${tmdbShowId}`, {
    method: "PATCH",
    body: JSON.stringify({ action: "show", watched }),
  });
}

export function startShowProgress(tmdbShowId: number) {
  return tvProgressRequest<TvShowProgress>(`/api/tv-progress/${tmdbShowId}`, {
    method: "PATCH",
    body: JSON.stringify({ action: "start" }),
  });
}

export function getContinueWatching() {
  return tvProgressRequest<{ items: ContinueWatchingItem[] }>("/api/continue-watching");
}
