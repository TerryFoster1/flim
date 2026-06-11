import { db, getCurrentUser, sendJson } from "./_db.js";
import { ensureMediaCatalogTables } from "./_mediaCatalog.js";

type RecommendationRow = {
  media_item_id: string;
  media_type: "movie" | "tv";
  tmdb_id: number;
  title: string;
  year?: string;
  poster_url?: string;
  overview?: string;
  runtime?: number;
  genres?: unknown;
  source_type: string;
  source_id: string;
  reason: string;
  score: number;
};

function normalizeGenres(value: unknown): string[] {
  if (!value) return [];
  if (typeof value === "string") {
    try {
      return normalizeGenres(JSON.parse(value));
    } catch {
      return value.split(",").map((genre) => genre.trim()).filter(Boolean);
    }
  }
  if (!Array.isArray(value)) return [];
  return value.map((genre) => {
    if (typeof genre === "string") return genre;
    if (genre && typeof genre === "object") return String((genre as any).name || (genre as any).label || "");
    return "";
  }).map((genre) => genre.trim()).filter(Boolean);
}

function mapRecommendation(row: RecommendationRow) {
  return {
    mediaItemId: row.media_item_id,
    mediaType: row.media_type === "tv" ? "tv" : "movie",
    tmdbId: Number(row.tmdb_id),
    title: row.title,
    releaseYear: row.year || undefined,
    posterUrl: row.poster_url || undefined,
    overview: row.overview || "",
    genres: normalizeGenres(row.genres),
    runtimeMinutes: row.runtime || undefined,
    addedAt: new Date().toISOString(),
    watchStatus: "not_watched",
    recommendationReason: row.reason,
    sourceType: row.source_type,
    sourceId: row.source_id,
    score: Number(row.score || 0),
  };
}

async function ensureRecommendationTables(sql: any) {
  await ensureMediaCatalogTables(sql);
  await sql`
    create table if not exists recommendation_events (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references users(id) on delete cascade,
      media_item_id uuid not null references media_items(id) on delete cascade,
      source_type text not null,
      source_id text,
      reason text not null,
      score numeric not null default 0,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;
  await sql`
    create unique index if not exists recommendation_events_user_media_source_unique
      on recommendation_events (user_id, media_item_id, source_type, coalesce(source_id, ''))
  `;
  await sql`create index if not exists recommendation_events_user_score_idx on recommendation_events (user_id, score desc, updated_at desc)`;

  await sql`
    create table if not exists recommendation_sources (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references users(id) on delete cascade,
      media_item_id uuid references media_items(id) on delete cascade,
      source_type text not null,
      source_id text,
      source_label text not null,
      signal_payload jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;
  await sql`create index if not exists recommendation_sources_user_type_idx on recommendation_sources (user_id, source_type, updated_at desc)`;

  await sql`
    create table if not exists recommendation_scores (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references users(id) on delete cascade,
      media_item_id uuid not null references media_items(id) on delete cascade,
      source_type text not null,
      source_id text,
      reason text not null,
      score numeric not null default 0,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;
  await sql`
    create unique index if not exists recommendation_scores_user_media_source_unique
      on recommendation_scores (user_id, media_item_id, source_type, coalesce(source_id, ''))
  `;
  await sql`create index if not exists recommendation_scores_user_score_idx on recommendation_scores (user_id, score desc, updated_at desc)`;
}

async function storeRecommendations(sql: any, userId: string, rows: RecommendationRow[]) {
  for (const row of rows) {
    await sql`
      insert into recommendation_scores (
        user_id,
        media_item_id,
        source_type,
        source_id,
        reason,
        score,
        updated_at
      )
      values (
        ${userId},
        ${row.media_item_id},
        ${row.source_type},
        ${row.source_id},
        ${row.reason},
        ${row.score},
        now()
      )
      on conflict (user_id, media_item_id, source_type, coalesce(source_id, ''))
      do update set
        reason = excluded.reason,
        score = greatest(recommendation_scores.score, excluded.score),
        updated_at = now()
    `;
    await sql`
      insert into recommendation_events (
        user_id,
        media_item_id,
        source_type,
        source_id,
        reason,
        score,
        updated_at
      )
      values (
        ${userId},
        ${row.media_item_id},
        ${row.source_type},
        ${row.source_id},
        ${row.reason},
        ${row.score},
        now()
      )
      on conflict (user_id, media_item_id, source_type, coalesce(source_id, ''))
      do update set
        reason = excluded.reason,
        score = greatest(recommendation_events.score, excluded.score),
        updated_at = now()
    `;
  }
}

async function getRecommendations(sql: any, userId: string) {
  const rows = await sql`
    with explicit_signals as (
      select
        mi.id as media_item_id,
        mi.media_type,
        mi.tmdb_id,
        mi.title,
        mi.genres,
        'followed_title'::text as source_type,
        mi.id::text as source_id
      from followed_titles ft
      inner join media_items mi on mi.id = ft.media_item_id
      where ft.user_id = ${userId}

      union all

      select
        mi.id as media_item_id,
        mi.media_type,
        mi.tmdb_id,
        mi.title,
        mi.genres,
        'watch_progress'::text as source_type,
        mi.id::text as source_id
      from user_show_progress usp
      inner join media_items mi on mi.id = usp.media_item_id
      where usp.user_id = ${userId}
        and usp.status in ('watching', 'completed')
    ),
    saved_titles as (
      select distinct coalesce(pm.media_item_id, mi.id) as media_item_id
      from playlists p
      inner join playlist_movies pm on pm.playlist_id = p.id
      left join media_items mi on mi.media_type = coalesce(pm.media_type, 'movie') and mi.tmdb_id = pm.tmdb_id
      where p.owner_user_id = ${userId}
    ),
    playlist_graph as (
      select
        candidate.id as media_item_id,
        candidate.media_type,
        candidate.tmdb_id,
        candidate.title,
        candidate.year,
        candidate.poster_url,
        candidate.overview,
        candidate.runtime,
        candidate.genres,
        'playlist_graph'::text as source_type,
        max(signal.media_item_id::text) as source_id,
        ('Frequently appears in playlists with ' || max(signal.title) || '.') as reason,
        (92 + count(distinct pm_candidate.playlist_id) * 6)::numeric as score
      from explicit_signals signal
      inner join playlist_movies pm_signal
        on pm_signal.media_type = signal.media_type
        and pm_signal.tmdb_id = signal.tmdb_id
      inner join playlists source_playlist
        on source_playlist.id = pm_signal.playlist_id
        and (source_playlist.visibility = 'public' or source_playlist.owner_user_id = ${userId})
      inner join playlist_movies pm_candidate
        on pm_candidate.playlist_id = source_playlist.id
      inner join media_items candidate
        on candidate.media_type = coalesce(pm_candidate.media_type, 'movie')
        and candidate.tmdb_id = pm_candidate.tmdb_id
      where candidate.id <> signal.media_item_id
        and not exists (select 1 from saved_titles st where st.media_item_id = candidate.id)
        and not exists (select 1 from followed_titles ft where ft.user_id = ${userId} and ft.media_item_id = candidate.id)
      group by candidate.id
    ),
    followed_playlist_titles as (
      select
        candidate.id as media_item_id,
        candidate.media_type,
        candidate.tmdb_id,
        candidate.title,
        candidate.year,
        candidate.poster_url,
        candidate.overview,
        candidate.runtime,
        candidate.genres,
        'followed_playlist'::text as source_type,
        p.id::text as source_id,
        ('Because this appears in the playlist "' || p.name || '".') as reason,
        (84 + coalesce(pf_counts.follower_count, 0) * 0.15)::numeric as score
      from playlist_follows pf
      inner join playlists p on p.id = pf.playlist_id and p.visibility = 'public'
      inner join playlist_movies pm on pm.playlist_id = p.id
      inner join media_items candidate on candidate.media_type = coalesce(pm.media_type, 'movie') and candidate.tmdb_id = pm.tmdb_id
      left join (
        select playlist_id, count(*)::int as follower_count
        from playlist_follows
        group by playlist_id
      ) pf_counts on pf_counts.playlist_id = p.id
      where pf.follower_user_id = ${userId}
        and not exists (select 1 from saved_titles st where st.media_item_id = candidate.id)
        and not exists (select 1 from followed_titles ft where ft.user_id = ${userId} and ft.media_item_id = candidate.id)
    ),
    genre_affinity as (
      select
        candidate.id as media_item_id,
        candidate.media_type,
        candidate.tmdb_id,
        candidate.title,
        candidate.year,
        candidate.poster_url,
        candidate.overview,
        candidate.runtime,
        candidate.genres,
        'genre_affinity'::text as source_type,
        genre_match.genre::text as source_id,
        ('Because you follow ' || genre_match.genre || ' titles.') as reason,
        76::numeric as score
      from explicit_signals signal
      cross join lateral (
        select value::text as genre
        from jsonb_array_elements_text(coalesce(signal.genres, '[]'::jsonb))
        limit 3
      ) genre_match
      inner join playlist_movies pm on true
      inner join playlists p on p.id = pm.playlist_id and p.visibility = 'public'
      inner join media_items candidate on candidate.media_type = coalesce(pm.media_type, 'movie') and candidate.tmdb_id = pm.tmdb_id
      where candidate.genres ? genre_match.genre
        and candidate.id <> signal.media_item_id
        and not exists (select 1 from saved_titles st where st.media_item_id = candidate.id)
        and not exists (select 1 from followed_titles ft where ft.user_id = ${userId} and ft.media_item_id = candidate.id)
    ),
    director_picks as (
      select
        candidate.id as media_item_id,
        candidate.media_type,
        candidate.tmdb_id,
        candidate.title,
        candidate.year,
        candidate.poster_url,
        candidate.overview,
        candidate.runtime,
        candidate.genres,
        'director_cut'::text as source_type,
        p.id::text as source_id,
        'Because The Director recommends it.' as reason,
        68::numeric as score
      from explicit_signals signal
      inner join playlists p on p.visibility = 'public'
      left join user_profiles up on up.user_id = p.owner_user_id::text
      inner join playlist_movies pm on pm.playlist_id = p.id
      inner join media_items candidate on candidate.media_type = coalesce(pm.media_type, 'movie') and candidate.tmdb_id = pm.tmdb_id
      where (up.handle = 'the-director' or up.display_name = 'The Director' or lower(p.name) like 'director%')
        and candidate.id <> signal.media_item_id
        and (
          candidate.genres ?| coalesce((
            select array_agg(value::text)
            from jsonb_array_elements_text(coalesce(signal.genres, '[]'::jsonb))
          ), array[]::text[])
        )
        and not exists (select 1 from saved_titles st where st.media_item_id = candidate.id)
        and not exists (select 1 from followed_titles ft where ft.user_id = ${userId} and ft.media_item_id = candidate.id)
    ),
    all_recommendations as (
      select * from playlist_graph
      union all
      select * from followed_playlist_titles
      union all
      select * from genre_affinity
      union all
      select * from director_picks
    ),
    ranked as (
      select
        *,
        row_number() over (partition by media_item_id order by score desc) as media_rank
      from all_recommendations
      where reason is not null and length(trim(reason)) > 0
    )
    select *
    from ranked
    where media_rank = 1
    order by score desc, title asc
    limit 18
  `;

  return rows as RecommendationRow[];
}

export default async function handler(request: any, response: any) {
  if (request.method !== "GET") return sendJson(response, 405, { error: "Method not allowed." });

  try {
    const sql = db();
    await ensureRecommendationTables(sql);
    const user = await getCurrentUser(sql, request);
    if (!user) return sendJson(response, 401, { error: "Sign in to get recommendations." });

    const rows = await getRecommendations(sql, user.id);
    await storeRecommendations(sql, user.id, rows);

    return sendJson(response, 200, {
      recommendations: rows.map(mapRecommendation),
    });
  } catch (error) {
    console.error("recommendations_failed", error instanceof Error ? error.message : "Recommendations failed.");
    return sendJson(response, 500, { error: "Unable to load recommendations right now." });
  }
}
