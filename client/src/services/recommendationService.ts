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

export function getRecommendations() {
  return recommendationRequest<{ recommendations: PlaylistMovie[] }>("/api/recommendations");
}
