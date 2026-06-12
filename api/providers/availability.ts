import { sendJson } from "../_db.js";
import { db } from "../_db.js";
import { ensureTicketAffiliateTables } from "../_commerceFoundation.js";
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

async function getActiveTicketLinks(mediaType: ProviderMediaType, tmdbId: number, region: string) {
  const sql = db();
  await ensureTicketAffiliateTables(sql);
  const rows = await sql`
    select
      tal.id,
      coalesce(tp.provider_name, tta.provider_name, 'Tickets') as provider_name,
      tal.region,
      tal.city,
      tal.theater_chain,
      tta.available_from,
      tta.showtime_date
    from ticket_affiliate_links tal
    left join title_ticket_availability tta on tta.id = tal.ticket_availability_id
    left join ticket_providers tp on tp.id = tal.provider_id
    inner join media_items mi on mi.id = tal.media_item_id
    where mi.media_type = ${mediaType}
      and mi.tmdb_id = ${tmdbId}
      and tal.region = ${region}
      and tal.active = true
      and nullif(tal.destination_url, '') is not null
      and coalesce(tta.status, 'available') not in ('inactive', 'unavailable')
    order by
      tta.showtime_date asc nulls last,
      tal.updated_at desc
    limit 6
  `;

  return rows.map((row: any) => ({
    id: row.id,
    providerName: row.provider_name,
    region: row.region || region,
    city: row.city || undefined,
    theaterChain: row.theater_chain || undefined,
    url: `/api/ticket-link/${row.id}`,
    availableFrom: row.available_from ? new Date(row.available_from).toISOString() : undefined,
    showtimeDate: row.showtime_date ? new Date(row.showtime_date).toISOString() : undefined,
    label: row.provider_name ? `Find tickets on ${row.provider_name}` : "Find tickets",
  }));
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
    const ticketLinks = await getActiveTicketLinks(mediaType, tmdbId, region).catch(() => []);
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
        ticketLinks,
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
        ticketLinks,
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
        ticketLinks,
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
      ticketLinks,
      notes: "Streaming availability coming soon.",
    });
  } catch (error) {
    return sendJson(response, 500, { error: error instanceof Error ? error.message : "Provider availability request failed." });
  }
}
