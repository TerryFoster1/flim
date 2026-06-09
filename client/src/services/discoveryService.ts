import type { DiscoverySearchResults } from "../types";

export async function searchDiscovery(query: string) {
  const cleanQuery = query.trim();
  if (!cleanQuery) {
    return {
      query: "",
      titles: [],
      playlists: [],
      profiles: [],
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

  return response.json() as Promise<DiscoverySearchResults>;
}
