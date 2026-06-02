import { sendJson } from "../_db.js";
import {
  fetchAndCacheProviderAvailability,
  getCachedProviderAvailability,
  getProviderAvailabilityCacheStatus,
  hasProviderAvailabilitySource,
  type ProviderMediaType,
} from "../_providers.js";

function firstQueryValue(value: unknown) {
  return Array.isArray(value) ? String(value[0] || "") : String(value || "");
}

function normalizeMediaType(value: string): ProviderMediaType {
  return value === "tv" ? "tv" : "movie";
}

function normalizeRegion(value: string) {
  return value.trim().toUpperCase() || "CA";
}

export default async function handler(request: any, response: any) {
  if (request.method !== "GET") return sendJson(response, 405, { error: "Method not allowed." });

  try {
    const mediaType = normalizeMediaType(firstQueryValue(request.query.mediaType));
    const tmdbId = Number(firstQueryValue(request.query.tmdbId));
    const title = firstQueryValue(request.query.title).trim();
    const region = normalizeRegion(firstQueryValue(request.query.region));

    if (!Number.isFinite(tmdbId)) {
      return sendJson(response, 400, { error: "A valid title ID is required." });
    }

    const cachedLinks = await getCachedProviderAvailability(mediaType, tmdbId, region);
    if (cachedLinks.length > 0) {
      response.setHeader("X-Flim-Provider-Cache", "HIT");
      return sendJson(response, 200, {
        mediaType,
        tmdbId,
        region,
        availabilityKnown: true,
        sourceConfigured: hasProviderAvailabilitySource(),
        links: cachedLinks,
        notes: "Confirmed provider availability for this region.",
      });
    }

    const cacheStatus = await getProviderAvailabilityCacheStatus(mediaType, tmdbId, region);
    if (cacheStatus) {
      response.setHeader("X-Flim-Provider-Cache", "HIT");
      return sendJson(response, 200, {
        mediaType,
        tmdbId,
        region,
        availabilityKnown: true,
        sourceConfigured: hasProviderAvailabilitySource(),
        links: [],
        notes: "No confirmed streaming availability found for this region yet.",
      });
    }

    if (hasProviderAvailabilitySource() && title) {
      const freshLinks = await fetchAndCacheProviderAvailability(mediaType, tmdbId, region, title);
      response.setHeader("X-Flim-Provider-Cache", "MISS");
      return sendJson(response, 200, {
        mediaType,
        tmdbId,
        region,
        availabilityKnown: Boolean(freshLinks),
        sourceConfigured: true,
        links: freshLinks || [],
        notes: freshLinks?.length
          ? "Confirmed provider availability for this region."
          : "No confirmed streaming availability found for this region yet.",
      });
    }

    response.setHeader("X-Flim-Provider-Cache", "MISS");
    return sendJson(response, 200, {
      mediaType,
      tmdbId,
      region,
      availabilityKnown: false,
      sourceConfigured: hasProviderAvailabilitySource(),
      links: [],
      notes: "Streaming availability coming soon.",
    });
  } catch (error) {
    return sendJson(response, 500, { error: error instanceof Error ? error.message : "Provider availability request failed." });
  }
}
