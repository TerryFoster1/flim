import { db, ensureFollowTitleTables, sendJson } from "../_db.js";
import { ensureMediaCatalogTables } from "../_mediaCatalog.js";
import { ensureTmdbCacheTables } from "../_tmdb.js";
import { checkReleaseIntelligenceForMediaItem } from "../_releaseCheck.js";

const MAX_TITLES_PER_RUN = 50;

function isAuthorized(request: any) {
  const expected = process.env.CRON_SECRET?.trim();
  const header = String(request.headers?.authorization || request.headers?.Authorization || "");
  return Boolean(expected) && header === `Bearer ${expected}`;
}

function startedAtIso() {
  return new Date().toISOString();
}

export default async function handler(request: any, response: any) {
  const startedAt = Date.now();
  const runStartedAt = startedAtIso();

  try {
    if (request.method !== "GET") return sendJson(response, 405, { error: "Method not allowed." });
    if (!isAuthorized(request)) return sendJson(response, 401, { error: "Unauthorized." });

    const sql = db();
    await ensureMediaCatalogTables(sql);
    await ensureFollowTitleTables(sql);
    await ensureTmdbCacheTables(sql);

    const url = new URL(request.url || "/api/cron/release-check", "https://www.flim.ca");
    const requestedLimit = Number(url.searchParams.get("limit"));
    const runLimit = Number.isFinite(requestedLimit)
      ? Math.max(0, Math.min(MAX_TITLES_PER_RUN, Math.trunc(requestedLimit)))
      : MAX_TITLES_PER_RUN;
    const requestedTmdbId = Number(url.searchParams.get("tmdbId"));
    const requestedMediaType = url.searchParams.get("mediaType") === "tv" ? "tv" : "movie";
    const hasTitleFilter = Number.isFinite(requestedTmdbId) && requestedTmdbId > 0;

    const titles = await sql`
      select distinct on (mi.id)
        mi.*
      from followed_titles ft
      inner join media_items mi on mi.id = ft.media_item_id
      left join release_tracking rt on rt.media_item_id = mi.id
      where (
          rt.last_checked_at is null
          or rt.last_checked_at < now() - interval '20 hours'
          or rt.upcoming = true
          or mi.release_date >= current_date - interval '14 days'
        )
        and (${hasTitleFilter} = false or (mi.tmdb_id = ${hasTitleFilter ? requestedTmdbId : 0} and mi.media_type = ${requestedMediaType}))
      order by
        mi.id,
        coalesce(rt.last_checked_at, 'epoch'::timestamptz) asc,
        coalesce(mi.release_date, '9999-12-31'::date) asc
      limit ${runLimit}
    `;

    let eventsGenerated = 0;
    let notificationsCreated = 0;
    let pushAttempted = 0;
    let pushSent = 0;
    let pushFailed = 0;
    let duplicateEvents = 0;
    let failed = 0;
    const checkedTitles = [];

    for (const title of titles) {
      try {
        const result = await checkReleaseIntelligenceForMediaItem(sql, title, { refreshFromSource: true });
        eventsGenerated += result.generatedCount;
        notificationsCreated += result.notificationCount;
        pushAttempted += result.pushAttempted;
        pushSent += result.pushSent;
        pushFailed += result.pushFailed;
        duplicateEvents += result.duplicateCount;
        checkedTitles.push({
          mediaType: result.mediaItem.media_type,
          tmdbId: result.mediaItem.tmdb_id,
          title: result.mediaItem.title,
          eventsGenerated: result.generatedCount,
          notificationsCreated: result.notificationCount,
          pushAttempted: result.pushAttempted,
          pushSent: result.pushSent,
          pushFailed: result.pushFailed,
          refreshStatus: result.refreshStatus,
        });
      } catch (error) {
        failed += 1;
        console.error("cron_release_check_title_failed", title.media_type, title.tmdb_id, error instanceof Error ? error.message : "Release check failed.");
      }
    }

    const latest = await sql`
      select max(last_checked_at) as last_run_at
      from release_tracking
    `;

    return sendJson(response, 200, {
      ok: true,
      runStartedAt,
      durationMs: Date.now() - startedAt,
      titlesChecked: titles.length,
      requestedLimit: runLimit,
      eventsGenerated,
      duplicateEvents,
      notificationsCreated,
      pushAttempted,
      pushSent,
      pushFailed,
      failed,
      lastRunAt: latest[0]?.last_run_at || null,
      checkedTitles,
    });
  } catch (error) {
    console.error("cron_release_check_failed", error instanceof Error ? error.message : "Release check cron failed.");
    return sendJson(response, 500, {
      error: "Unable to run release checks. Please try again.",
      runStartedAt,
      durationMs: Date.now() - startedAt,
    });
  }
}
