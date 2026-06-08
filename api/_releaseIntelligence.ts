import { createHash } from "node:crypto";

export type ReleaseMediaType = "movie" | "tv";

export interface ReleaseSnapshot {
  releaseDate?: string | null;
  status?: string | null;
  trailerCount?: number | null;
  providerHash?: string | null;
  seasonCount?: number | null;
  episodeCount?: number | null;
  seasonData?: Record<string, unknown> | null;
}

interface ReleaseEventDraft {
  eventType: string;
  title: string;
  body: string;
  changeHash: string;
  oldState: Record<string, unknown>;
  newState: Record<string, unknown>;
}

function dateOnly(value: unknown) {
  if (!value) return null;
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString().slice(0, 10);
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const parsed = new Date(text);
  if (Number.isFinite(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return text.slice(0, 10);
}

function numberOrZero(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function numberOrNull(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function createHashValue(value: unknown) {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

export function normalizeReleaseSnapshot(input: ReleaseSnapshot = {}) {
  const releaseDate = dateOnly(input.releaseDate);
  return {
    releaseDate,
    status: String(input.status || "").trim() || null,
    trailerCount: numberOrZero(input.trailerCount),
    providerHash: String(input.providerHash || "").trim() || null,
    seasonCount: numberOrNull(input.seasonCount),
    episodeCount: numberOrNull(input.episodeCount),
    seasonData: normalizeObject(input.seasonData),
    upcoming: releaseDate ? new Date(`${releaseDate}T00:00:00Z`).getTime() >= Date.now() - 24 * 60 * 60 * 1000 : false,
  };
}

function eventHash(mediaItemId: string, eventType: string, oldValue: unknown, newValue: unknown) {
  return createHashValue({ mediaItemId, eventType, oldValue, newValue });
}

function makeEvent(
  mediaItemId: string,
  eventType: string,
  title: string,
  body: string,
  oldState: Record<string, unknown>,
  newState: Record<string, unknown>,
  oldValue: unknown,
  newValue: unknown,
): ReleaseEventDraft {
  return {
    eventType,
    title,
    body,
    changeHash: eventHash(mediaItemId, eventType, oldValue, newValue),
    oldState,
    newState,
  };
}

export function detectReleaseEvents(input: {
  mediaItemId: string;
  mediaType: ReleaseMediaType;
  title: string;
  oldSnapshot?: ReleaseSnapshot | null;
  newSnapshot: ReleaseSnapshot;
}) {
  const oldState = normalizeReleaseSnapshot(input.oldSnapshot || {});
  const newState = normalizeReleaseSnapshot(input.newSnapshot);
  const events: ReleaseEventDraft[] = [];

  if (oldState.releaseDate && newState.releaseDate && oldState.releaseDate !== newState.releaseDate) {
    events.push(makeEvent(
      input.mediaItemId,
      "release_date_changed",
      "Release date changed",
      `${input.title} moved from ${oldState.releaseDate} to ${newState.releaseDate}.`,
      oldState,
      newState,
      oldState.releaseDate,
      newState.releaseDate,
    ));
  }

  if (oldState.status && newState.status && oldState.status !== newState.status) {
    events.push(makeEvent(
      input.mediaItemId,
      "title_status_changed",
      "Title status changed",
      `${input.title} changed status from ${oldState.status} to ${newState.status}.`,
      oldState,
      newState,
      oldState.status,
      newState.status,
    ));
  }

  if (input.mediaType === "movie" && oldState.upcoming && !newState.upcoming && newState.releaseDate) {
    events.push(makeEvent(
      input.mediaItemId,
      "movie_released",
      "Movie released",
      `${input.title} has reached its release date.`,
      oldState,
      newState,
      oldState.releaseDate,
      newState.releaseDate,
    ));
  }

  if (newState.trailerCount > oldState.trailerCount) {
    events.push(makeEvent(
      input.mediaItemId,
      "trailer_released",
      "Trailer released",
      `${input.title} has a new trailer.`,
      oldState,
      newState,
      oldState.trailerCount,
      newState.trailerCount,
    ));
  }

  if (oldState.providerHash && newState.providerHash && oldState.providerHash !== newState.providerHash) {
    events.push(makeEvent(
      input.mediaItemId,
      "streaming_available",
      "Streaming availability changed",
      `${input.title} has updated streaming availability.`,
      oldState,
      newState,
      oldState.providerHash,
      newState.providerHash,
    ));
  }

  if (input.mediaType === "tv") {
    const oldSeasons = oldState.seasonCount || 0;
    const newSeasons = newState.seasonCount || 0;
    const oldEpisodes = oldState.episodeCount || 0;
    const newEpisodes = newState.episodeCount || 0;

    if (newSeasons > oldSeasons) {
      events.push(makeEvent(
        input.mediaItemId,
        "season_announced",
        "Season announced",
        `${input.title} has a new season listed.`,
        oldState,
        newState,
        oldSeasons,
        newSeasons,
      ));
    }

    if (oldState.releaseDate && newState.releaseDate && oldState.releaseDate !== newState.releaseDate) {
      events.push(makeEvent(
        input.mediaItemId,
        "season_release_changed",
        "Season release changed",
        `${input.title} has an updated season release date.`,
        oldState,
        newState,
        oldState.releaseDate,
        newState.releaseDate,
      ));
    }

    if (oldState.upcoming && !newState.upcoming && newState.releaseDate) {
      events.push(makeEvent(
        input.mediaItemId,
        "season_released",
        "Season released",
        `${input.title} has reached its season release date.`,
        oldState,
        newState,
        oldState.releaseDate,
        newState.releaseDate,
      ));
    }

    if (newEpisodes > oldEpisodes) {
      events.push(makeEvent(
        input.mediaItemId,
        "episode_released",
        "Episode released",
        `${input.title} has new episodes listed.`,
        oldState,
        newState,
        oldEpisodes,
        newEpisodes,
      ));
    }

    if (createHashValue(oldState.seasonData) !== createHashValue(newState.seasonData) && Object.keys(oldState.seasonData).length > 0) {
      events.push(makeEvent(
        input.mediaItemId,
        "season_data_changed",
        "Season details changed",
        `${input.title} has updated season details.`,
        oldState,
        newState,
        oldState.seasonData,
        newState.seasonData,
      ));
    }
  }

  return {
    oldState,
    newState,
    changeHash: createHashValue(newState),
    events,
  };
}

export async function buildProviderHash(sql: any, mediaType: ReleaseMediaType, tmdbId: number) {
  const rows = await sql`
    select provider_id, availability_type, coalesce(deep_link, '') as deep_link
    from title_availability
    where media_type = ${mediaType}
      and tmdb_id = ${tmdbId}
      and expires_at > now()
    order by provider_id, availability_type, deep_link
  `.catch(() => []);

  if (!rows.length) return null;
  return createHashValue(rows);
}
