import { upsertMediaItem } from "./_mediaCatalog.js";
import { ensureTmdbCacheTables, fetchTmdbMovieDetails, hasServerTmdbCredential } from "./_tmdb.js";
import { buildProviderHash, detectReleaseEvents, normalizeReleaseSnapshot, type ReleaseMediaType, type ReleaseSnapshot } from "./_releaseIntelligence.js";
import { fanoutReleaseEvents } from "./_releaseEventFanout.js";

const MOVIE_CACHE_DAYS = 30;

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

export function snapshotFromTracking(row: any) {
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

export async function snapshotFromMedia(sql: any, mediaItem: any) {
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

export function snapshotFromBody(body: any, fallback: ReleaseSnapshot) {
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

export async function readReleaseTracking(sql: any, mediaItemId: string) {
  const rows = await sql`
    select *
    from release_tracking
    where media_item_id = ${mediaItemId}
    limit 1
  `;
  return rows[0] || null;
}

async function writeTracking(sql: any, mediaItem: any, snapshot: any, changeHash: string, status = "ok") {
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
      last_release_check_status,
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
      ${status},
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
      last_release_check_status = excluded.last_release_check_status,
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

async function refreshMediaItemFromTmdb(sql: any, mediaItem: any) {
  if (!hasServerTmdbCredential()) return { mediaItem, refreshed: false, refreshStatus: "tmdb_unconfigured" };

  const mediaType = normalizeMediaType(mediaItem.media_type);
  const tmdbId = Number(mediaItem.tmdb_id);
  const details = await fetchTmdbMovieDetails(tmdbId, mediaType);
  const refreshed = await upsertMediaItem(sql, details);
  await ensureTmdbCacheTables(sql);
  await sql`
    insert into tmdb_movie_cache (tmdb_id, media_type, response_json, expires_at)
    values (${tmdbId}, ${mediaType}, ${JSON.stringify(details)}::jsonb, now() + (${MOVIE_CACHE_DAYS} * interval '1 day'))
    on conflict (media_type, tmdb_id)
    do update set
      response_json = excluded.response_json,
      created_at = now(),
      expires_at = excluded.expires_at
  `;

  return { mediaItem: refreshed || mediaItem, refreshed: Boolean(refreshed), refreshStatus: "tmdb_refreshed" };
}

export function mapReleaseEvent(row: any) {
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

export async function checkReleaseIntelligenceForMediaItem(sql: any, mediaItem: any, options: {
  snapshot?: ReturnType<typeof normalizeReleaseSnapshot>;
  refreshFromSource?: boolean;
} = {}) {
  const oldTracking = await readReleaseTracking(sql, mediaItem.id);
  const fallbackSnapshot = oldTracking ? snapshotFromTracking(oldTracking) : await snapshotFromMedia(sql, mediaItem);
  let currentMediaItem = mediaItem;
  let refreshStatus = "catalog";

  if (options.refreshFromSource) {
    try {
      const refreshed = await refreshMediaItemFromTmdb(sql, mediaItem);
      currentMediaItem = refreshed.mediaItem;
      refreshStatus = refreshed.refreshStatus;
    } catch (error) {
      refreshStatus = "refresh_failed";
      console.error("release_check_refresh_failed", mediaItem.media_type, mediaItem.tmdb_id, error instanceof Error ? error.message : "Refresh failed.");
    }
  }

  const newSnapshot = options.snapshot || await snapshotFromMedia(sql, currentMediaItem);
  const result = detectReleaseEvents({
    mediaItemId: currentMediaItem.id,
    mediaType: normalizeMediaType(currentMediaItem.media_type),
    title: currentMediaItem.title,
    oldSnapshot: fallbackSnapshot,
    newSnapshot,
  });
  const insertedEvents = await insertEvents(sql, currentMediaItem, result.events);
  const fanout = await fanoutReleaseEvents(sql, insertedEvents);
  await writeTracking(sql, currentMediaItem, result.newState, result.changeHash, refreshStatus);

  return {
    mediaItem: currentMediaItem,
    detectedCount: result.events.length,
    generatedCount: insertedEvents.length,
    duplicateCount: Math.max(0, result.events.length - insertedEvents.length),
    notificationCount: fanout.notificationCount,
    events: insertedEvents.map(mapReleaseEvent),
    state: result.newState,
    refreshStatus,
  };
}
