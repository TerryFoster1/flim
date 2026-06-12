import { ensureTicketAffiliateTables } from "../_commerceFoundation.js";
import { db, getCurrentUser, sendJson } from "../_db.js";

function firstQueryValue(value: unknown) {
  return Array.isArray(value) ? String(value[0] || "") : String(value || "");
}

function ticketLinkId(request: any) {
  const pathname = new URL(request.url || "", "https://www.flim.ca").pathname;
  const fromPath = pathname.split("/api/ticket-link/").pop()?.split("?")[0];
  if (fromPath && fromPath !== pathname) return decodeURIComponent(fromPath);
  return firstQueryValue(request.query.ticketLinkId);
}

function isSafeDestination(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export default async function handler(request: any, response: any) {
  if (request.method !== "GET") return sendJson(response, 405, { error: "Method not allowed." });

  const linkId = ticketLinkId(request).trim();
  if (!linkId) return sendJson(response, 400, { error: "A valid ticket link is required." });
  if (!isUuid(linkId)) return sendJson(response, 400, { error: "A valid ticket link is required." });

  try {
    const sql = db();
    await ensureTicketAffiliateTables(sql);
    const user = await getCurrentUser(sql, request).catch(() => null);
    const rows = await sql`
      select
        tal.id,
        tal.media_item_id,
        tal.provider_id,
        tal.destination_url,
        tal.affiliate_url,
        tal.region,
        tal.city,
        tal.theater_chain,
        tp.provider_name
      from ticket_affiliate_links tal
      left join ticket_providers tp on tp.id = tal.provider_id
      where tal.id = ${linkId}
        and tal.active = true
      limit 1
    `;

    const link = rows[0];
    const affiliateUrl = String(link?.affiliate_url || "");
    const destinationUrl = String(link?.destination_url || "");
    const hasAffiliateDestination = isSafeDestination(affiliateUrl);
    const finalDestination = hasAffiliateDestination ? affiliateUrl : destinationUrl;

    if (!link || !isSafeDestination(finalDestination)) {
      return sendJson(response, 404, { error: "Ticket destination is not available yet." });
    }

    await sql`
      insert into ticket_clicks (
        media_item_id,
        provider_id,
        ticket_affiliate_link_id,
        user_id,
        region,
        city,
        theater_chain,
        destination_url,
        affiliate_url,
        monetization_source,
        conversion_opportunity,
        referrer,
        user_agent
      )
      values (
        ${link.media_item_id},
        ${link.provider_id || null},
        ${link.id},
        ${user?.id || null},
        ${link.region || "CA"},
        ${link.city || null},
        ${link.theater_chain || null},
        ${finalDestination},
        ${hasAffiliateDestination ? affiliateUrl : null},
        ${hasAffiliateDestination ? "affiliate" : "ticket_link"},
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
    return sendJson(response, 500, { error: error instanceof Error ? error.message : "Ticket link failed." });
  }
}
