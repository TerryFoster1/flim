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
const MAX_COLLECTION_RESULTS = 8;
const MAX_ACTOR_RESULTS = 8;

const curatedCollectionSearchSeeds = [
  { slug: "back-to-the-future", title: "Back to the Future Collection", category: "Time Travel", keywords: ["time travel", "sci-fi", "science fiction", "80s"] },
  { slug: "jurassic-park", title: "Jurassic Park Collection", category: "Adventure", keywords: ["dinosaurs", "adventure", "sci-fi", "science fiction"] },
  { slug: "mission-impossible", title: "Mission: Impossible Collection", category: "Action", keywords: ["action", "spy", "espionage", "tom cruise"] },
  { slug: "harry-potter", title: "Harry Potter Collection", category: "Fantasy", keywords: ["fantasy", "magic", "wizarding world"] },
  { slug: "lord-of-the-rings", title: "The Lord of the Rings Collection", category: "Fantasy", keywords: ["fantasy", "middle earth"] },
  { slug: "star-wars", title: "Star Wars Collection", category: "Sci-Fi", keywords: ["sci-fi", "sci fi", "science fiction", "space opera"] },
  { slug: "fast-and-furious", title: "Fast & Furious Collection", category: "Action", keywords: ["cars", "racing", "action"] },
  { slug: "avengers", title: "The Avengers Collection", category: "Marvel", keywords: ["marvel", "superhero", "mcu", "comic book"] },
  { slug: "captain-america", title: "Captain America Collection", category: "Marvel", keywords: ["marvel", "superhero", "mcu", "comic book"] },
  { slug: "toy-story", title: "Toy Story Collection", category: "Pixar", keywords: ["pixar", "animation", "family", "kids"] },
];

function firstQueryValue(value: unknown) {
  return Array.isArray(value) ? String(value[0] || "") : String(value || "");
}

function normalizeSearchText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function expandedSearchTerms(query: string) {
  const normalized = normalizeSearchText(query);
  const terms = new Set([normalized]);
  if (normalized.includes("sci fi") || normalized.includes("scifi")) {
    terms.add("sci-fi");
    terms.add("science fiction");
  }
  if (normalized.includes("science fiction")) {
    terms.add("sci-fi");
    terms.add("sci fi");
  }
  if (normalized.includes("christmas")) {
    terms.add("holiday");
    terms.add("family");
  }
  if (normalized.includes("zombie")) {
    terms.add("zombies");
    terms.add("undead");
    terms.add("apocalypse");
  }
  if (normalized.includes("disaster")) {
    terms.add("apocalypse");
    terms.add("end of the world");
  }
  if (normalized.includes("anime")) {
    terms.add("animation");
    terms.add("japanese animation");
  }
  if (normalized.includes("oscar")) {
    terms.add("award");
    terms.add("best picture");
  }
  return [...terms].filter(Boolean);
}

function searchPatterns(query: string) {
  return expandedSearchTerms(query).map((term) => `%${term}%`);
}

function collectionSearchTerms(query: string) {
  const normalized = normalizeSearchText(query);
  const terms = new Set([normalized]);
  if (normalized.includes("sci fi") || normalized.includes("scifi")) {
    terms.add("sci-fi");
    terms.add("science fiction");
  }
  if (normalized.includes("science fiction")) {
    terms.add("sci-fi");
    terms.add("sci fi");
  }
  if (normalized.includes("marvel")) terms.add("mcu");
  return [...terms].filter(Boolean);
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
  const patterns = searchPatterns(query);
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
        when lower(p.name) like any(${patterns}) then 2
        when lower(coalesce(p.description, '')) like any(${patterns}) then 3
        when lower(coalesce(up.display_name, '')) like any(${patterns}) then 4
        when lower(coalesce(up.handle, '')) like any(${patterns}) then 5
        else 6
      end as search_rank
    from playlists p
    left join user_profiles up on up.user_id = p.owner_user_id::text
    left join users u on u.id = p.owner_user_id
    left join playlist_movies pm on pm.playlist_id = p.id
    left join media_items mi on mi.media_type = coalesce(pm.media_type, 'movie') and mi.tmdb_id = pm.tmdb_id
    where p.visibility = 'public'
      and not (
        lower(p.name) like '%codex vercel curl add test%'
        or lower(p.name) like '%temporary production verification%'
        or lower(p.name) like '%production verification playlist%'
      )
      and (
        lower(p.name) like any(${patterns})
        or lower(coalesce(p.description, '')) like any(${patterns})
        or lower(coalesce(up.display_name, '')) like any(${patterns})
        or lower(coalesce(up.handle, '')) like any(${patterns})
        or exists (
          select 1
          from playlist_movies pm_match
          left join media_items mi_match on mi_match.media_type = coalesce(pm_match.media_type, 'movie') and mi_match.tmdb_id = pm_match.tmdb_id
          where pm_match.playlist_id = p.id
            and (
              lower(pm_match.title) like any(${patterns})
              or lower(coalesce(pm_match.overview, '')) like any(${patterns})
              or lower(coalesce(mi_match.title, '')) like any(${patterns})
              or lower(coalesce(mi_match.overview, '')) like any(${patterns})
              or lower(coalesce(mi_match.genres::text, '')) like any(${patterns})
            )
        )
      )
    group by p.id, up.handle, up.display_name, u.email
    order by search_rank asc, like_count desc, follower_count desc, p.updated_at desc
    limit ${MAX_PLAYLIST_RESULTS}
  `;

  return rows.map((playlist: any) => mapPlaylist(playlist, playlist.movies || []));
}

async function searchProfiles(sql: any, query: string) {
  const patterns = searchPatterns(query);
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
      ) as follower_count,
      (
        select count(*)::int
        from playlist_follows pf
        join playlists followed_playlist on followed_playlist.id = pf.playlist_id
        where followed_playlist.owner_user_id::text = up.user_id
          and followed_playlist.visibility = 'public'
      ) as playlist_follower_count,
      (
        select count(*)::int
        from playlist_likes pl
        join playlists liked_playlist on liked_playlist.id = pl.playlist_id
        where liked_playlist.owner_user_id::text = up.user_id
          and liked_playlist.visibility = 'public'
      ) as playlist_like_count
    from user_profiles up
    left join playlists p on p.owner_user_id::text = up.user_id and p.visibility = 'public'
    left join playlist_movies pm on pm.playlist_id = p.id
    left join media_items mi on mi.media_type = coalesce(pm.media_type, 'movie') and mi.tmdb_id = pm.tmdb_id
    where up.handle <> ''
      and (
        lower(up.handle) like any(${patterns})
        or lower(up.display_name) like any(${patterns})
        or lower(coalesce(up.bio, '')) like any(${patterns})
        or lower(coalesce(p.name, '')) like any(${patterns})
        or lower(coalesce(p.description, '')) like any(${patterns})
        or lower(coalesce(pm.title, '')) like any(${patterns})
        or lower(coalesce(mi.genres::text, '')) like any(${patterns})
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
    playlistFollowerCount: Number(row.playlist_follower_count || 0),
    playlistLikeCount: Number(row.playlist_like_count || 0),
  }));
}

async function searchCollections(sql: any, query: string) {
  const terms = collectionSearchTerms(query);
  const patterns = terms.map((term) => `%${term}%`);
  const rows = await safeRows(sql`
    select
      mc.slug,
      mc.title,
      mc.overview,
      mc.poster_url,
      mc.backdrop_url,
      mc.category,
      count(mci.id)::int as title_count,
      count(mci.id) filter (where mci.media_type = 'movie')::int as movie_count,
      count(mci.id) filter (where mci.media_type = 'tv')::int as tv_count,
      max(mci.release_date) as latest_release_date,
      case
        when lower(mc.title) = lower(${query}) then 0
        when lower(mc.title) like lower(${`${query}%`}) then 1
        when lower(mc.title) like any(${patterns}) then 2
        when lower(coalesce(mc.category, '')) like any(${patterns}) then 3
        else 4
      end as search_rank
    from media_collections mc
    left join media_collection_items mci on mci.collection_id = mc.id
    where
      lower(mc.title) like any(${patterns})
      or lower(coalesce(mc.overview, '')) like any(${patterns})
      or lower(coalesce(mc.category, '')) like any(${patterns})
      or exists (
        select 1
        from media_collection_items item_match
        where item_match.collection_id = mc.id
          and (
            lower(item_match.title) like any(${patterns})
            or lower(coalesce(item_match.overview, '')) like any(${patterns})
          )
      )
    group by mc.id
    order by search_rank asc, title_count desc, mc.updated_at desc
    limit ${MAX_COLLECTION_RESULTS}
  `);
  const bySlug = new Map<string, any>();
  for (const row of rows) {
    bySlug.set(String(row.slug), {
      slug: row.slug,
      title: row.title,
      overview: row.overview || "",
      posterUrl: row.poster_url || "",
      backdropUrl: row.backdrop_url || "",
      category: row.category || "",
      titleCount: Number(row.title_count || 0),
      movieCount: Number(row.movie_count || 0),
      tvCount: Number(row.tv_count || 0),
      latestReleaseDate: row.latest_release_date || undefined,
    });
  }

  for (const seed of curatedCollectionSearchSeeds) {
    const searchable = [seed.title, seed.category, ...seed.keywords].join(" ").toLowerCase();
    if (!terms.some((term) => searchable.includes(term)) || bySlug.has(seed.slug)) continue;
    bySlug.set(seed.slug, {
      slug: seed.slug,
      title: seed.title,
      overview: "",
      posterUrl: "",
      backdropUrl: "",
      category: seed.category,
      titleCount: 0,
      movieCount: 0,
      tvCount: 0,
    });
  }

  return [...bySlug.values()].slice(0, MAX_COLLECTION_RESULTS);
}

async function safeRows(query: Promise<any[]>) {
  try {
    return await query;
  } catch (error) {
    const message = error instanceof Error ? error.message : String((error as any)?.message || "");
    if (message.includes("does not exist") || message.includes("relation") || message.includes("column")) return [];
    throw error;
  }
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
        collections: [],
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
    const [titleResults, playlists, profiles, collections, actors] = await Promise.all([
      searchTitles(sql, query),
      searchPublicPlaylists(sql, query, user?.id),
      searchProfiles(sql, query),
      searchCollections(sql, query),
      searchActors(sql, query),
    ]);

    response.setHeader("X-Flim-Discovery-Titles", titleResults.source);
    return sendJson(response, 200, {
      query,
      titles: titleResults.items,
      playlists,
      profiles,
      collections,
      actors,
      titleSource: titleResults.source,
    });
  } catch (error) {
    console.error("discovery_search_failed", error instanceof Error ? error.message : "Discovery search failed.");
    return sendJson(response, 500, { error: "Discovery search failed. Please try again." });
  }
}
