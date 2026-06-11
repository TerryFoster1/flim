import { db, mapPlaylist, sendJson } from "../_db.js";
import { ensureMediaCatalogTables } from "../_mediaCatalog.js";
import { ensureTmdbCacheTables, fetchTmdbPersonDetails, fetchTmdbPersonSearch, normalizeMovieQuery } from "../_tmdb.js";

const PERSON_CACHE_DAYS = 30;
const PERSON_SEARCH_CACHE_DAYS = 14;

function actorPath(request: any) {
  const pathname = new URL(request.url || "", "https://www.flim.ca").pathname;
  const fromPath = pathname.split("/api/actors/").pop()?.split("?")[0];
  if (fromPath && fromPath !== pathname) return fromPath;
  const value = request.query.actor;
  return Array.isArray(value) ? value.map(String).join("/") : String(value || "");
}

async function ensureActorTables(sql: any) {
  await ensureMediaCatalogTables(sql);
  await ensureTmdbCacheTables(sql);
  await sql`
    create table if not exists tmdb_person_cache (
      id uuid primary key default gen_random_uuid(),
      tmdb_id integer not null unique,
      response_json jsonb not null,
      created_at timestamptz not null default now(),
      expires_at timestamptz not null
    )
  `;
  await sql`create index if not exists tmdb_person_cache_expires_at_idx on tmdb_person_cache (expires_at)`;
  await sql`
    create table if not exists tmdb_person_search_cache (
      id uuid primary key default gen_random_uuid(),
      query text not null,
      normalized_query text not null unique,
      response_json jsonb not null,
      created_at timestamptz not null default now(),
      expires_at timestamptz not null
    )
  `;
  await sql`create index if not exists tmdb_person_search_cache_normalized_query_idx on tmdb_person_search_cache (normalized_query)`;
  await sql`create index if not exists tmdb_person_search_cache_expires_at_idx on tmdb_person_search_cache (expires_at)`;
  await sql`alter table people add column if not exists biography text`;
  await sql`alter table people add column if not exists birth_date date`;
  await sql`alter table people add column if not exists place_of_birth text`;
  await sql`alter table people add column if not exists popularity numeric`;
  await sql`alter table people add column if not exists source_payload jsonb not null default '{}'::jsonb`;
}

async function upsertActor(sql: any, actor: any) {
  await sql`
    insert into people (
      tmdb_id,
      name,
      profile_url,
      known_for_department,
      biography,
      birth_date,
      place_of_birth,
      popularity,
      source_payload,
      updated_at
    )
    values (
      ${actor.tmdbId},
      ${actor.name},
      ${actor.profileUrl || null},
      ${actor.knownForDepartment || null},
      ${actor.biography || null},
      ${actor.birthDate || null},
      ${actor.placeOfBirth || null},
      ${actor.popularity || null},
      ${JSON.stringify({
        knownFor: actor.knownFor || [],
        movieCredits: actor.movieCredits || [],
        tvCredits: actor.tvCredits || [],
      })}::jsonb,
      now()
    )
    on conflict (tmdb_id)
    do update set
      name = excluded.name,
      profile_url = coalesce(excluded.profile_url, people.profile_url),
      known_for_department = coalesce(excluded.known_for_department, people.known_for_department),
      biography = coalesce(excluded.biography, people.biography),
      birth_date = coalesce(excluded.birth_date, people.birth_date),
      place_of_birth = coalesce(excluded.place_of_birth, people.place_of_birth),
      popularity = coalesce(excluded.popularity, people.popularity),
      source_payload = people.source_payload || excluded.source_payload,
      updated_at = now()
  `;
}

function allCredits(actor: any) {
  return [...(actor.movieCredits || []), ...(actor.tvCredits || [])]
    .filter((credit) => credit.tmdbId && credit.mediaType)
    .slice(0, 80)
    .map((credit) => ({
      tmdb_id: credit.tmdbId,
      media_type: credit.mediaType,
    }));
}

async function featuredPlaylists(sql: any, actor: any) {
  const credits = allCredits(actor);
  if (credits.length === 0) return [];

  const rows = await sql`
    with actor_titles as (
      select *
      from jsonb_to_recordset(${JSON.stringify(credits)}::jsonb)
        as x(tmdb_id integer, media_type text)
    )
    select
      p.*,
      up.handle as creator_handle,
      coalesce(
        nullif(up.display_name, ''),
        nullif(initcap(trim(regexp_replace(split_part(u.email, '@', 1), '[^a-zA-Z0-9]+', ' ', 'g'))), '')
      ) as creator_display_name,
      false as is_owner,
      false as expose_shared_slug,
      false as is_following,
      false as is_liked,
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
      coalesce(
        json_agg(pm order by coalesce(pm.sort_order, 2147483647), pm.added_at desc) filter (where pm.id is not null),
        '[]'
      ) as movies,
      count(distinct pm_match.id)::int as matched_title_count
    from playlists p
    join playlist_movies pm_match on pm_match.playlist_id = p.id
    join actor_titles at on at.tmdb_id = pm_match.tmdb_id and at.media_type = coalesce(pm_match.media_type, 'movie')
    left join user_profiles up on up.user_id = p.owner_user_id::text
    left join users u on u.id = p.owner_user_id
    left join playlist_movies pm on pm.playlist_id = p.id
    where p.visibility = 'public'
    group by p.id, up.handle, up.display_name, u.email
    order by matched_title_count desc, follower_count desc, like_count desc, p.updated_at desc
    limit 8
  `;

  return rows.map((row: any) => {
    const seenMovies = new Set<string>();
    const uniqueMovies = (row.movies || []).filter((movie: any) => {
      const key = String(movie.id || `${movie.media_type || "movie"}-${movie.tmdb_id}`);
      if (seenMovies.has(key)) return false;
      seenMovies.add(key);
      return true;
    });
    return mapPlaylist(row, uniqueMovies);
  });
}

async function relatedActors(sql: any, actorId: number) {
  const rows = await sql`
    select
      related.tmdb_id,
      related.name,
      related.profile_url,
      related.known_for_department,
      related.popularity,
      count(distinct mp_self.media_item_id)::int as shared_title_count
    from people actor
    join media_people mp_self on mp_self.person_id = actor.id
    join media_people mp_related on mp_related.media_item_id = mp_self.media_item_id
    join people related on related.id = mp_related.person_id
    where actor.tmdb_id = ${actorId}
      and related.tmdb_id <> ${actorId}
      and mp_related.role = 'cast'
    group by related.id
    order by shared_title_count desc, related.popularity desc nulls last, related.name asc
    limit 8
  `;

  return rows.map((row: any) => ({
    tmdbId: row.tmdb_id,
    name: row.name,
    profileUrl: row.profile_url || undefined,
    knownForDepartment: row.known_for_department || undefined,
    popularity: Number(row.popularity || 0),
  }));
}

async function handleSearch(sql: any, request: any, response: any) {
  const query = String(Array.isArray(request.query.q) ? request.query.q[0] : request.query.q || "").trim();
  const normalizedQuery = normalizeMovieQuery(query);
  if (!normalizedQuery) return sendJson(response, 200, []);

  const cached = await sql`
    select response_json
    from tmdb_person_search_cache
    where normalized_query = ${normalizedQuery}
      and expires_at > now()
    order by created_at desc
    limit 1
  `;
  if (cached[0]) {
    response.setHeader("X-Flim-Actor-Search-Cache", "HIT");
    return sendJson(response, 200, cached[0].response_json || []);
  }

  const actors = await fetchTmdbPersonSearch(query);
  await sql`
    insert into tmdb_person_search_cache (query, normalized_query, response_json, expires_at)
    values (${query}, ${normalizedQuery}, ${JSON.stringify(actors)}::jsonb, now() + (${PERSON_SEARCH_CACHE_DAYS} * interval '1 day'))
    on conflict (normalized_query)
    do update set
      query = excluded.query,
      response_json = excluded.response_json,
      created_at = now(),
      expires_at = excluded.expires_at
  `;
  response.setHeader("X-Flim-Actor-Search-Cache", "MISS");
  return sendJson(response, 200, actors);
}

async function handleDetails(sql: any, actorId: number, response: any) {
  const cached = await sql`
    select response_json
    from tmdb_person_cache
    where tmdb_id = ${actorId}
      and expires_at > now()
    order by created_at desc
    limit 1
  `;
  let actor = cached[0]?.response_json;
  if (actor) {
    response.setHeader("X-Flim-Actor-Cache", "HIT");
  } else {
    actor = await fetchTmdbPersonDetails(actorId);
    await upsertActor(sql, actor);
    await sql`
      insert into tmdb_person_cache (tmdb_id, response_json, expires_at)
      values (${actorId}, ${JSON.stringify(actor)}::jsonb, now() + (${PERSON_CACHE_DAYS} * interval '1 day'))
      on conflict (tmdb_id)
      do update set
        response_json = excluded.response_json,
        created_at = now(),
        expires_at = excluded.expires_at
    `;
    response.setHeader("X-Flim-Actor-Cache", "MISS");
  }

  const [playlists, related] = await Promise.all([
    featuredPlaylists(sql, actor),
    relatedActors(sql, actorId),
  ]);

  return sendJson(response, 200, {
    ...actor,
    featuredPlaylists: playlists,
    relatedActors: related,
  });
}

export default async function handler(request: any, response: any) {
  if (request.method !== "GET") return sendJson(response, 405, { error: "Method not allowed." });

  try {
    const sql = db();
    await ensureActorTables(sql);
    const path = actorPath(request);
    if (path === "search") return handleSearch(sql, request, response);

    const actorId = Number(path);
    if (!Number.isFinite(actorId)) return sendJson(response, 400, { error: "A valid actor ID is required." });
    return handleDetails(sql, actorId, response);
  } catch (error) {
    console.error("actor_request_failed", error instanceof Error ? error.message : "Actor request failed.");
    return sendJson(response, 500, { error: error instanceof Error ? error.message : "Actor request failed." });
  }
}
