import type { DiscoverySearchResults } from "../types";

export async function searchDiscovery(query: string) {
  const cleanQuery = query.trim();
  if (!cleanQuery) {
    return {
      query: "",
      titles: [],
      playlists: [],
      profiles: [],
      collections: [],
      hubs: [],
      actors: [],
      titleSource: "empty",
    } satisfies DiscoverySearchResults;
  }

  const response = await fetch(`/api/discovery/search?q=${encodeURIComponent(cleanQuery)}`, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "Discovery search failed.");
  }

  const payload = await response.json() as DiscoverySearchResults;
  return {
    ...payload,
    collections: Array.isArray(payload.collections) ? payload.collections : [],
    hubs: Array.isArray(payload.hubs) ? payload.hubs : [],
    actors: Array.isArray(payload.actors) ? payload.actors : [],
  };
}
