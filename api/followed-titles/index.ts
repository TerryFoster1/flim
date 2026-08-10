import { db, ensureFollowTitleTables, ensureNotificationsTable, getCurrentUser, readBody, sendJson } from "../_db.js";
import { ensureMediaCatalogTables, upsertMediaItem } from "../_mediaCatalog.js";
import { cleanEnum, cleanInteger, cleanJsonObject, cleanText, cleanUrl, requireRecord, safeApiError } from "../_security.js";

const moviePreferenceKeys = ["theaterRelease", "streamingAvailability"] as const;
const tvPreferenceKeys = ["newSeasonAnnounced", "seasonReleaseDate", "newEpisodeAvailable", "streamingAvailability"] as const;

function normalizeMediaType(value: unknown) {
  return cleanEnum(value, ["movie", "tv"], { field: "mediaType", fallback: "movie" }) as "movie" | "tv";
}

function defaultNotificationSettings(mediaType: "movie" | "tv") {
  if (mediaType === "tv") {
    return {
      newSeasonAnnounced: true,
      seasonReleaseDate: true,
      newEpisodeAvailable: false,
      streamingAvailability: true,
    };
  }

  return {
    theaterRelease: true,
    streamingAvailability: true,
  };
}

function normalizeNotificationSettings(mediaType: "movie" | "tv", value: unknown) {
  const defaults = defaultNotificationSettings(mediaType);
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const keys = mediaType === "tv" ? tvPreferenceKeys : moviePreferenceKeys;

  return keys.reduce<Record<string, boolean>>((settings, key) => {
    settings[key] = typeof input[key] === "boolean" ? Boolean(input[key]) : Boolean(defaults[key]);
    return settings;
  }, {});
}

function releaseYearFromDate(value?: string) {
  return value ? value.slice(0, 4) : undefined;
}

function cleanStringArray(value: unknown, field: string, max = 30) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, max).map((item) => cleanText(item, { field, max: 80 })).filter(Boolean);
}

function cleanIntegerArray(value: unknown, field: string, max = 30) {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, max)
    .map((item) => cleanInteger(item, { field, min: 0, max: 999999, fallback: null }))
    .filter((item): item is number => item !== null);
}

function mapFollowedTitle(row: any) {
  return {
    id: row.id,
    mediaItemId: row.media_item_id,
    mediaType: normalizeMediaType(row.media_type),
    tmdbId: Number(row.tmdb_id),
    title: row.title,
    overview: row.overview || "",
    posterUrl: row.poster_url || undefined,
    releaseDate: row.release_date || undefined,
    releaseYear: row.year || releaseYearFromDate(row.release_date) || undefined,
    status: row.status || undefined,
    upcoming: Boolean(row.upcoming),
    seasonData: row.season_data || {},
    notificationSettings: normalizeNotificationSettings(normalizeMediaType(row.media_type), row.notification_settings),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function upsertReleaseTracking(sql: any, mediaItem: any) {
  if (!mediaItem?.id) return;

  const status = mediaItem.status || null;
  const releaseTime = mediaItem.release_date ? new Date(mediaItem.release_date).getTime() : Number.NaN;
  const upcoming = Number.isFinite(releaseTime) ? releaseTime >= Date.now() - 24 * 60 * 60 * 1000 : false;
  await sql`
    insert into release_tracking (
      media_item_id,
      media_type,
      release_date,
      status,
      upcoming,
      season_data,
      cached_at,
      updated_at
    )
    values (
      ${mediaItem.id},
      ${normalizeMediaType(mediaItem.media_type)},
      ${mediaItem.release_date || null},
      ${status},
      ${upcoming},
      ${JSON.stringify(mediaItem.source_payload || {})}::jsonb,
      now(),
      now()
    )
    on conflict (media_item_id)
    do update set
      media_type = excluded.media_type,
      release_date = coalesce(excluded.release_date, release_tracking.release_date),
      status = coalesce(excluded.status, release_tracking.status),
      upcoming = excluded.upcoming,
      season_data = release_tracking.season_data || excluded.season_data,
      cached_at = now(),
      updated_at = now()
  `;
}

async function findFollowedTitle(sql: any, userId: string, mediaType: "movie" | "tv", tmdbId: number) {
  const rows = await sql`
    select
      ft.*,
      mi.tmdb_id,
      mi.title,
      mi.overview,
      mi.poster_url,
      mi.release_date,
      mi.year,
      mi.status,
      coalesce(rt.upcoming, false) as upcoming,
      coalesce(rt.season_data, '{}'::jsonb) as season_data
    from followed_titles ft
    inner join media_items mi on mi.id = ft.media_item_id
    left join release_tracking rt on rt.media_item_id = mi.id
    where ft.user_id = ${userId}
      and mi.media_type = ${mediaType}
      and mi.tmdb_id = ${tmdbId}
    limit 1
  `;
  return rows[0] || null;
}

export default async function handler(request: any, response: any) {
  try {
    const sql = db();
    await ensureMediaCatalogTables(sql);
    await ensureFollowTitleTables(sql);
    await ensureNotificationsTable(sql);
    const user = await getCurrentUser(sql, request);

    if (!user) return sendJson(response, 401, { error: "Sign in to follow titles." });

    if (request.method === "GET") {
      const url = new URL(request.url || "/api/followed-titles", "https://www.flim.ca");
      const mediaType = normalizeMediaType(url.searchParams.get("mediaType"));
      const tmdbId = Number(url.searchParams.get("tmdbId"));

      if (Number.isFinite(tmdbId) && tmdbId > 0) {
        const row = await findFollowedTitle(sql, user.id, mediaType, tmdbId);
        return sendJson(response, 200, {
          isFollowing: Boolean(row),
          followedTitle: row ? mapFollowedTitle(row) : null,
        });
      }

      const rows = await sql`
        select
          ft.*,
          mi.tmdb_id,
          mi.title,
          mi.overview,
          mi.poster_url,
          mi.release_date,
          mi.year,
          mi.status,
          coalesce(rt.upcoming, false) as upcoming,
          coalesce(rt.season_data, '{}'::jsonb) as season_data
        from followed_titles ft
        inner join media_items mi on mi.id = ft.media_item_id
        left join release_tracking rt on rt.media_item_id = mi.id
        where ft.user_id = ${user.id}
        order by
          coalesce(rt.upcoming, false) desc,
          rt.release_date asc nulls last,
          ft.created_at desc
      `;

      return sendJson(response, 200, {
        followedTitles: rows.map(mapFollowedTitle),
      });
    }

    if (request.method === "POST") {
      const body = requireRecord(await readBody(request));
      const action = cleanEnum(body.action, ["follow", "unfollow"], { field: "action", fallback: "follow" });
      const mediaType = normalizeMediaType(body.mediaType);
      const tmdbId = cleanInteger(body.tmdbId, { field: "tmdbId", min: 1, max: 99999999, required: true });

      if (action === "unfollow") {
        await sql`
          delete from followed_titles ft
          using media_items mi
          where ft.media_item_id = mi.id
            and ft.user_id = ${user.id}
            and mi.media_type = ${mediaType}
            and mi.tmdb_id = ${tmdbId}
        `;
        return sendJson(response, 200, { ok: true, isFollowing: false });
      }

      const mediaItem = await upsertMediaItem(sql, {
        mediaType,
        tmdbId,
        title: cleanText(body.title, { field: "title", max: 220, required: true }),
        overview: cleanText(body.overview || "", { field: "overview", max: 1200, allowNewlines: true }),
        releaseDate: cleanText(body.releaseDate || "", { field: "releaseDate", max: 20 }),
        releaseYear: cleanInteger(body.releaseYear, { field: "releaseYear", min: 1800, max: 2200, fallback: null })?.toString(),
        firstAirYear: cleanInteger(body.firstAirYear, { field: "firstAirYear", min: 1800, max: 2200, fallback: null })?.toString(),
        posterUrl: cleanUrl(body.posterUrl, { field: "posterUrl", max: 2048 }) || undefined,
        backdropUrl: cleanUrl(body.backdropUrl, { field: "backdropUrl", max: 2048 }) || undefined,
        runtimeMinutes: cleanInteger(body.runtimeMinutes, { field: "runtimeMinutes", min: 0, max: 10000, fallback: null }) || undefined,
        contentRating: cleanText(body.contentRating || "", { field: "contentRating", max: 40 }),
        status: cleanText(body.status || "", { field: "status", max: 80 }),
        genres: cleanStringArray(body.genres, "genres"),
        genreIds: cleanIntegerArray(body.genreIds, "genreIds"),
        seasonCount: cleanInteger(body.seasonCount, { field: "seasonCount", min: 0, max: 500, fallback: null }) || undefined,
        episodeCount: cleanInteger(body.episodeCount, { field: "episodeCount", min: 0, max: 5000, fallback: null }) || undefined,
        contentRatings: Array.isArray(body.contentRatings) ? body.contentRatings.slice(0, 30).map((rating) => cleanJsonObject(rating, { field: "contentRatings", maxDepth: 1, maxKeys: 4 })) as any : undefined,
        contentRatingVersion: cleanInteger(body.contentRatingVersion, { field: "contentRatingVersion", min: 0, max: 1000, fallback: null }) || undefined,
      });

      if (!mediaItem) return sendJson(response, 400, { error: "Title details are required before following." });

      await upsertReleaseTracking(sql, mediaItem);
      const settings = normalizeNotificationSettings(mediaType, body.notificationSettings);

      const [followedTitle] = await sql`
        insert into followed_titles (user_id, media_item_id, media_type, notification_settings, updated_at)
        values (${user.id}, ${mediaItem.id}, ${mediaType}, ${JSON.stringify(settings)}::jsonb, now())
        on conflict (user_id, media_item_id)
        do update set
          notification_settings = excluded.notification_settings,
          updated_at = now()
        returning *
      `;

      await sql`
        insert into notification_preferences (user_id, followed_title_id, media_item_id, preferences, updated_at)
        values (${user.id}, ${followedTitle.id}, ${mediaItem.id}, ${JSON.stringify(settings)}::jsonb, now())
        on conflict (followed_title_id)
        do update set
          preferences = excluded.preferences,
          updated_at = now()
      `;

      const row = await findFollowedTitle(sql, user.id, mediaType, tmdbId);
      return sendJson(response, 200, {
        ok: true,
        isFollowing: true,
        followedTitle: row ? mapFollowedTitle(row) : null,
      });
    }

    return sendJson(response, 405, { error: "Method not allowed." });
  } catch (error) {
    console.error("followed_titles_request_failed", error instanceof Error ? error.message : "Followed titles request failed.");
    return sendJson(response, 500, { error: safeApiError(error, "Unable to update followed titles. Please try again.") });
  }
}
