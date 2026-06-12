import { db, getCurrentUser, sendJson } from "../../_db.js";
import { ensureProviderAvailabilityTables } from "../../_providers.js";

type ProviderMediaType = "movie" | "tv";

const fallbackTemplates: Record<string, string> = {
  apple: "https://tv.apple.com/search?term={title}",
  crave: "https://www.crave.ca/en/search?query={title}",
  disney: "https://www.disneyplus.com/search?q={title}",
  google_tv: "https://tv.google.com/search/{title}",
  hulu: "https://www.hulu.com/search?q={title}",
  max: "https://www.max.com/search?q={title}",
  netflix: "https://www.netflix.com/search?q={title}",
  paramount: "https://www.paramountplus.com/search/?query={title}",
  plex: "https://watch.plex.tv/search?q={title}",
  prime: "https://www.primevideo.com/search/ref=atv_nb_sr?phrase={title}",
  tubi: "https://tubitv.com/search/{title}",
  youtube: "https://www.youtube.com/results?search_query={title}+movie",
};

function firstQueryValue(value: unknown) {
  return Array.isArray(value) ? String(value[0] || "") : String(value || "");
}

function normalizeMediaType(value: string): ProviderMediaType {
  return value === "tv" ? "tv" : "movie";
}

function normalizeRegion(value: string) {
  return value.trim().toUpperCase() || "CA";
}

function normalizeLinkType(value: string) {
  return value === "exact" ? "exact" : "search_fallback";
}

function buildSearchFallback(providerId: string, title: string) {
  const template = fallbackTemplates[providerId];
  const cleanTitle = title.trim();
  if (!template || !cleanTitle) return "";
  return template.replace("{title}", encodeURIComponent(cleanTitle));
}

function isSafeDestination(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

export default async function handler(request: any, response: any) {
  if (request.method !== "GET") return sendJson(response, 405, { error: "Method not allowed." });

  const providerId = String(request.query.providerId || "").trim();
  const tmdbId = Number(request.query.tmdbId);
  const mediaType = normalizeMediaType(firstQueryValue(request.query.mediaType));
  const region = normalizeRegion(firstQueryValue(request.query.region));
  const linkType = normalizeLinkType(firstQueryValue(request.query.linkType));
  const title = firstQueryValue(request.query.title);

  if (!providerId || !Number.isFinite(tmdbId)) {
    return sendJson(response, 400, { error: "A valid provider and title ID are required." });
  }

  try {
    const sql = db();
    await ensureProviderAvailabilityTables(sql);
    const user = await getCurrentUser(sql, request).catch(() => null);

    const rows = await sql`
      select coalesce(deep_link, search_fallback_url) as destination_url
      from provider_links
      where provider_id = ${providerId}
        and tmdb_id = ${tmdbId}
        and media_type = ${mediaType}
        and region = ${region}
        and link_type = ${linkType}
      order by created_at desc
      limit 1
    `;
    const destination = String(rows[0]?.destination_url || buildSearchFallback(providerId, title));

    if (!isSafeDestination(destination)) {
      return sendJson(response, 404, { error: "Provider destination is not available yet." });
    }

    const partnerRows = await sql`
      select id, affiliate_url
      from provider_partner_links
      where provider_id = ${providerId}
        and region = ${region}
        and active = true
        and nullif(affiliate_url, '') is not null
        and (link_type is null or link_type = ${linkType})
        and (destination_url = ${destination} or destination_url = '*')
      order by
        case when destination_url = ${destination} then 0 else 1 end,
        updated_at desc
      limit 1
    `;
    const affiliateUrl = String(partnerRows[0]?.affiliate_url || "");
    const hasAffiliateDestination = isSafeDestination(affiliateUrl);
    const finalDestination = hasAffiliateDestination ? affiliateUrl : destination;

    await sql`
      insert into provider_clicks (
        user_id,
        provider_id,
        provider_partner_link_id,
        media_type,
        tmdb_id,
        region,
        link_type,
        destination_url,
        affiliate_url,
        monetization_source,
        conversion_opportunity,
        referrer,
        user_agent
      )
      values (
        ${user?.id || null},
        ${providerId},
        ${partnerRows[0]?.id || null},
        ${mediaType},
        ${tmdbId},
        ${region},
        ${linkType},
        ${finalDestination},
        ${hasAffiliateDestination ? affiliateUrl : null},
        ${hasAffiliateDestination ? "affiliate" : "provider_link"},
        ${hasAffiliateDestination},
        ${String(request.headers.referer || request.headers.referrer || "").slice(0, 512) || null},
        ${String(request.headers["user-agent"] || "").slice(0, 512) || null}
      )
    `;

    response.statusCode = 302;
    response.setHeader("Location", finalDestination);
    response.setHeader("Cache-Control", "no-store");
    response.end();
  } catch (error) {
    return sendJson(response, 500, { error: error instanceof Error ? error.message : "Provider link failed." });
  }
}
