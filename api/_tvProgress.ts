import { ensurePgCrypto } from "./_db.js";
import { ensureMediaCatalogTables, getCatalogMediaItem, upsertMediaItem } from "./_mediaCatalog.js";
import { ensureTmdbCacheTables, fetchTmdbMovieDetails, fetchTmdbTvSeasonDetails } from "./_tmdb.js";

const SEASON_CACHE_DAYS = 30;

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function isReleased(airDate?: string | null) {
  return Boolean(airDate && airDate <= todayIso());
}

function progressStatus(status: unknown) {
  if (status === "watching" || status === "watched") return status;
  return "not_started";
}

function seasonStatus(watchedCount: number, releasedCount: number, activeCount = watchedCount) {
  if (releasedCount > 0 && watchedCount >= releasedCount) return "completed";
  if (activeCount > 0) return "watching";
  return "not_started";
}

export async function ensureTvProgressTables(sql: any) {
  await ensureMediaCatalogTables(sql);
  await ensurePgCrypto(sql);
  await sql`
    create table if not exists tv_season_catalog (
      id uuid primary key default gen_random_uuid(),
      media_item_id uuid not null references media_items(id) on delete cascade,
      tmdb_show_id integer not null,
      season_number integer not null,
      tmdb_season_id integer,
      title text not null,
      overview text,
      poster_url text,
      air_date date,
      episode_count integer not null default 0,
      fetched_at timestamptz not null default now(),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;
  await sql`create unique index if not exists tv_season_catalog_show_season_unique on tv_season_catalog (tmdb_show_id, season_number)`;
  await sql`create index if not exists tv_season_catalog_media_item_idx on tv_season_catalog (media_item_id)`;

  await sql`
    create table if not exists tv_episode_catalog (
      id uuid primary key default gen_random_uuid(),
      media_item_id uuid not null references media_items(id) on delete cascade,
      tmdb_show_id integer not null,
      season_number integer not null,
      episode_number integer not null,
      tmdb_episode_id integer,
      title text not null,
      overview text,
      runtime_minutes integer,
      air_date date,
      still_url text,
      released boolean not null default false,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;
  await sql`create unique index if not exists tv_episode_catalog_show_episode_unique on tv_episode_catalog (tmdb_show_id, season_number, episode_number)`;
  await sql`create index if not exists tv_episode_catalog_show_released_idx on tv_episode_catalog (tmdb_show_id, released, air_date)`;

  await sql`
    create table if not exists user_episode_progress (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references users(id) on delete cascade,
      media_item_id uuid not null references media_items(id) on delete cascade,
      tmdb_show_id integer not null,
      tmdb_season_number integer not null,
      tmdb_episode_number integer not null,
      status text not null default 'not_started' check (status in ('not_started', 'watching', 'watched')),
      progress_percent integer not null default 0,
      last_watched_at timestamptz,
      completed_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;
  await sql`create unique index if not exists user_episode_progress_identity_unique on user_episode_progress (user_id, tmdb_show_id, tmdb_season_number, tmdb_episode_number)`;
  await sql`create index if not exists user_episode_progress_user_recent_idx on user_episode_progress (user_id, last_watched_at desc)`;

  await sql`
    create table if not exists user_season_progress (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references users(id) on delete cascade,
      media_item_id uuid not null references media_items(id) on delete cascade,
      tmdb_show_id integer not null,
      tmdb_season_number integer not null,
      status text not null default 'not_started' check (status in ('not_started', 'watching', 'completed')),
      progress_percent integer not null default 0,
      watched_episode_count integer not null default 0,
      released_episode_count integer not null default 0,
      last_watched_at timestamptz,
      completed_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;
  await sql`create unique index if not exists user_season_progress_identity_unique on user_season_progress (user_id, tmdb_show_id, tmdb_season_number)`;

  await sql`
    create table if not exists user_show_progress (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references users(id) on delete cascade,
      media_item_id uuid not null references media_items(id) on delete cascade,
      tmdb_show_id integer not null,
      status text not null default 'not_started' check (status in ('not_started', 'watching', 'completed')),
      progress_percent integer not null default 0,
      current_season_number integer,
      current_episode_number integer,
      watched_episode_count integer not null default 0,
      released_episode_count integer not null default 0,
      last_watched_at timestamptz,
      completed_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;
  await sql`create unique index if not exists user_show_progress_identity_unique on user_show_progress (user_id, tmdb_show_id)`;
  await sql`create index if not exists user_show_progress_user_recent_idx on user_show_progress (user_id, last_watched_at desc)`;
}

async function cacheSeason(sql: any, mediaItem: any, season: any) {
  const episodes = Array.isArray(season.episodes) ? season.episodes : [];
  await sql`
    insert into tv_season_catalog (
      media_item_id,
      tmdb_show_id,
      season_number,
      tmdb_season_id,
      title,
      overview,
      poster_url,
      air_date,
      episode_count,
      fetched_at,
      updated_at
    )
    values (
      ${mediaItem.id},
      ${mediaItem.tmdb_id},
      ${season.seasonNumber},
      ${season.tmdbId || null},
      ${season.title || `Season ${season.seasonNumber}`},
      ${season.overview || null},
      ${season.posterUrl || null},
      ${season.airDate || null},
      ${episodes.length},
      now(),
      now()
    )
    on conflict (tmdb_show_id, season_number)
    do update set
      media_item_id = excluded.media_item_id,
      tmdb_season_id = coalesce(excluded.tmdb_season_id, tv_season_catalog.tmdb_season_id),
      title = excluded.title,
      overview = coalesce(excluded.overview, tv_season_catalog.overview),
      poster_url = coalesce(excluded.poster_url, tv_season_catalog.poster_url),
      air_date = coalesce(excluded.air_date, tv_season_catalog.air_date),
      episode_count = excluded.episode_count,
      fetched_at = now(),
      updated_at = now()
  `;

  for (const episode of episodes) {
    await sql`
      insert into tv_episode_catalog (
        media_item_id,
        tmdb_show_id,
        season_number,
        episode_number,
        tmdb_episode_id,
        title,
        overview,
        runtime_minutes,
        air_date,
        still_url,
        released,
        updated_at
      )
      values (
        ${mediaItem.id},
        ${mediaItem.tmdb_id},
        ${episode.seasonNumber || season.seasonNumber},
        ${episode.episodeNumber},
        ${episode.tmdbId || null},
        ${episode.title || `Episode ${episode.episodeNumber}`},
        ${episode.overview || null},
        ${episode.runtimeMinutes || null},
        ${episode.airDate || null},
        ${episode.stillUrl || null},
        ${isReleased(episode.airDate)},
        now()
      )
      on conflict (tmdb_show_id, season_number, episode_number)
      do update set
        media_item_id = excluded.media_item_id,
        tmdb_episode_id = coalesce(excluded.tmdb_episode_id, tv_episode_catalog.tmdb_episode_id),
        title = excluded.title,
        overview = coalesce(excluded.overview, tv_episode_catalog.overview),
        runtime_minutes = coalesce(excluded.runtime_minutes, tv_episode_catalog.runtime_minutes),
        air_date = coalesce(excluded.air_date, tv_episode_catalog.air_date),
        still_url = coalesce(excluded.still_url, tv_episode_catalog.still_url),
        released = excluded.released,
        updated_at = now()
    `;
  }
}

export async function ensureTvShowCatalog(sql: any, tmdbShowId: number) {
  await ensureTvProgressTables(sql);
  await ensureTmdbCacheTables(sql);

  let mediaItem = await getCatalogMediaItem(sql, tmdbShowId, "tv");
  const payloadSeasons = Array.isArray(mediaItem?.source_payload?.seasons) ? mediaItem.source_payload.seasons : [];

  if (!mediaItem || payloadSeasons.length === 0) {
    const details = await fetchTmdbMovieDetails(tmdbShowId, "tv");
    await upsertMediaItem(sql, details);
    mediaItem = await getCatalogMediaItem(sql, tmdbShowId, "tv");
  }

  if (!mediaItem) throw new Error("TV show is not in the Flim catalog.");
  const seasons = Array.isArray(mediaItem.source_payload?.seasons) ? mediaItem.source_payload.seasons : [];
  const regularSeasons = seasons
    .map((season: any) => ({
      seasonNumber: Number(season.seasonNumber),
      episodeCount: Number(season.episodeCount || 0),
    }))
    .filter((season: any) => season.seasonNumber > 0 && season.episodeCount > 0);

  for (const season of regularSeasons) {
    const cached = await sql`
      select fetched_at
      from tv_season_catalog
      where tmdb_show_id = ${tmdbShowId}
        and season_number = ${season.seasonNumber}
        and fetched_at > now() - (${SEASON_CACHE_DAYS} * interval '1 day')
      limit 1
    `;
    if (cached[0]) continue;
    const tmdbCached = await sql`
      select response_json
      from tmdb_tv_season_cache
      where tmdb_show_id = ${tmdbShowId}
        and season_number = ${season.seasonNumber}
        and expires_at > now()
      order by created_at desc
      limit 1
    `;
    const details = tmdbCached[0]?.response_json || await fetchTmdbTvSeasonDetails(tmdbShowId, season.seasonNumber);
    if (!tmdbCached[0]) {
      await sql`
        insert into tmdb_tv_season_cache (tmdb_show_id, season_number, response_json, expires_at)
        values (${tmdbShowId}, ${season.seasonNumber}, ${JSON.stringify(details)}::jsonb, now() + (${SEASON_CACHE_DAYS} * interval '1 day'))
        on conflict (tmdb_show_id, season_number)
        do update set
          response_json = excluded.response_json,
          created_at = now(),
          expires_at = excluded.expires_at
      `;
    }
    await cacheSeason(sql, mediaItem, details);
  }

  return mediaItem;
}

async function recomputeDerivedProgress(sql: any, userId: string, mediaItem: any) {
  const seasons = await sql`
    select
      s.season_number,
      count(e.id)::int as released_episode_count,
      count(p.id) filter (where p.status = 'watched')::int as watched_episode_count,
      count(p.id) filter (where p.status in ('watching', 'watched'))::int as active_episode_count,
      max(p.last_watched_at) as last_watched_at
    from tv_season_catalog s
    left join tv_episode_catalog e on e.tmdb_show_id = s.tmdb_show_id and e.season_number = s.season_number and e.released = true
    left join user_episode_progress p on p.user_id = ${userId} and p.tmdb_show_id = s.tmdb_show_id and p.tmdb_season_number = s.season_number and p.tmdb_episode_number = e.episode_number
    where s.tmdb_show_id = ${mediaItem.tmdb_id}
    group by s.season_number
    order by s.season_number
  `;

  for (const season of seasons) {
    const released = Number(season.released_episode_count || 0);
    const watched = Number(season.watched_episode_count || 0);
    const active = Number(season.active_episode_count || watched);
    const status = seasonStatus(watched, released, active);
    const percent = released > 0 ? Math.round((watched / released) * 100) : 0;
    const completedAt = status === "completed" ? new Date().toISOString() : null;
    await sql`
      insert into user_season_progress (
        user_id,
        media_item_id,
        tmdb_show_id,
        tmdb_season_number,
        status,
        progress_percent,
        watched_episode_count,
        released_episode_count,
        last_watched_at,
        completed_at,
        updated_at
      )
      values (
        ${userId},
        ${mediaItem.id},
        ${mediaItem.tmdb_id},
        ${season.season_number},
        ${status},
        ${percent},
        ${watched},
        ${released},
        ${season.last_watched_at || null},
        ${completedAt},
        now()
      )
      on conflict (user_id, tmdb_show_id, tmdb_season_number)
      do update set
        status = excluded.status,
        progress_percent = excluded.progress_percent,
        watched_episode_count = excluded.watched_episode_count,
        released_episode_count = excluded.released_episode_count,
        last_watched_at = coalesce(excluded.last_watched_at, user_season_progress.last_watched_at),
        completed_at = case when excluded.status = 'completed' then coalesce(user_season_progress.completed_at, now()) else null end,
        updated_at = now()
    `;
  }

  const totals = await sql`
    select
      count(e.id)::int as released_episode_count,
      count(p.id) filter (where p.status = 'watched')::int as watched_episode_count,
      count(p.id) filter (where p.status in ('watching', 'watched'))::int as active_episode_count,
      max(p.last_watched_at) as last_watched_at
    from tv_episode_catalog e
    left join user_episode_progress p on p.user_id = ${userId} and p.tmdb_show_id = e.tmdb_show_id and p.tmdb_season_number = e.season_number and p.tmdb_episode_number = e.episode_number
    where e.tmdb_show_id = ${mediaItem.tmdb_id}
      and e.released = true
  `;
  const next = await sql`
    select e.season_number, e.episode_number
    from tv_episode_catalog e
    left join user_episode_progress p on p.user_id = ${userId} and p.tmdb_show_id = e.tmdb_show_id and p.tmdb_season_number = e.season_number and p.tmdb_episode_number = e.episode_number
    where e.tmdb_show_id = ${mediaItem.tmdb_id}
      and e.released = true
      and coalesce(p.status, 'not_started') <> 'watched'
    order by e.season_number, e.episode_number
    limit 1
  `;

  const released = Number(totals[0]?.released_episode_count || 0);
  const watched = Number(totals[0]?.watched_episode_count || 0);
  const active = Number(totals[0]?.active_episode_count || watched);
  const status = released > 0 && watched >= released ? "completed" : active > 0 ? "watching" : "not_started";
  const percent = released > 0 ? Math.round((watched / released) * 100) : 0;
  const completedAt = status === "completed" ? new Date().toISOString() : null;
  await sql`
    insert into user_show_progress (
      user_id,
      media_item_id,
      tmdb_show_id,
      status,
      progress_percent,
      current_season_number,
      current_episode_number,
      watched_episode_count,
      released_episode_count,
      last_watched_at,
      completed_at,
      updated_at
    )
    values (
      ${userId},
      ${mediaItem.id},
      ${mediaItem.tmdb_id},
      ${status},
      ${percent},
      ${next[0]?.season_number || null},
      ${next[0]?.episode_number || null},
      ${watched},
      ${released},
      ${totals[0]?.last_watched_at || null},
      ${completedAt},
      now()
    )
    on conflict (user_id, tmdb_show_id)
    do update set
      status = excluded.status,
      progress_percent = excluded.progress_percent,
      current_season_number = excluded.current_season_number,
      current_episode_number = excluded.current_episode_number,
      watched_episode_count = excluded.watched_episode_count,
      released_episode_count = excluded.released_episode_count,
      last_watched_at = coalesce(excluded.last_watched_at, user_show_progress.last_watched_at),
      completed_at = case when excluded.status = 'completed' then coalesce(user_show_progress.completed_at, now()) else null end,
      updated_at = now()
  `;
}

async function writeEpisodeProgress(sql: any, userId: string, mediaItem: any, seasonNumber: number, episodeNumber: number, status: string) {
  const normalized = progressStatus(status);
  const progressPercent = normalized === "watched" ? 100 : normalized === "watching" ? 50 : 0;
  const touchedAt = normalized === "not_started" ? null : new Date().toISOString();
  const completedAt = normalized === "watched" ? touchedAt : null;
  await sql`
    insert into user_episode_progress (
      user_id,
      media_item_id,
      tmdb_show_id,
      tmdb_season_number,
      tmdb_episode_number,
      status,
      progress_percent,
      last_watched_at,
      completed_at,
      updated_at
    )
    values (
      ${userId},
      ${mediaItem.id},
      ${mediaItem.tmdb_id},
      ${seasonNumber},
      ${episodeNumber},
      ${normalized},
      ${progressPercent},
      ${touchedAt},
      ${completedAt},
      now()
    )
    on conflict (user_id, tmdb_show_id, tmdb_season_number, tmdb_episode_number)
    do update set
      status = excluded.status,
      progress_percent = excluded.progress_percent,
      last_watched_at = case when excluded.status = 'not_started' then user_episode_progress.last_watched_at else now() end,
      completed_at = case when excluded.status = 'watched' then coalesce(user_episode_progress.completed_at, now()) else null end,
      updated_at = now()
  `;
}

export async function setEpisodeProgress(sql: any, userId: string, mediaItem: any, seasonNumber: number, episodeNumber: number, status: string) {
  await writeEpisodeProgress(sql, userId, mediaItem, seasonNumber, episodeNumber, status);
  await recomputeDerivedProgress(sql, userId, mediaItem);
}

export async function setSeasonProgress(sql: any, userId: string, mediaItem: any, seasonNumber: number, watched: boolean) {
  const episodes = await sql`
    select episode_number
    from tv_episode_catalog
    where tmdb_show_id = ${mediaItem.tmdb_id}
      and season_number = ${seasonNumber}
      and released = true
    order by episode_number
  `;
  for (const episode of episodes) {
    await writeEpisodeProgress(sql, userId, mediaItem, seasonNumber, Number(episode.episode_number), watched ? "watched" : "not_started");
  }
  await recomputeDerivedProgress(sql, userId, mediaItem);
}

export async function setShowProgress(sql: any, userId: string, mediaItem: any, watched: boolean) {
  const seasons = await sql`
    select season_number
    from tv_season_catalog
    where tmdb_show_id = ${mediaItem.tmdb_id}
    order by season_number
  `;
  for (const season of seasons) {
    const episodes = await sql`
      select episode_number
      from tv_episode_catalog
      where tmdb_show_id = ${mediaItem.tmdb_id}
        and season_number = ${Number(season.season_number)}
        and released = true
      order by episode_number
    `;
    for (const episode of episodes) {
      await writeEpisodeProgress(sql, userId, mediaItem, Number(season.season_number), Number(episode.episode_number), watched ? "watched" : "not_started");
    }
  }
  await recomputeDerivedProgress(sql, userId, mediaItem);
}

export async function getTvProgress(sql: any, userId: string, mediaItem: any) {
  await recomputeDerivedProgress(sql, userId, mediaItem);
  const rows = await sql`
    select
      s.season_number,
      s.title as season_title,
      coalesce(sp.status, 'not_started') as season_status,
      coalesce(sp.progress_percent, 0)::int as season_progress_percent,
      coalesce(sp.watched_episode_count, 0)::int as watched_episode_count,
      coalesce(sp.released_episode_count, 0)::int as released_episode_count,
      e.episode_number,
      e.tmdb_episode_id,
      e.title,
      e.overview,
      e.runtime_minutes,
      e.air_date,
      e.still_url,
      e.released,
      coalesce(ep.status, 'not_started') as status,
      coalesce(ep.progress_percent, 0)::int as progress_percent,
      ep.last_watched_at,
      ep.completed_at
    from tv_season_catalog s
    left join tv_episode_catalog e on e.tmdb_show_id = s.tmdb_show_id and e.season_number = s.season_number
    left join user_episode_progress ep on ep.user_id = ${userId} and ep.tmdb_show_id = e.tmdb_show_id and ep.tmdb_season_number = e.season_number and ep.tmdb_episode_number = e.episode_number
    left join user_season_progress sp on sp.user_id = ${userId} and sp.tmdb_show_id = s.tmdb_show_id and sp.tmdb_season_number = s.season_number
    where s.tmdb_show_id = ${mediaItem.tmdb_id}
    order by s.season_number, e.episode_number
  `;
  const showRows = await sql`
    select *
    from user_show_progress
    where user_id = ${userId}
      and tmdb_show_id = ${mediaItem.tmdb_id}
    limit 1
  `;
  const seasons = new Map<number, any>();
  for (const row of rows) {
    const seasonNumber = Number(row.season_number);
    if (!seasons.has(seasonNumber)) {
      seasons.set(seasonNumber, {
        seasonNumber,
        title: row.season_title || `Season ${seasonNumber}`,
        episodeCount: 0,
        releasedEpisodeCount: Number(row.released_episode_count || 0),
        watchedEpisodeCount: Number(row.watched_episode_count || 0),
        status: row.season_status,
        progressPercent: Number(row.season_progress_percent || 0),
        episodes: [],
      });
    }
    if (!row.episode_number) continue;
    const season = seasons.get(seasonNumber);
    season.episodeCount += 1;
    season.episodes.push({
      tmdbId: row.tmdb_episode_id || undefined,
      seasonNumber,
      episodeNumber: Number(row.episode_number),
      title: row.title,
      overview: row.overview || undefined,
      runtimeMinutes: row.runtime_minutes || undefined,
      airDate: row.air_date || undefined,
      stillUrl: row.still_url || undefined,
      released: Boolean(row.released),
      status: row.status,
      progressPercent: Number(row.progress_percent || 0),
      lastWatchedAt: row.last_watched_at || undefined,
      completedAt: row.completed_at || undefined,
    });
  }
  const showProgress = showRows[0] || {};
  const nextSeason = Number(showProgress.current_season_number || 0);
  const nextEpisode = Number(showProgress.current_episode_number || 0);
  const next = nextSeason && nextEpisode
    ? seasons.get(nextSeason)?.episodes.find((episode: any) => episode.episodeNumber === nextEpisode)
    : undefined;
  return {
    show: {
      tmdbShowId: mediaItem.tmdb_id,
      title: mediaItem.title,
      posterUrl: mediaItem.poster_url || undefined,
      status: showProgress.status || "not_started",
      progressPercent: Number(showProgress.progress_percent || 0),
      watchedEpisodeCount: Number(showProgress.watched_episode_count || 0),
      releasedEpisodeCount: Number(showProgress.released_episode_count || 0),
      nextEpisode: next,
      lastWatchedAt: showProgress.last_watched_at || undefined,
      completedAt: showProgress.completed_at || undefined,
    },
    seasons: Array.from(seasons.values()),
  };
}
