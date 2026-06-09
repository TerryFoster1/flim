import type { MediaType, UpcomingReleaseFeed } from "../types";

export interface UpcomingReleaseFilters {
  type?: MediaType | "both";
  window?: "month" | "quarter" | "year" | "all";
}

export async function getUpcomingReleases(filters: UpcomingReleaseFilters = {}) {
  const params = new URLSearchParams();
  if (filters.type) params.set("type", filters.type);
  if (filters.window) params.set("window", filters.window);
  const query = params.toString();
  const response = await fetch(`/api/upcoming${query ? `?${query}` : ""}`, {
    credentials: "same-origin",
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "Unable to load upcoming releases.");
  }
  return response.json() as Promise<UpcomingReleaseFeed>;
}
