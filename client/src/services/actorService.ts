import type { ActorDetails, ActorSummary } from "../types";

async function apiRequest<T>(path: string): Promise<T> {
  const response = await fetch(path, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error || "Actor request failed.");
  }

  return response.json() as Promise<T>;
}

export function getActorDetails(actorId: number) {
  if (!Number.isFinite(actorId)) {
    throw new Error("A valid actor ID is required.");
  }

  return apiRequest<ActorDetails>(`/api/actors/${actorId}`);
}

export function searchActors(query: string) {
  const cleanQuery = query.trim();
  if (!cleanQuery) return Promise.resolve([]);

  return apiRequest<ActorSummary[]>(`/api/actors/search?q=${encodeURIComponent(cleanQuery)}`);
}
