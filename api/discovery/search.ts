import { db, ensurePlaylistFollowsTable, ensurePlaylistLikesTable, ensureUserFollowsTable, ensureUserProfilesTable, getCurrentUser, mapPlaylist, sendJson } from "../_db.js";
import { ensureDirectorSeed } from "../_director.js";
import {
  findCatalogSearchResults,
  mapCatalogSearchResult,
  upsertMediaItems,
} from "../_mediaCatalog.js";
import { ensureTmdbCacheTables, fetchTmdbPersonSearch, fetchTmdbSearch, normalizeMovieQuery } from "../_tmdb.js";

const SEARCH_CACHE_DAYS = 7;
const MAX_TITLE_RESULTS = 12;
const MAX_PLAYLIST_RESULTS = 12;
const MAX_PROFILE_RESULTS = 8;
const MAX_ACTOR_RESULTS = 8;

function firstQueryValue(value: unknown) {
  return Array.isArray(value) ? String(value[0] || "") : String(value || "");
}

function mergeTitleResults(primary: any[], secondary: any[]) {
  const seen = new Set<string>();
  const merged: any[] = [];

  for (const item of [...primary, ...secondary]) {
    const key = `${item.mediaType || "movie"}-${item.tmdbId}`;
    if (!item.tmdbId || seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
    if (merged.length >= MAX_TITLE_RESULTS) break;
  }

  return merged;
}

async function searchTitles(sql: any, query: string) {
  const normalizedQuery = normalizeMovieQuery(query);
  const catalogResults = (await findCatalogSearchResults(sql, query, "both")).map(mapCatalogSearchResult);
  if (catalogResults.length >= 6) {
    return {
      items: catalogResults.slice(0, MAX_TITLE_RESULTS),
      source: "catalog",
    };
  }

  const cached = await sql`
    select response_json
    from tmdb_search_cache
    where normalized_query = ${normalizedQuery}
      and media_type = 'both'
      and expires_at > now()
    order by created_at desc
    limit 1
  `;

  if (cached[0]) {
    const cachedItems = cached[0].response_json || [];
    await upsertMediaItems(sql, cachedItems);
    return {
      items: mergeTitleResults(catalogResults, cachedItems),
      source: catalogResults.length ? "catalog_cache" : "cache",
    };
  }

  try {
    const freshItems = await fetchTmdbSearch(query, "both");
    await upsertMediaItems(sql, freshItems);
    await sql`
      insert into tmdb_search_cache (query, normalized_query, media_type, response_json, expires_at)
      values (${query}, ${normalizedQuery}, 'both', ${JSON.stringify(freshItems)}::jsonb, now() + (${SEARCH_CACHE_DAYS} * interval '1 day'))
      on conflict (media_type, normalized_query)
      do update set
        query = excluded.query,
        response_json = excluded.response_json,
        created_at = now(),
        expires_at = excluded.expires_at
    `;

    return {
      items: mergeTitleResults(catalogResults, freshItems),
      source: catalogResults.length ? "catalog_tmdb" : "tmdb",
    };
  } catch (error) {
    console.error("discovery_title_search_fallback", error instanceof Error ? error.message : "Title search import failed.");
    return {
      items: catalogResults.slice(0, MAX_TITLE_RESULTS),
      source: "catalog",
    };
  }
}

async function searchPublicPlaylists(sql: any, query: string, userId?: string) {
  const rows = await sql`
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
          and ${userId || null}::uuid is not null
          and my_pf.follower_user_id = ${userId || null}::uuid
      ) as is_following,
      exists (
        select 1
        from playlist_likes my_pl
        where my_pl.playlist_id = p.id
          and ${userId || null}::uuid is not null
          and my_pl.user_id = ${userId || null}::uuid
      ) as is_liked,
      coalesce(
        json_agg(pm order by coalesce(pm.sort_order, 2147483647), pm.added_at desc) filter (where pm.id is not null),
        '[]'
      ) as movies,
      case
        when lower(p.name) = lower(${query}) then 0
        when lower(p.name) like lower(${`${query}%`}) then 1
        when lower(p.name) like lower(${`%${query}%`}) then 2
        when lower(coalesce(up.display_name, '')) like lower(${`%${query}%`}) then 3
        when lower(coalesce(up.handle, '')) like lower(${`%${query}%`}) then 4
        else 5
      end as search_rank
    from playlists p
    left join user_profiles up on up.user_id = p.owner_user_id::text
    left join users u on u.id = p.owner_user_id
    left join playlist_movies pm on pm.playlist_id = p.id
    where p.visibility = 'public'
      and not (
        lower(p.name) like '%codex vercel curl add test%'
        or lower(p.name) like '%temporary production verification%'
        or lower(p.name) like '%production verification playlist%'
      )
      and (
        p.name ilike ${`%${query}%`}
        or p.description ilike ${`%${query}%`}
        or coalesce(up.display_name, '') ilike ${`%${query}%`}
        or coalesce(up.handle, '') ilike ${`%${query}%`}
        or exists (
          select 1
          from playlist_movies pm_match
          where pm_match.playlist_id = p.id
            and pm_match.title ilike ${`%${query}%`}
        )
      )
    group by p.id, up.handle, up.display_name, u.email
    order by search_rank asc, like_count desc, follower_count desc, p.updated_at desc
    limit ${MAX_PLAYLIST_RESULTS}
  `;

  return rows.map((playlist: any) => mapPlaylist(playlist, playlist.movies || []));
}

async function searchProfiles(sql: any, query: string) {
  const rows = await sql`
    select
      up.display_name,
      up.handle,
      up.bio,
      up.profile_image_url,
      up.created_at,
      count(distinct p.id)::int as playlist_count,
      count(pm.id)::int as title_count,
      (
        select count(*)::int
        from user_follows uf
        where uf.followed_user_id::text = up.user_id
      ) as follower_count
    from user_profiles up
    left join playlists p on p.owner_user_id::text = up.user_id and p.visibility = 'public'
    left join playlist_movies pm on pm.playlist_id = p.id
    where up.handle <> ''
      and (
        up.handle ilike ${`%${query}%`}
        or up.display_name ilike ${`%${query}%`}
        or coalesce(up.bio, '') ilike ${`%${query}%`}
      )
    group by up.id
    order by
      case
        when lower(up.handle) = lower(${query}) then 0
        when lower(up.display_name) = lower(${query}) then 1
        when lower(up.handle) like lower(${`${query}%`}) then 2
        when lower(up.display_name) like lower(${`${query}%`}) then 3
        else 4
      end,
      count(distinct p.id) desc,
      (
        select count(*)::int
        from user_follows uf
        where uf.followed_user_id::text = up.user_id
      ) desc,
      up.updated_at desc
    limit ${MAX_PROFILE_RESULTS}
  `;

  return rows.map((row: any) => ({
    displayName: row.display_name || row.handle,
    handle: row.handle,
    bio: row.bio || "",
    profileImageUrl: row.profile_image_url || "",
    playlistCount: Number(row.playlist_count || 0),
    titleCount: Number(row.title_count || 0),
    followerCount: Number(row.follower_count || 0),
  }));
}

async function searchActors(sql: any, query: string) {
  const rows = await sql`
    select tmdb_id, name, profile_url, known_for_department, popularity, source_payload
    from people
    where tmdb_id is not null
      and name ilike ${`%${query}%`}
    order by
      case
        when lower(name) = lower(${query}) then 0
        when lower(name) like lower(${`${query}%`}) then 1
        else 2
      end,
      popularity desc nulls last,
      updated_at desc
    limit ${MAX_ACTOR_RESULTS}
  `;
  const catalogActors = rows.map((row: any) => ({
    tmdbId: row.tmdb_id,
    name: row.name,
    profileUrl: row.profile_url || undefined,
    knownForDepartment: row.known_for_department || undefined,
    knownFor: Array.isArray(row.source_payload?.knownFor) ? row.source_payload.knownFor : [],
    popularity: Number(row.popularity || 0),
  }));

  try {
    const freshActors = await fetchTmdbPersonSearch(query);
    const seen = new Set<string>();
    return [...catalogActors, ...freshActors]
      .filter((actor) => {
        const key = String(actor.tmdbId);
        if (!actor.tmdbId || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, MAX_ACTOR_RESULTS);
  } catch (error) {
    console.error("discovery_actor_search_fallback", error instanceof Error ? error.message : "Actor search failed.");
    return catalogActors.slice(0, MAX_ACTOR_RESULTS);
  }
}

export default async function handler(request: any, response: any) {
  if (request.method !== "GET") return sendJson(response, 405, { error: "Method not allowed." });

  try {
    const query = firstQueryValue(request.query.q).trim();
    if (!query) {
      return sendJson(response, 200, {
        query,
        titles: [],
        playlists: [],
        profiles: [],
        actors: [],
        titleSource: "empty",
      });
    }

    const sql = db();
    await ensureUserProfilesTable(sql);
    await ensurePlaylistFollowsTable(sql);
    await ensurePlaylistLikesTable(sql);
    await ensureUserFollowsTable(sql);
    await ensureTmdbCacheTables(sql);
    await ensureDirectorSeed(sql).catch((error) => {
      console.error("director_seed_failed", error instanceof Error ? error.message : "Director seed failed");
    });

    const user = await getCurrentUser(sql, request);
    const [titleResults, playlists, profiles, actors] = await Promise.all([
      searchTitles(sql, query),
      searchPublicPlaylists(sql, query, user?.id),
      searchProfiles(sql, query),
      searchActors(sql, query),
    ]);

    response.setHeader("X-Flim-Discovery-Titles", titleResults.source);
    return sendJson(response, 200, {
      query,
      titles: titleResults.items,
      playlists,
      profiles,
      actors,
      titleSource: titleResults.source,
    });
  } catch (error) {
    console.error("discovery_search_failed", error instanceof Error ? error.message : "Discovery search failed.");
    return sendJson(response, 500, { error: "Discovery search failed. Please try again." });
  }
}
