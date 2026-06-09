import { db, ensureFollowTitleTables, getCurrentUser, readBody, sendJson } from "../_db.js";
import { ensureMediaCatalogTables, getCatalogMediaItem } from "../_mediaCatalog.js";
import { buildProviderHash, detectReleaseEvents, normalizeReleaseSnapshot, type ReleaseMediaType } from "../_releaseIntelligence.js";
import { fanoutReleaseEvents } from "../_releaseEventFanout.js";

function normalizeMediaType(value: unknown): ReleaseMediaType {
  return value === "tv" ? "tv" : "movie";
}

function numberOrNull(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function payloadObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function snapshotFromTracking(row: any) {
  if (!row) return null;
  return {
    releaseDate: row.release_date,
    status: row.status,
    trailerCount: row.trailer_count,
    providerHash: row.provider_hash,
    seasonCount: row.season_count,
    episodeCount: row.episode_count,
    seasonData: row.season_data,
  };
}

async function snapshotFromMedia(sql: any, mediaItem: any) {
  const payload = payloadObject(mediaItem.source_payload);
  const providerHash = await buildProviderHash(sql, normalizeMediaType(mediaItem.media_type), Number(mediaItem.tmdb_id));
  return normalizeReleaseSnapshot({
    releaseDate: mediaItem.release_date,
    status: mediaItem.status,
    trailerCount: numberOrNull(payload.trailerCount),
    providerHash,
    seasonCount: numberOrNull(payload.seasonCount),
    episodeCount: numberOrNull(payload.episodeCount),
    seasonData: payload,
  });
}

function snapshotFromBody(body: any, fallback: any) {
  const input = payloadObject(body.snapshot);
  return normalizeReleaseSnapshot({
    releaseDate: input.releaseDate ?? body.releaseDate ?? fallback.releaseDate,
    status: input.status ?? body.status ?? fallback.status,
    trailerCount: input.trailerCount ?? body.trailerCount ?? fallback.trailerCount,
    providerHash: input.providerHash ?? body.providerHash ?? fallback.providerHash,
    seasonCount: input.seasonCount ?? body.seasonCount ?? fallback.seasonCount,
    episodeCount: input.episodeCount ?? body.episodeCount ?? fallback.episodeCount,
    seasonData: payloadObject(input.seasonData ?? body.seasonData ?? fallback.seasonData),
  });
}

async function readTracking(sql: any, mediaItemId: string) {
  const rows = await sql`
    select *
    from release_tracking
    where media_item_id = ${mediaItemId}
    limit 1
  `;
  return rows[0] || null;
}

async function writeTracking(sql: any, mediaItem: any, snapshot: any, changeHash: string) {
  await sql`
    insert into release_tracking (
      media_item_id,
      media_type,
      release_date,
      status,
      upcoming,
      trailer_count,
      provider_hash,
      season_count,
      episode_count,
      last_checked_at,
      change_hash,
      season_data,
      cached_at,
      updated_at
    )
    values (
      ${mediaItem.id},
      ${normalizeMediaType(mediaItem.media_type)},
      ${snapshot.releaseDate},
      ${snapshot.status},
      ${snapshot.upcoming},
      ${snapshot.trailerCount},
      ${snapshot.providerHash},
      ${snapshot.seasonCount},
      ${snapshot.episodeCount},
      now(),
      ${changeHash},
      ${JSON.stringify(snapshot.seasonData || {})}::jsonb,
      now(),
      now()
    )
    on conflict (media_item_id)
    do update set
      media_type = excluded.media_type,
      release_date = excluded.release_date,
      status = excluded.status,
      upcoming = excluded.upcoming,
      trailer_count = excluded.trailer_count,
      provider_hash = excluded.provider_hash,
      season_count = excluded.season_count,
      episode_count = excluded.episode_count,
      last_checked_at = now(),
      change_hash = excluded.change_hash,
      season_data = excluded.season_data,
      cached_at = now(),
      updated_at = now()
  `;
}

async function insertEvents(sql: any, mediaItem: any, events: any[]) {
  const inserted = [];
  for (const event of events) {
    const rows = await sql`
      insert into release_events (
        media_item_id,
        media_type,
        tmdb_id,
        event_type,
        old_value,
        new_value,
        old_state,
        new_state,
        title,
        body,
        change_hash,
        source
      )
      values (
        ${mediaItem.id},
        ${normalizeMediaType(mediaItem.media_type)},
        ${Number(mediaItem.tmdb_id)},
        ${event.eventType},
        ${JSON.stringify(event.oldValue)}::jsonb,
        ${JSON.stringify(event.newValue)}::jsonb,
        ${JSON.stringify(event.oldState)}::jsonb,
        ${JSON.stringify(event.newState)}::jsonb,
        ${event.title},
        ${event.body},
        ${event.changeHash},
        'release_intelligence'
      )
      on conflict (media_item_id, event_type, change_hash) do nothing
      returning *
    `;
    if (rows[0]) inserted.push(rows[0]);
  }
  return inserted;
}

function mapEvent(row: any) {
  return {
    id: row.id,
    mediaItemId: row.media_item_id,
    mediaType: row.media_type,
    tmdbId: row.tmdb_id,
    eventType: row.event_type,
    title: row.title,
    body: row.body,
    changeHash: row.change_hash,
    createdAt: row.created_at,
  };
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
      return sendJson(response, 200, { events: rows.map(mapEvent) });
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

    const oldTracking = await readTracking(sql, mediaItem.id);
    const fallbackSnapshot = oldTracking ? snapshotFromTracking(oldTracking) : await snapshotFromMedia(sql, mediaItem);
    const newSnapshot = snapshotFromBody(body, fallbackSnapshot || {});
    const result = detectReleaseEvents({
      mediaItemId: mediaItem.id,
      mediaType,
      title: mediaItem.title,
      oldSnapshot: fallbackSnapshot,
      newSnapshot,
    });
    const insertedEvents = await insertEvents(sql, mediaItem, result.events);
    const fanout = await fanoutReleaseEvents(sql, insertedEvents);
    await writeTracking(sql, mediaItem, result.newState, result.changeHash);

    return sendJson(response, 200, {
      ok: true,
      generatedCount: insertedEvents.length,
      notificationCount: fanout.notificationCount,
      detectedCount: result.events.length,
      duplicateCount: Math.max(0, result.events.length - insertedEvents.length),
      events: insertedEvents.map(mapEvent),
      state: result.newState,
    });
  } catch (error) {
    console.error("release_intelligence_failed", error instanceof Error ? error.message : "Release intelligence failed.");
    return sendJson(response, 500, { error: "Unable to check release intelligence. Please try again." });
  }
}
