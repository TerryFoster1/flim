import { sendJson } from "../_db.js";
import { db } from "../_db.js";
import { getCatalogMediaItem, type CatalogMediaType } from "../_mediaCatalog.js";
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

async function getCatalogTitle(mediaType: ProviderMediaType, tmdbId: number) {
  const sql = db();
  const item = await getCatalogMediaItem(sql, tmdbId, mediaType as CatalogMediaType);
  return item?.title || "";
}

async function markCatalogProviderChecked(mediaType: ProviderMediaType, tmdbId: number) {
  const sql = db();
  await sql`
    update media_items
    set provider_last_checked = now(), updated_at = now()
    where media_type = ${mediaType}
      and tmdb_id = ${tmdbId}
  `;
}

export default async function handler(request: any, response: any) {
  if (request.method !== "GET") return sendJson(response, 405, { error: "Method not allowed." });

  try {
    const mediaType = normalizeMediaType(firstQueryValue(request.query.mediaType));
    const tmdbId = Number(firstQueryValue(request.query.tmdbId));
    const clientTitle = firstQueryValue(request.query.title).trim();
    const region = normalizeRegion(firstQueryValue(request.query.region));

    if (!Number.isFinite(tmdbId)) {
      return sendJson(response, 400, { error: "A valid title ID is required." });
    }

    const catalogTitle = await getCatalogTitle(mediaType, tmdbId);
    const title = catalogTitle || clientTitle;
    const cachedLinks = await getCachedProviderAvailability(mediaType, tmdbId, region);
    if (cachedLinks.length > 0) {
      response.setHeader("X-Flim-Provider-Cache", "HIT");
      await markCatalogProviderChecked(mediaType, tmdbId).catch(() => undefined);
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
      await markCatalogProviderChecked(mediaType, tmdbId).catch(() => undefined);
      return sendJson(response, 200, {
        mediaType,
        tmdbId,
        region,
        availabilityKnown: false,
        sourceConfigured: hasProviderAvailabilitySource(),
        links: [],
        notes: "Streaming availability coming soon.",
      });
    }

    if (hasProviderAvailabilitySource() && title) {
      const freshLinks = await fetchAndCacheProviderAvailability(mediaType, tmdbId, region, title);
      response.setHeader("X-Flim-Provider-Cache", "MISS");
      await markCatalogProviderChecked(mediaType, tmdbId).catch(() => undefined);
      const links = freshLinks || [];
      return sendJson(response, 200, {
        mediaType,
        tmdbId,
        region,
        availabilityKnown: links.length > 0,
        sourceConfigured: true,
        links,
        notes: links.length
          ? "Confirmed provider availability for this region."
          : "Streaming availability coming soon.",
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
