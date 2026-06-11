import type { DiscoveryBrowseResult } from "../types";

export async function getDiscoveryHub(kind: DiscoveryBrowseResult["kind"], key: string) {
  const response = await fetch(`/api/discovery/browse?browse=${encodeURIComponent(`${kind}/${key}`)}`, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "Discovery hub failed.");
  }

  const payload = await response.json() as DiscoveryBrowseResult;
  return {
    ...payload,
    titles: Array.isArray(payload.titles) ? payload.titles : [],
    playlists: Array.isArray(payload.playlists) ? payload.playlists : [],
    profiles: Array.isArray(payload.profiles) ? payload.profiles : [],
    collections: Array.isArray(payload.collections) ? payload.collections : [],
    relatedHubs: {
      genres: Array.isArray(payload.relatedHubs?.genres) ? payload.relatedHubs.genres : [],
      decades: Array.isArray(payload.relatedHubs?.decades) ? payload.relatedHubs.decades : [],
      franchises: Array.isArray(payload.relatedHubs?.franchises) ? payload.relatedHubs.franchises : [],
    },
  };
}
