import { db, ensureFollowTitleTables, getCurrentUser, readBody, sendJson } from "../_db.js";
import { ensureMediaCatalogTables, getCatalogMediaItem } from "../_mediaCatalog.js";
import { checkReleaseIntelligenceForMediaItem, mapReleaseEvent, readReleaseTracking, snapshotFromBody, snapshotFromMedia, snapshotFromTracking } from "../_releaseCheck.js";
import type { ReleaseMediaType } from "../_releaseIntelligence.js";

function normalizeMediaType(value: unknown): ReleaseMediaType {
  return value === "tv" ? "tv" : "movie";
}

export default async function handler(request: any, response: any) {
  try {
    const sql = db();
    await ensureMediaCatalogTables(sql);
    await ensureFollowTitleTables(sql);
    const user = await getCurrentUser(sql, request);

    if (!user) return sendJson(response, 401, { error: "Sign in to use release intelligence." });

    if (request.method === "GET") {
      const rows = await sql`
        select re.*
        from release_events re
        inner join followed_titles ft on ft.media_item_id = re.media_item_id
        where ft.user_id = ${user.id}
        order by re.created_at desc
        limit 50
      `;
      return sendJson(response, 200, { events: rows.map(mapReleaseEvent) });
    }

    if (request.method !== "POST") return sendJson(response, 405, { error: "Method not allowed." });

    const body = await readBody(request);
    const mediaType = normalizeMediaType(body.mediaType);
    const tmdbId = Number(body.tmdbId);
    if (!Number.isFinite(tmdbId) || tmdbId <= 0) {
      return sendJson(response, 400, { error: "Choose a valid title to check." });
    }

    const mediaItem = await getCatalogMediaItem(sql, tmdbId, mediaType);
    if (!mediaItem) return sendJson(response, 404, { error: "Title is not in the Flim media catalog yet." });

    const follows = await sql`
      select id
      from followed_titles
      where user_id = ${user.id}
        and media_item_id = ${mediaItem.id}
      limit 1
    `;
    if (!follows[0]) return sendJson(response, 403, { error: "Follow this title before checking it." });

    const oldTracking = await readReleaseTracking(sql, mediaItem.id);
    const fallbackSnapshot = oldTracking ? snapshotFromTracking(oldTracking) : await snapshotFromMedia(sql, mediaItem);
    const newSnapshot = snapshotFromBody(body, fallbackSnapshot || {});
    const result = await checkReleaseIntelligenceForMediaItem(sql, mediaItem, { snapshot: newSnapshot });

    return sendJson(response, 200, {
      ok: true,
      generatedCount: result.generatedCount,
      notificationCount: result.notificationCount,
      detectedCount: result.detectedCount,
      duplicateCount: result.duplicateCount,
      events: result.events,
      state: result.state,
    });
  } catch (error) {
    console.error("release_intelligence_failed", error instanceof Error ? error.message : "Release intelligence failed.");
    return sendJson(response, 500, { error: "Unable to check release intelligence. Please try again." });
  }
}
