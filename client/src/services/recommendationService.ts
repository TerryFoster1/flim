import type { CuratorDiscoveryProfile, Playlist, PlaylistMovie } from "../types";

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

export interface RecommendedPlaylist extends Playlist {
  recommendationReason?: string;
  sourceType?: string;
  score?: number;
}

export interface RecommendedCurator extends CuratorDiscoveryProfile {
  recommendationReason?: string;
  sourceType?: string;
}

export interface RecommendationResponse {
  recommendations: PlaylistMovie[];
  playlistRecommendations?: RecommendedPlaylist[];
  curatorRecommendations?: RecommendedCurator[];
  architecture?: {
    primary: string[];
    future: string[];
    supporting: string[];
  };
  limits?: {
    playlists: number;
    curators: number;
    titles: number;
  };
}

export function getRecommendations(options: RecommendationRequestOptions = {}) {
  const params = new URLSearchParams();
  if (options.mediaType && Number.isFinite(options.tmdbId)) {
    params.set("mediaType", options.mediaType);
    params.set("tmdbId", String(options.tmdbId));
  }
  const query = params.toString();
  return recommendationRequest<RecommendationResponse>(`/api/recommendations${query ? `?${query}` : ""}`);
}
