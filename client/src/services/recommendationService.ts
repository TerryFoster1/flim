import type { PlaylistMovie } from "../types";

async function recommendationRequest<T>(path: string): Promise<T> {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Recommendation request failed.");
  return payload as T;
}

interface RecommendationRequestOptions {
  mediaType?: "movie" | "tv";
  tmdbId?: number;
}

export function getRecommendations(options: RecommendationRequestOptions = {}) {
  const params = new URLSearchParams();
  if (options.mediaType && Number.isFinite(options.tmdbId)) {
    params.set("mediaType", options.mediaType);
    params.set("tmdbId", String(options.tmdbId));
  }
  const query = params.toString();
  return recommendationRequest<{ recommendations: PlaylistMovie[] }>(`/api/recommendations${query ? `?${query}` : ""}`);
}
