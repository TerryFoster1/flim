import type { CollectionChallenge, MediaCollection, MediaCollectionFeed } from "../types";

async function apiRequest<T>(path: string): Promise<T> {
  const response = await fetch(path, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error || "Collection request failed.");
  }

  return response.json() as Promise<T>;
}

export function getCollections() {
  return apiRequest<MediaCollectionFeed>("/api/collections");
}

export function getCollection(collectionId: string) {
  return apiRequest<MediaCollection>(`/api/collections/${encodeURIComponent(collectionId)}`);
}

export function getCollectionChallenges() {
  return apiRequest<{ challenges: CollectionChallenge[]; sections: Record<string, CollectionChallenge[]> }>("/api/challenges");
}
