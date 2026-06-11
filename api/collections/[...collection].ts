import { db, getCurrentUser, sendJson } from "../_db.js";
import { upsertMediaItems } from "../_mediaCatalog.js";
import { ensureTmdbCacheTables, fetchTmdbCollectionDetails } from "../_tmdb.js";

const COLLECTION_CACHE_DAYS = 30;

const curatedCollections = [
  { tmdbId: 264, slug: "back-to-the-future", title: "Back to the Future Collection", category: "Time Travel" },
  { tmdbId: 328, slug: "jurassic-park", title: "Jurassic Park Collection", category: "Adventure" },
  { tmdbId: 87359, slug: "mission-impossible", title: "Mission: Impossible Collection", category: "Action" },
  { tmdbId: 1241, slug: "harry-potter", title: "Harry Potter Collection", category: "Fantasy" },
  { tmdbId: 119, slug: "lord-of-the-rings", title: "The Lord of the Rings Collection", category: "Fantasy" },
  { tmdbId: 10, slug: "star-wars", title: "Star Wars Collection", category: "Sci-Fi" },
  { tmdbId: 9485, slug: "fast-and-furious", title: "Fast & Furious Collection", category: "Action" },
  { tmdbId: 86311, slug: "avengers", title: "The Avengers Collection", category: "Marvel" },
  { tmdbId: 131295, slug: "captain-america", title: "Captain America Collection", category: "Marvel" },
  { tmdbId: 10194, slug: "toy-story", title: "Toy Story Collection", category: "Pixar" },
];

function collectionPath(request: any) {
  const pathname = new URL(request.url || "", "https://www.flim.ca").pathname;
  const fromPath = pathname.split("/api/collections/").pop()?.split("?")[0];
  if (fromPath && fromPath !== pathname) return fromPath;
  const value = request.query.collection;
  return Array.isArray(value) ? value.map(String).join("/") : String(value || "");
}

function normalizeCollectionKey(value: string) {
  return value.trim().toLowerCase();
}

function collectionSeedFor(value: string) {
  const key = normalizeCollectionKey(value);
  return curatedCollections.find((collection) =>
    String(collection.tmdbId) === key ||
    collection.slug === key ||
    collection.title.toLowerCase() === key,
  );
}

async function ensureCollectionTables(sql: any) {
  await ensureTmdbCacheTables(sql);
  const safe = async (statement: Promise<unknown>) => {
    try {
      await statement;
    } catch (error) {
      const message = error instanceof Error ? error.message : String((error as any)?.message || "");
      if (
        message.includes("pg_type_typname_nsp_index") ||
        message.includes("pg_class_relname_nsp_index") ||
        message.includes("duplicate key value violates unique constraint") ||
        message.includes("already exists")
      ) {
        return;
      }
      throw error;
    }
  };

  await safe(sql`
    create table if not exists media_collections (
      id uuid primary key default gen_random_uuid(),
      tmdb_id integer not null unique,
      slug text not null unique,
      title text not null,
      overview text,
      poster_url text,
      backdrop_url text,
      category text,
      source_payload jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);
  await safe(sql`create index if not exists media_collections_title_idx on media_collections using gin (to_tsvector('simple', title))`);
  await safe(sql`
    create table if not exists media_collection_items (
      id uuid primary key default gen_random_uuid(),
      collection_id uuid not null references media_collections(id) on delete cascade,
      media_type text not null default 'movie' check (media_type in ('movie', 'tv')),
      tmdb_id integer not null,
      title text not null,
      year text,
      poster_url text,
      overview text,
      release_date date,
      sort_order integer,
      source_payload jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);
  await safe(sql`create unique index if not exists media_collection_items_collection_title_unique on media_collection_items (collection_id, media_type, tmdb_id)`);
  await safe(sql`create index if not exists media_collection_items_title_idx on media_collection_items (media_type, tmdb_id)`);
  await safe(sql`
    create table if not exists user_collection_progress (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references users(id) on delete cascade,
      collection_id uuid not null references media_collections(id) on delete cascade,
      watched_count integer not null default 0,
      total_count integer not null default 0,
      completion_percent integer not null default 0,
      status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'completed')),
      updated_at timestamptz not null default now()
    )
  `);
  await safe(sql`create unique index if not exists user_collection_progress_user_collection_unique on user_collection_progress (user_id, collection_id)`);
  await safe(sql`create index if not exists user_collection_progress_user_status_idx on user_collection_progress (user_id, status, updated_at desc)`);
}

async function upsertCollection(sql: any, seed: typeof curatedCollections[number], collection: any) {
  const [row] = await sql`
    insert into media_collections (
      tmdb_id,
      slug,
      title,
      overview,
      poster_url,
      backdrop_url,
      category,
      source_payload,
      updated_at
    )
    values (
      ${seed.tmdbId},
      ${seed.slug},
      ${collection.title || seed.title},
      ${collection.overview || ""},
      ${collection.posterUrl || null},
      ${collection.backdropUrl || null},
      ${seed.category},
      ${JSON.stringify({ source: "tmdb", tmdbId: seed.tmdbId })}::jsonb,
      now()
    )
    on conflict (tmdb_id)
    do update set
      slug = excluded.slug,
      title = excluded.title,
      overview = coalesce(excluded.overview, media_collections.overview),
      poster_url = coalesce(excluded.poster_url, media_collections.poster_url),
      backdrop_url = coalesce(excluded.backdrop_url, media_collections.backdrop_url),
      category = excluded.category,
      source_payload = media_collections.source_payload || excluded.source_payload,
      updated_at = now()
    returning *
  `;

  for (const [index, item] of (collection.items || []).entries()) {
    await sql`
      insert into media_collection_items (
        collection_id,
        media_type,
        tmdb_id,
        title,
        year,
        poster_url,
        overview,
        release_date,
        sort_order,
        source_payload,
        updated_at
      )
      values (
        ${row.id},
        ${item.mediaType || "movie"},
        ${item.tmdbId},
        ${item.title},
        ${item.releaseYear || null},
        ${item.posterUrl || null},
        ${item.overview || ""},
        ${item.releaseDate || null},
        ${index},
        ${JSON.stringify(item)}::jsonb,
        now()
      )
      on conflict (collection_id, media_type, tmdb_id)
      do update set
        title = excluded.title,
        year = coalesce(excluded.year, media_collection_items.year),
        poster_url = coalesce(excluded.poster_url, media_collection_items.poster_url),
        overview = coalesce(excluded.overview, media_collection_items.overview),
        release_date = coalesce(excluded.release_date, media_collection_items.release_date),
        sort_order = excluded.sort_order,
        source_payload = media_collection_items.source_payload || excluded.source_payload,
        updated_at = now()
    `;
  }

  await upsertMediaItems(sql, collection.items || []);
  return row;
}

async function loadCollection(sql: any, seed: typeof curatedCollections[number]) {
  const [cached] = await sql`
    select *
    from media_collections
    where tmdb_id = ${seed.tmdbId}
      and updated_at > now() - (${COLLECTION_CACHE_DAYS} * interval '1 day')
    limit 1
  `;
  if (cached) return cached;

  const fresh = await fetchTmdbCollectionDetails(seed.tmdbId);
  return upsertCollection(sql, seed, fresh);
}

async function collectionItems(sql: any, collectionId: string, userId?: string) {
  const rows = await sql`
    select
      mci.*,
      exists (
        select 1
        from playlist_movies pm
        join playlists p on p.id = pm.playlist_id
        where ${userId || null}::uuid is not null
          and p.owner_user_id = ${userId || null}::uuid
          and coalesce(pm.media_type, 'movie') = mci.media_type
          and pm.tmdb_id = mci.tmdb_id
          and pm.watched = true
      ) as watched,
      (
        select rating
        from title_ratings tr
        where ${userId || null}::uuid is not null
          and tr.user_id = ${userId || null}::uuid
          and tr.media_type = mci.media_type
          and tr.tmdb_id = mci.tmdb_id
        limit 1
      ) as user_rating,
      (
        select count(*)::int
        from title_trivia tt
        where tt.media_type = mci.media_type
          and tt.tmdb_id = mci.tmdb_id
          and tt.status <> 'hidden'
      ) as trivia_total,
      (
        select count(*)::int
        from user_trivia_progress utp
        join title_trivia tt on tt.id = utp.trivia_id
        where ${userId || null}::uuid is not null
          and utp.user_id = ${userId || null}::uuid
          and tt.media_type = mci.media_type
          and tt.tmdb_id = mci.tmdb_id
      ) as trivia_completed
    from media_collection_items mci
    where mci.collection_id = ${collectionId}
    order by coalesce(mci.sort_order, 2147483647), mci.release_date nulls last, mci.title
  `;

  return rows.map((row: any) => ({
    tmdbId: row.tmdb_id,
    mediaType: row.media_type || "movie",
    title: row.title,
    releaseYear: row.year || undefined,
    releaseDate: row.release_date || undefined,
    overview: row.overview || "",
    posterUrl: row.poster_url || undefined,
    watchStatus: row.watched ? "watched" : "not_watched",
    userRating: Number(row.user_rating || 0),
    triviaCompleted: Number(row.trivia_completed || 0),
    triviaTotal: Number(row.trivia_total || 0),
  }));
}

function progressFor(items: any[]) {
  const totalCount = items.length;
  const movieCount = items.filter((item) => item.mediaType !== "tv").length;
  const tvCount = items.filter((item) => item.mediaType === "tv").length;
  const watchedCount = items.filter((item) => item.watchStatus === "watched").length;
  const remainingCount = Math.max(0, totalCount - watchedCount);
  const completionPercent = totalCount > 0 ? Math.round((watchedCount / totalCount) * 100) : 0;
  const status = watchedCount === 0 ? "not_started" : watchedCount >= totalCount ? "completed" : "in_progress";
  return { totalCount, movieCount, tvCount, watchedCount, remainingCount, completionPercent, status };
}

async function saveProgressSummary(sql: any, userId: string | undefined, collectionId: string, progress: any) {
  if (!userId) return;
  await sql`
    insert into user_collection_progress (
      user_id,
      collection_id,
      watched_count,
      total_count,
      completion_percent,
      status,
      updated_at
    )
    values (
      ${userId},
      ${collectionId},
      ${progress.watchedCount},
      ${progress.totalCount},
      ${progress.completionPercent},
      ${progress.status},
      now()
    )
    on conflict (user_id, collection_id)
    do update set
      watched_count = excluded.watched_count,
      total_count = excluded.total_count,
      completion_percent = excluded.completion_percent,
      status = excluded.status,
      updated_at = now()
  `;
}

function mapCollection(row: any, items: any[], progress: any) {
  return {
    id: row.slug,
    tmdbId: row.tmdb_id,
    slug: row.slug,
    title: row.title,
    overview: row.overview || "",
    posterUrl: row.poster_url || undefined,
    backdropUrl: row.backdrop_url || undefined,
    category: row.category || undefined,
    items,
    progress,
  };
}

async function detailResponse(sql: any, seed: typeof curatedCollections[number], userId?: string) {
  const collection = await loadCollection(sql, seed);
  const items = await collectionItems(sql, collection.id, userId);
  const progress = progressFor(items);
  await saveProgressSummary(sql, userId, collection.id, progress);
  return mapCollection(collection, items, progress);
}

export default async function handler(request: any, response: any) {
  if (request.method !== "GET") return sendJson(response, 405, { error: "Method not allowed." });

  try {
    const sql = db();
    await ensureCollectionTables(sql);
    const user = await getCurrentUser(sql, request);
    const path = collectionPath(request);

    if (!path || path === "index") {
      const collections = await Promise.all(curatedCollections.map((seed) => detailResponse(sql, seed, user?.id)));
      return sendJson(response, 200, {
        collections,
        sections: {
          popular: collections.slice(0, 8),
          inProgress: collections.filter((collection) => collection.progress.status === "in_progress"),
          completed: collections.filter((collection) => collection.progress.status === "completed"),
          recentlyReleased: [...collections].sort((a, b) => {
            const datesA = a.items.map((item: any) => String(item.releaseDate || "")).sort();
            const datesB = b.items.map((item: any) => String(item.releaseDate || "")).sort();
            const latestA = datesA[datesA.length - 1] || "";
            const latestB = datesB[datesB.length - 1] || "";
            return latestB.localeCompare(latestA);
          }).slice(0, 8),
        },
      });
    }

    const seed = collectionSeedFor(path);
    if (!seed) return sendJson(response, 404, { error: "Collection not found." });
    return sendJson(response, 200, await detailResponse(sql, seed, user?.id));
  } catch (error) {
    console.error("collection_request_failed", error instanceof Error ? error.message : "Collection request failed.");
    return sendJson(response, 500, { error: error instanceof Error ? error.message : "Collection request failed." });
  }
}
