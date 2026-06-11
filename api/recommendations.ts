import { db, ensurePlaylistFollowsTable, ensurePlaylistLikesTable, ensureUserFollowsTable, ensureUserProfilesTable, getCurrentUser, mapPlaylist, sendJson } from "./_db.js";
import { getCuratorDiscovery } from "./_curators.js";
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

function decoratePlaylistRecommendation(row: any) {
  const playlist = mapPlaylist(row, row.movies || []);
  return {
    ...playlist,
    recommendationReason: row.reason || "Recommended for playlist discovery.",
    sourceType: row.source_type || "playlist_discovery",
    score: Number(row.score || 0),
  };
}

function decorateCuratorRecommendation(curator: any, index: number) {
  const genres = Array.isArray(curator.favoriteGenres) ? curator.favoriteGenres : [];
  const genreReason = genres.length ? `Because this curator specializes in ${genres.slice(0, 2).join(" and ")} playlists.` : "";
  const followerReason = curator.stats?.playlistFollowerCount > 0
    ? "Because people are following this curator's playlists."
    : "";
  return {
    ...curator,
    recommendationReason: genreReason || followerReason || "Because this curator has public playlists worth browsing.",
    sourceType: index === 0 ? "featured_curator" : "curator_discovery",
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
    progress_titles as (
      select distinct media_item_id
      from user_show_progress
      where user_id = ${userId}
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
        and candidate.tmdb_id <> signal.tmdb_id
        and not exists (select 1 from saved_titles st where st.media_item_id = candidate.id)
        and not exists (select 1 from progress_titles pt where pt.media_item_id = candidate.id)
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
        and not exists (select 1 from progress_titles pt where pt.media_item_id = candidate.id)
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
        and candidate.tmdb_id <> signal.tmdb_id
        and not exists (select 1 from saved_titles st where st.media_item_id = candidate.id)
        and not exists (select 1 from progress_titles pt where pt.media_item_id = candidate.id)
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
        and candidate.tmdb_id <> signal.tmdb_id
        and (
          candidate.genres ?| coalesce((
            select array_agg(value::text)
            from jsonb_array_elements_text(coalesce(signal.genres, '[]'::jsonb))
          ), array[]::text[])
        )
        and not exists (select 1 from saved_titles st where st.media_item_id = candidate.id)
        and not exists (select 1 from progress_titles pt where pt.media_item_id = candidate.id)
        and not exists (select 1 from followed_titles ft where ft.user_id = ${userId} and ft.media_item_id = candidate.id)
    ),
    community_followed_titles as (
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
        'community_follow'::text as source_type,
        max(seed.media_item_id::text) as source_id,
        ('People who follow ' || max(seed.title) || ' also follow this.') as reason,
        (88 + count(distinct other_follow.user_id) * 7)::numeric as score
      from explicit_signals seed
      inner join followed_titles shared_seed
        on shared_seed.media_item_id = seed.media_item_id
        and shared_seed.user_id <> ${userId}
      inner join followed_titles other_follow
        on other_follow.user_id = shared_seed.user_id
        and other_follow.media_item_id <> seed.media_item_id
      inner join media_items candidate on candidate.id = other_follow.media_item_id
      where candidate.tmdb_id <> seed.tmdb_id
        and not exists (select 1 from saved_titles st where st.media_item_id = candidate.id)
        and not exists (select 1 from progress_titles pt where pt.media_item_id = candidate.id)
        and not exists (select 1 from followed_titles ft where ft.user_id = ${userId} and ft.media_item_id = candidate.id)
      group by candidate.id
    ),
    all_recommendations as (
      select * from playlist_graph
      union all
      select * from followed_playlist_titles
      union all
      select * from genre_affinity
      union all
      select * from director_picks
      union all
      select * from community_followed_titles
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

async function getPlaylistRecommendations(sql: any, userId: string, limit = 18) {
  await ensureUserProfilesTable(sql);
  await ensurePlaylistFollowsTable(sql);
  await ensurePlaylistLikesTable(sql);
  await ensureUserFollowsTable(sql);

  const rows = await sql`
    with user_playlist_terms as (
      select distinct lower(term) as term
      from (
        select unnest(regexp_split_to_array(coalesce(p.name, '') || ' ' || coalesce(p.description, ''), '\s+')) as term
        from playlists p
        where p.owner_user_id = ${userId}

        union all

        select unnest(regexp_split_to_array(
          coalesce(pm.title, '') || ' ' || coalesce((
            select string_agg(value, ' ')
            from jsonb_array_elements_text(coalesce(pm.genres, '[]'::jsonb)) as value
          ), ''),
          '\s+'
        )) as term
        from playlists p
        inner join playlist_movies pm on pm.playlist_id = p.id
        where p.owner_user_id = ${userId}

        union all

        select unnest(regexp_split_to_array(coalesce(fp.name, '') || ' ' || coalesce(fp.description, ''), '\s+')) as term
        from playlist_follows pf
        inner join playlists fp on fp.id = pf.playlist_id
        where pf.follower_user_id = ${userId}
      ) raw_terms
      where length(term) > 3
        and term not in ('movie', 'movies', 'show', 'shows', 'playlist', 'watch', 'best', 'with', 'from', 'that', 'this')
      limit 80
    ),
    playlist_metrics as (
      select
        p.*,
        up.handle as creator_handle,
        coalesce(
          nullif(up.display_name, ''),
          nullif(initcap(trim(regexp_replace(split_part(u.email, '@', 1), '[^a-zA-Z0-9]+', ' ', 'g'))), '')
        ) as creator_display_name,
        false as is_owner,
        false as expose_shared_slug,
        (
          select count(*)::int
          from playlist_follows pf
          where pf.playlist_id = p.id
        ) as follower_count,
        (
          select count(*)::int
          from playlist_likes pl
          where pl.playlist_id = p.id
        ) as like_count,
        exists (
          select 1
          from playlist_follows my_pf
          where my_pf.playlist_id = p.id
            and my_pf.follower_user_id = ${userId}
        ) as is_following,
        exists (
          select 1
          from playlist_likes my_pl
          where my_pl.playlist_id = p.id
            and my_pl.user_id = ${userId}
        ) as is_liked,
        exists (
          select 1
          from user_follows uf
          where uf.follower_user_id = ${userId}
            and uf.followed_user_id = p.owner_user_id
        ) as follows_creator,
        coalesce(
          json_agg(pm order by coalesce(pm.sort_order, 2147483647), pm.added_at desc) filter (where pm.id is not null),
          '[]'
        ) as movies,
        count(distinct matched_terms.term)::int as term_matches
      from playlists p
      left join user_profiles up on up.user_id = p.owner_user_id::text
      left join users u on u.id = p.owner_user_id
      left join playlist_movies pm on pm.playlist_id = p.id
      left join user_playlist_terms matched_terms
        on lower(
          coalesce(p.name, '') || ' ' ||
          coalesce(p.description, '') || ' ' ||
          coalesce(pm.title, '') || ' ' ||
          coalesce((
            select string_agg(value, ' ')
            from jsonb_array_elements_text(coalesce(pm.genres, '[]'::jsonb)) as value
          ), '')
        ) like '%' || matched_terms.term || '%'
      where p.visibility = 'public'
        and p.owner_user_id <> ${userId}
        and not exists (
          select 1
          from playlist_follows existing_follow
          where existing_follow.playlist_id = p.id
            and existing_follow.follower_user_id = ${userId}
        )
        and not (
          lower(p.name) like '%codex vercel curl add test%'
          or lower(p.name) like '%temporary production verification%'
          or lower(p.name) like '%production verification playlist%'
        )
      group by p.id, up.handle, up.display_name, u.email
    ),
    ranked as (
      select
        *,
        case
          when follows_creator then 'Because you follow this curator.'
          when term_matches > 0 then 'Because this matches playlists and titles you already save.'
          when follower_count > 0 then 'Popular with playlist followers.'
          when like_count > 0 then 'Liked by Flim users.'
          else 'A public playlist worth browsing.'
        end as reason,
        case
          when follows_creator then 'followed_curator'
          when term_matches > 0 then 'playlist_taste_match'
          when follower_count > 0 or like_count > 0 then 'playlist_popularity'
          else 'playlist_discovery'
        end as source_type,
        (
          term_matches * 18
          + case when follows_creator then 45 else 0 end
          + follower_count * 3
          + like_count * 4
          + least(jsonb_array_length(coalesce(movies::jsonb, '[]'::jsonb)), 30)
        )::numeric as score
      from playlist_metrics
    )
    select *
    from ranked
    order by score desc, updated_at desc
    limit ${limit}
  `;

  return rows.map(decoratePlaylistRecommendation);
}

async function getCuratorRecommendations(sql: any, userId: string, limit = 18) {
  const feed = await getCuratorDiscovery(sql, userId, "");
  return feed.sections.topCurators
    .filter((curator: any) => !curator.isFollowing)
    .slice(0, limit)
    .map(decorateCuratorRecommendation);
}

async function getTitleRecommendations(sql: any, mediaType: "movie" | "tv", tmdbId: number, userId: string | null) {
  const rows = await sql`
    with source_title as (
      select id, media_type, tmdb_id, title, genres
      from media_items
      where media_type = ${mediaType}
        and tmdb_id = ${tmdbId}
      limit 1
    ),
    saved_titles as (
      select distinct coalesce(pm.media_item_id, mi.id) as media_item_id
      from playlists p
      inner join playlist_movies pm on pm.playlist_id = p.id
      left join media_items mi on mi.media_type = coalesce(pm.media_type, 'movie') and mi.tmdb_id = pm.tmdb_id
      where ${userId}::uuid is not null
        and p.owner_user_id = ${userId}::uuid
    ),
    progress_titles as (
      select distinct media_item_id
      from user_show_progress
      where ${userId}::uuid is not null
        and user_id = ${userId}::uuid
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
        'title_playlist_graph'::text as source_type,
        source.id::text as source_id,
        ('Appears in public playlists with ' || source.title || '.') as reason,
        (92 + count(distinct pm_candidate.playlist_id) * 8)::numeric as score
      from source_title source
      inner join playlist_movies pm_source
        on pm_source.media_type = source.media_type
        and pm_source.tmdb_id = source.tmdb_id
      inner join playlists p
        on p.id = pm_source.playlist_id
        and p.visibility = 'public'
      inner join playlist_movies pm_candidate
        on pm_candidate.playlist_id = p.id
      inner join media_items candidate
        on candidate.media_type = coalesce(pm_candidate.media_type, 'movie')
        and candidate.tmdb_id = pm_candidate.tmdb_id
      where candidate.id <> source.id
        and candidate.tmdb_id <> source.tmdb_id
        and (
          ${userId}::uuid is null
          or not exists (select 1 from saved_titles st where st.media_item_id = candidate.id)
        )
        and (
          ${userId}::uuid is null
          or not exists (select 1 from progress_titles pt where pt.media_item_id = candidate.id)
        )
        and (
          ${userId}::uuid is null
          or not exists (select 1 from followed_titles ft where ft.user_id = ${userId}::uuid and ft.media_item_id = candidate.id)
        )
      group by candidate.id, source.id, source.title
    ),
    community_followed_titles as (
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
        'title_community_follow'::text as source_type,
        source.id::text as source_id,
        ('People who follow ' || source.title || ' also follow this.') as reason,
        (86 + count(distinct other_follow.user_id) * 7)::numeric as score
      from source_title source
      inner join followed_titles source_follow
        on source_follow.media_item_id = source.id
      inner join followed_titles other_follow
        on other_follow.user_id = source_follow.user_id
        and other_follow.media_item_id <> source.id
      inner join media_items candidate
        on candidate.id = other_follow.media_item_id
      where candidate.tmdb_id <> source.tmdb_id
        and (
          ${userId}::uuid is null
          or not exists (select 1 from saved_titles st where st.media_item_id = candidate.id)
        )
        and (
          ${userId}::uuid is null
          or not exists (select 1 from progress_titles pt where pt.media_item_id = candidate.id)
        )
        and (
          ${userId}::uuid is null
          or not exists (select 1 from followed_titles ft where ft.user_id = ${userId}::uuid and ft.media_item_id = candidate.id)
        )
      group by candidate.id, source.id, source.title
    ),
    genre_neighbors as (
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
        'title_genre_affinity'::text as source_type,
        genre_match.genre::text as source_id,
        ('Shares ' || genre_match.genre || ' with ' || source.title || '.') as reason,
        72::numeric as score
      from source_title source
      cross join lateral (
        select value::text as genre
        from jsonb_array_elements_text(coalesce(source.genres, '[]'::jsonb))
        limit 2
      ) genre_match
      inner join playlist_movies pm on true
      inner join playlists p on p.id = pm.playlist_id and p.visibility = 'public'
      inner join media_items candidate
        on candidate.media_type = coalesce(pm.media_type, 'movie')
        and candidate.tmdb_id = pm.tmdb_id
      where candidate.id <> source.id
        and candidate.tmdb_id <> source.tmdb_id
        and candidate.genres ? genre_match.genre
        and (
          ${userId}::uuid is null
          or not exists (select 1 from saved_titles st where st.media_item_id = candidate.id)
        )
        and (
          ${userId}::uuid is null
          or not exists (select 1 from progress_titles pt where pt.media_item_id = candidate.id)
        )
        and (
          ${userId}::uuid is null
          or not exists (select 1 from followed_titles ft where ft.user_id = ${userId}::uuid and ft.media_item_id = candidate.id)
        )
    ),
    all_recommendations as (
      select * from playlist_graph
      union all
      select * from community_followed_titles
      union all
      select * from genre_neighbors
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
    limit 12
  `;

  return rows as RecommendationRow[];
}

export default async function handler(request: any, response: any) {
  if (request.method !== "GET") return sendJson(response, 405, { error: "Method not allowed." });

  try {
    const sql = db();
    await ensureRecommendationTables(sql);
    const user = await getCurrentUser(sql, request);
    const mediaTypeParam = String(request.query?.mediaType || "");
    const tmdbIdParam = Number(request.query?.tmdbId);

    if ((mediaTypeParam === "movie" || mediaTypeParam === "tv") && Number.isFinite(tmdbIdParam)) {
      const rows = await getTitleRecommendations(sql, mediaTypeParam, tmdbIdParam, user?.id || null);
      return sendJson(response, 200, {
        recommendations: rows.map(mapRecommendation),
      });
    }

    if (!user) return sendJson(response, 401, { error: "Sign in to get recommendations." });

    const rows = await getRecommendations(sql, user.id);
    const playlistRows = await getPlaylistRecommendations(sql, user.id, 18).catch((error) => {
      console.error("playlist_recommendations_failed", error instanceof Error ? error.message : "Playlist recommendations failed.");
      return [];
    });
    const curatorRows = await getCuratorRecommendations(sql, user.id, 18).catch((error) => {
      console.error("curator_recommendations_failed", error instanceof Error ? error.message : "Curator recommendations failed.");
      return [];
    });
    await storeRecommendations(sql, user.id, rows);

    return sendJson(response, 200, {
      recommendations: rows.map(mapRecommendation),
      playlistRecommendations: playlistRows,
      curatorRecommendations: curatorRows,
      architecture: {
        primary: ["playlists", "curators"],
        future: ["collections", "now_watching"],
        supporting: ["titles"],
      },
      limits: {
        playlists: 6,
        curators: 6,
        titles: 12,
      },
    });
  } catch (error) {
    console.error("recommendations_failed", error instanceof Error ? error.message : "Recommendations failed.");
    return sendJson(response, 500, { error: "Unable to load recommendations right now." });
  }
}
