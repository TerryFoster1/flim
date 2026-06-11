import type { CuratorDiscoveryFeed } from "../types";

export async function getCuratorDiscovery(query = "") {
  const params = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : "";
  const response = await fetch(`/api/curators${params}`, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "Curator discovery failed.");
  }

  return response.json() as Promise<CuratorDiscoveryFeed>;
}
