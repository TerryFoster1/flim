import { db, ensureFollowTitleTables, getCurrentUser, sendJson } from "./_db.js";
import { ensureMediaCatalogTables } from "./_mediaCatalog.js";
import { ensureProviderAvailabilityTables } from "./_providers.js";

function normalizeFilter(value: string | null) {
  if (value === "movie" || value === "tv" || value === "both") return value;
  return "both";
}

function normalizeWindow(value: string | null) {
  if (value === "month" || value === "quarter" || value === "year" || value === "all") return value;
  return "all";
}

function normalizeAudience(value: string | null) {
  if (value === "following") return "following";
  return "all";
}

function mapUpcoming(row: any) {
  const releaseDate = row.release_date ? new Date(row.release_date).toISOString() : undefined;
  const payload = row.source_payload || {};
  return {
    mediaItemId: row.media_item_id,
    mediaType: row.media_type === "tv" ? "tv" : "movie",
    tmdbId: Number(row.tmdb_id),
    title: row.title,
    overview: row.overview || "No overview is available yet.",
    posterUrl: row.poster_url || undefined,
    backdropUrl: row.backdrop_url || undefined,
    releaseDate,
    releaseYear: row.year || releaseDate?.slice(0, 4) || undefined,
    status: row.status || undefined,
    seasonCount: row.season_count || payload.seasonCount || undefined,
    episodeCount: row.episode_count || payload.episodeCount || undefined,
    genres: Array.isArray(row.genres) ? row.genres : [],
    genreIds: Array.isArray(payload.genreIds) ? payload.genreIds : [],
    isFollowing: Boolean(row.is_following),
    latestEventType: row.latest_event_type || undefined,
    latestEventAt: row.latest_event_at || undefined,
    latestEventTitle: row.latest_event_title || undefined,
    latestEventBody: row.latest_event_body || undefined,
    availabilityKnown: Boolean(row.availability_count && Number(row.availability_count) > 0),
    providerNames: Array.isArray(row.provider_names) ? row.provider_names.filter(Boolean) : [],
    releaseContext: row.release_context || undefined,
  };
}

function mapReleaseEvent(row: any) {
  return {
    eventType: row.event_type,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
    mediaType: row.media_type === "tv" ? "tv" : "movie",
    tmdbId: Number(row.tmdb_id),
    eventTitle: row.event_title || undefined,
    body: row.body || undefined,
    title: row.title,
    posterUrl: row.poster_url || undefined,
    releaseDate: row.release_date ? new Date(row.release_date).toISOString() : undefined,
    oldValue: row.old_value ?? undefined,
    newValue: row.new_value ?? undefined,
    context: row.context || undefined,
  };
}

export default async function handler(request: any, response: any) {
  if (request.method !== "GET") return sendJson(response, 405, { error: "Method not allowed." });

  try {
    const url = new URL(request.url || "/api/upcoming", "https://www.flim.ca");
    const mediaType = normalizeFilter(url.searchParams.get("type"));
    const windowFilter = normalizeWindow(url.searchParams.get("window"));
    const audience = normalizeAudience(url.searchParams.get("audience"));
    const limit = Math.max(10, Math.min(80, Number(url.searchParams.get("limit")) || 60));
    const sectionLimit = Math.max(10, Math.min(24, Number(url.searchParams.get("sectionLimit")) || 10));
    const sql = db();

    await ensureMediaCatalogTables(sql);
    await ensureFollowTitleTables(sql);
    await ensureProviderAvailabilityTables(sql);
    const user = await getCurrentUser(sql, request);

    const rows = await sql`
      with title_rows as (
        select
          mi.id as media_item_id,
          mi.media_type,
          mi.tmdb_id,
          mi.title,
          mi.overview,
          mi.poster_url,
          mi.backdrop_url,
          coalesce(rt.release_date, mi.release_date) as release_date,
          coalesce(mi.year, to_char(coalesce(rt.release_date, mi.release_date), 'YYYY')) as year,
          coalesce(rt.status, mi.status) as status,
          rt.season_count,
          rt.episode_count,
          mi.genres,
          mi.source_payload,
          exists (
            select 1
            from followed_titles ft
            where ft.media_item_id = mi.id
              and ft.user_id = ${user?.id || null}
          ) as is_following,
          (
            select re.event_type
            from release_events re
            where re.media_item_id = mi.id
            order by re.created_at desc
            limit 1
          ) as latest_event_type,
          (
            select re.created_at
            from release_events re
            where re.media_item_id = mi.id
            order by re.created_at desc
            limit 1
          ) as latest_event_at,
          (
            select re.title
            from release_events re
            where re.media_item_id = mi.id
            order by re.created_at desc
            limit 1
          ) as latest_event_title,
          (
            select re.body
            from release_events re
            where re.media_item_id = mi.id
            order by re.created_at desc
            limit 1
          ) as latest_event_body,
          (
            select count(*)::int
            from title_availability ta
            where ta.media_type = mi.media_type
              and ta.tmdb_id = mi.tmdb_id
              and ta.expires_at > now()
          ) as availability_count
          ,
          (
            select coalesce(array_agg(distinct ta.provider_name order by ta.provider_name), array[]::text[])
            from title_availability ta
            where ta.media_type = mi.media_type
              and ta.tmdb_id = mi.tmdb_id
              and ta.expires_at > now()
          ) as provider_names,
          case
            when rt.upcoming then 'Tracked as an upcoming release.'
            when coalesce(rt.release_date, mi.release_date) >= current_date then 'Release date is saved in Flim.'
            when exists (
              select 1
              from release_events re
              where re.media_item_id = mi.id
                and re.created_at >= now() - interval '60 days'
            ) then 'Recent release intelligence update.'
            else 'Saved release date from the media catalog.'
          end as release_context
        from media_items mi
        left join release_tracking rt on rt.media_item_id = mi.id
        where (${mediaType} = 'both' or mi.media_type = ${mediaType})
          and (
            ${audience} = 'all'
            or (
              ${audience} = 'following'
              and ${user?.id || null}::uuid is not null
              and exists (
                select 1
                from followed_titles ft
                where ft.media_item_id = mi.id
                  and ft.user_id = ${user?.id || null}::uuid
              )
            )
          )
          and coalesce(rt.release_date, mi.release_date) is not null
          and coalesce(rt.release_date, mi.release_date) >= current_date - interval '7 days'
          and (
            ${windowFilter} = 'all'
            or (${windowFilter} = 'month' and coalesce(rt.release_date, mi.release_date) < current_date + interval '1 month')
            or (${windowFilter} = 'quarter' and coalesce(rt.release_date, mi.release_date) < current_date + interval '3 months')
            or (${windowFilter} = 'year' and coalesce(rt.release_date, mi.release_date) < current_date + interval '1 year')
          )
      )
      select *
      from title_rows
      order by release_date asc, latest_event_at desc nulls last, title asc
      limit ${limit}
    `;

    const announcedEvents = await sql`
      select
        re.event_type,
        re.created_at,
        re.media_type,
        re.tmdb_id,
        re.title as event_title,
        re.body,
        rt.release_date,
        mi.title,
        mi.poster_url,
        case
          when re.event_type = 'trailer_released' then 'A trailer event was detected by Release Intelligence.'
          when re.event_type = 'streaming_available' then 'Provider availability changed for this title.'
          when re.event_type in ('season_announced', 'season_released', 'episode_released') then 'TV release intelligence detected a new update.'
          else 'Recent release intelligence update.'
        end as context
      from release_events re
      inner join media_items mi on mi.id = re.media_item_id
      where re.event_type in (
        'season_announced',
        'season_released',
        'title_status_changed'
      )
        and re.created_at >= now() - interval '60 days'
        and (${mediaType} = 'both' or re.media_type = ${mediaType})
        and (
          ${audience} = 'all'
          or (
            ${audience} = 'following'
            and ${user?.id || null}::uuid is not null
            and exists (
              select 1
              from followed_titles ft
              where ft.media_item_id = mi.id
                and ft.user_id = ${user?.id || null}::uuid
            )
          )
        )
      order by re.created_at desc
      limit ${Math.max(sectionLimit, 24)}
    `;

    const trailerEvents = await sql`
      select
        re.event_type,
        re.created_at,
        re.media_type,
        re.tmdb_id,
        re.title as event_title,
        re.body,
        rt.release_date,
        mi.title,
        mi.poster_url,
        'A trailer or first look was detected by Release Intelligence.' as context
      from release_events re
      inner join media_items mi on mi.id = re.media_item_id
      left join release_tracking rt on rt.media_item_id = mi.id
      where re.event_type = 'trailer_released'
        and re.created_at >= now() - interval '120 days'
        and (${mediaType} = 'both' or re.media_type = ${mediaType})
        and (
          ${audience} = 'all'
          or (
            ${audience} = 'following'
            and ${user?.id || null}::uuid is not null
            and exists (
              select 1
              from followed_titles ft
              where ft.media_item_id = mi.id
                and ft.user_id = ${user?.id || null}::uuid
            )
          )
        )
      order by re.created_at desc
      limit ${Math.max(sectionLimit, 24)}
    `;

    const delayedEvents = await sql`
      select
        re.event_type,
        re.created_at,
        re.media_type,
        re.tmdb_id,
        re.title as event_title,
        re.body,
        re.old_value,
        re.new_value,
        rt.release_date,
        mi.title,
        mi.poster_url,
        'Release Intelligence detected a later date than the previous saved date.' as context
      from release_events re
      inner join media_items mi on mi.id = re.media_item_id
      left join release_tracking rt on rt.media_item_id = mi.id
      where re.event_type in ('release_date_changed', 'season_release_changed')
        and re.created_at >= now() - interval '90 days'
        and (${mediaType} = 'both' or re.media_type = ${mediaType})
        and (
          ${audience} = 'all'
          or (
            ${audience} = 'following'
            and ${user?.id || null}::uuid is not null
            and exists (
              select 1
              from followed_titles ft
              where ft.media_item_id = mi.id
                and ft.user_id = ${user?.id || null}::uuid
            )
          )
        )
        and (re.old_value #>> '{}') ~ '^\\d{4}-\\d{2}-\\d{2}'
        and (re.new_value #>> '{}') ~ '^\\d{4}-\\d{2}-\\d{2}'
        and (re.new_value #>> '{}')::date > (re.old_value #>> '{}')::date
      order by re.created_at desc
      limit ${Math.max(sectionLimit, 24)}
    `;

    const items = rows.map(mapUpcoming);
    const recentAnnouncements = announcedEvents.map(mapReleaseEvent);
    const recentDelays = delayedEvents.map(mapReleaseEvent);
    const newTrailers = trailerEvents.map(mapReleaseEvent);
    const upcomingMovies = items.filter((item: any) => item.mediaType === "movie");
    const upcomingTv = items.filter((item: any) => item.mediaType === "tv");
    const streamingSoon = items.filter((item: any) => item.availabilityKnown);
    const now = new Date();
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const releasingThisMonth = items.filter((item: any) => {
      const date = item.releaseDate ? new Date(item.releaseDate) : null;
      return date && Number.isFinite(date.getTime()) && date >= now && date < endOfMonth;
    });

    return sendJson(response, 200, {
      items,
      sections: {
        following: items.filter((item: any) => item.isFollowing),
        comingSoon: items,
        upcomingMovies,
        upcomingTv,
        releasingThisMonth,
        streamingSoon,
        recentlyAnnounced: recentAnnouncements,
        recentlyDelayed: recentDelays,
        newTrailers,
      },
      sectionLimit,
      filters: { mediaType, window: windowFilter, audience },
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("upcoming_releases_failed", error instanceof Error ? error.message : "Upcoming releases failed.");
    return sendJson(response, 500, { error: "Unable to load upcoming releases. Please try again." });
  }
}
