import type { DiscoverySearchResults } from "../types";

interface DiscoverySearchOptions {
  availableOnMyServices?: boolean;
  providers?: string[];
  region?: string;
}

export async function searchDiscovery(query: string, options: DiscoverySearchOptions = {}) {
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

  const params = new URLSearchParams({ q: cleanQuery });
  if (options.availableOnMyServices) params.set("availableOnMyServices", "true");
  if (options.region) params.set("region", options.region);
  if (options.providers?.length) params.set("providers", options.providers.join(","));

  const response = await fetch(`/api/discovery/search?${params.toString()}`, {
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
