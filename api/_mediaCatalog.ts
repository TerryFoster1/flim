export type CatalogMediaType = "movie" | "tv";

export interface CatalogMediaInput {
  mediaType?: CatalogMediaType;
  tmdbId: number;
  title: string;
  originalTitle?: string;
  overview?: string;
  releaseDate?: string;
  releaseYear?: string;
  firstAirYear?: string;
  posterUrl?: string;
  backdropUrl?: string;
  runtimeMinutes?: number;
  contentRating?: string;
  status?: string;
  popularity?: number;
  genres?: string[];
  genreIds?: number[];
  language?: string;
  seasonCount?: number;
  episodeCount?: number;
  seasons?: Array<Record<string, unknown>>;
  cast?: Array<Record<string, unknown>>;
  castVersion?: number;
  contentRatings?: Array<{ countryCode: string; rating: string }>;
  contentRatingVersion?: number;
}

let mediaCatalogReady: Promise<void> | null = null;

function normalizeMediaType(value?: string): CatalogMediaType {
  return value === "tv" ? "tv" : "movie";
}

function releaseDateFromInput(input: CatalogMediaInput) {
  if (input.releaseDate) return input.releaseDate;
  const year = input.releaseYear || input.firstAirYear;
  return year ? `${year}-01-01` : null;
}

function yearFromInput(input: CatalogMediaInput) {
  return input.releaseYear || input.firstAirYear || input.releaseDate?.slice(0, 4) || null;
}

function genresForStorage(input: CatalogMediaInput) {
  if (Array.isArray(input.genres) && input.genres.length > 0) return input.genres.filter(Boolean);
  return [];
}

function numericOrNull(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function textOrNull(value: unknown) {
  const text = String(value || "").trim();
  return text || null;
}

export async function ensureMediaCatalogTables(sql: any) {
  if (mediaCatalogReady) return mediaCatalogReady;

  mediaCatalogReady = ensureMediaCatalogTablesUncached(sql).catch((error) => {
    mediaCatalogReady = null;
    throw error;
  });

  return mediaCatalogReady;
}

async function ensureMediaCatalogTablesUncached(sql: any) {
  await sql`
    create table if not exists media_items (
      id uuid primary key default gen_random_uuid(),
      media_type text not null check (media_type in ('movie', 'tv')),
      tmdb_id integer not null,
      title text not null,
      original_title text,
      overview text,
      release_date date,
      year text,
      poster_url text,
      backdrop_url text,
      runtime integer,
      rating text,
      status text,
      popularity numeric,
      genres jsonb not null default '[]'::jsonb,
      language text,
      provider_last_checked timestamptz,
      source_payload jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;
  await sql`alter table media_items add column if not exists original_title text`;
  await sql`alter table media_items add column if not exists backdrop_url text`;
  await sql`alter table media_items add column if not exists runtime integer`;
  await sql`alter table media_items add column if not exists rating text`;
  await sql`alter table media_items add column if not exists status text`;
  await sql`alter table media_items add column if not exists popularity numeric`;
  await sql`alter table media_items add column if not exists genres jsonb not null default '[]'::jsonb`;
  await sql`alter table media_items add column if not exists language text`;
  await sql`alter table media_items add column if not exists provider_last_checked timestamptz`;
  await sql`alter table media_items add column if not exists source_payload jsonb not null default '{}'::jsonb`;
  await sql`create unique index if not exists media_items_media_tmdb_unique on media_items (media_type, tmdb_id)`;
  await sql`create index if not exists media_items_title_idx on media_items using gin (to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(original_title, '')))`;
  await sql`create index if not exists media_items_year_idx on media_items (year)`;
  await sql`create index if not exists media_items_media_type_idx on media_items (media_type)`;

  await sql`
    create table if not exists people (
      id uuid primary key default gen_random_uuid(),
      tmdb_id integer unique,
      name text not null,
      profile_url text,
      known_for_department text,
      biography text,
      birth_date date,
      place_of_birth text,
      popularity numeric,
      source_payload jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;
  await sql`alter table people add column if not exists biography text`;
  await sql`alter table people add column if not exists birth_date date`;
  await sql`alter table people add column if not exists place_of_birth text`;
  await sql`alter table people add column if not exists popularity numeric`;
  await sql`alter table people add column if not exists source_payload jsonb not null default '{}'::jsonb`;
  await sql`create index if not exists people_name_idx on people using gin (to_tsvector('simple', name))`;

  await sql`
    create table if not exists media_people (
      id uuid primary key default gen_random_uuid(),
      media_item_id uuid not null references media_items(id) on delete cascade,
      person_id uuid not null references people(id) on delete cascade,
      role text not null check (role in ('cast', 'crew', 'director', 'actor')),
      character_name text,
      job text,
      sort_order integer,
      created_at timestamptz not null default now()
    )
  `;
  await sql`create index if not exists media_people_media_item_idx on media_people (media_item_id)`;
  await sql`create index if not exists media_people_person_idx on media_people (person_id)`;
  await sql`create unique index if not exists media_people_identity_unique on media_people (media_item_id, person_id, role, coalesce(job, ''), coalesce(character_name, ''))`;

  await sql`alter table playlist_movies add column if not exists media_item_id uuid references media_items(id) on delete set null`;
  await sql`create index if not exists playlist_movies_media_item_id_idx on playlist_movies (media_item_id)`;

  await backfillMediaItemsFromPlaylistMovies(sql);
}

export async function backfillMediaItemsFromPlaylistMovies(sql: any) {
  await sql`
    insert into media_items (
      media_type,
      tmdb_id,
      title,
      overview,
      year,
      poster_url,
      runtime,
      genres,
      created_at,
      updated_at
    )
    select distinct on (pm.media_type, pm.tmdb_id)
      coalesce(pm.media_type, 'movie'),
      pm.tmdb_id,
      pm.title,
      pm.overview,
      pm.year,
      pm.poster_url,
      pm.runtime_minutes,
      '[]'::jsonb,
      min(pm.added_at) over (partition by coalesce(pm.media_type, 'movie'), pm.tmdb_id),
      now()
    from playlist_movies pm
    where pm.tmdb_id is not null
      and pm.title is not null
    order by pm.media_type, pm.tmdb_id, pm.added_at desc
    on conflict (media_type, tmdb_id)
    do update set
      title = coalesce(nullif(excluded.title, ''), media_items.title),
      overview = coalesce(nullif(excluded.overview, ''), media_items.overview),
      year = coalesce(excluded.year, media_items.year),
      poster_url = coalesce(excluded.poster_url, media_items.poster_url),
      runtime = coalesce(excluded.runtime, media_items.runtime),
      updated_at = now()
  `;
  await sql`
    update playlist_movies pm
    set media_item_id = mi.id
    from media_items mi
    where pm.media_item_id is null
      and mi.media_type = coalesce(pm.media_type, 'movie')
      and mi.tmdb_id = pm.tmdb_id
  `;
}

export async function upsertMediaItem(sql: any, input: CatalogMediaInput) {
  await ensureMediaCatalogTables(sql);
  const mediaType = normalizeMediaType(input.mediaType);
  const tmdbId = Number(input.tmdbId);
  const title = textOrNull(input.title);

  if (!Number.isFinite(tmdbId) || tmdbId <= 0 || !title) return null;

  const sourcePayload = {
    seasonCount: input.seasonCount,
    episodeCount: input.episodeCount,
    seasons: input.seasons,
    cast: input.cast,
    castVersion: input.castVersion,
    contentRatings: input.contentRatings,
    contentRatingVersion: input.contentRatingVersion,
    genreIds: input.genreIds,
  };

  const [row] = await sql`
    insert into media_items (
      media_type,
      tmdb_id,
      title,
      original_title,
      overview,
      release_date,
      year,
      poster_url,
      backdrop_url,
      runtime,
      rating,
      status,
      popularity,
      genres,
      language,
      source_payload,
      updated_at
    )
    values (
      ${mediaType},
      ${tmdbId},
      ${title},
      ${textOrNull(input.originalTitle)},
      ${textOrNull(input.overview)},
      ${releaseDateFromInput(input)},
      ${yearFromInput(input)},
      ${textOrNull(input.posterUrl)},
      ${textOrNull(input.backdropUrl)},
      ${numericOrNull(input.runtimeMinutes)},
      ${textOrNull(input.contentRating)},
      ${textOrNull(input.status)},
      ${numericOrNull(input.popularity)},
      ${JSON.stringify(genresForStorage(input))}::jsonb,
      ${textOrNull(input.language)},
      ${JSON.stringify(sourcePayload)}::jsonb,
      now()
    )
    on conflict (media_type, tmdb_id)
    do update set
      title = excluded.title,
      original_title = coalesce(excluded.original_title, media_items.original_title),
      overview = coalesce(excluded.overview, media_items.overview),
      release_date = coalesce(excluded.release_date, media_items.release_date),
      year = coalesce(excluded.year, media_items.year),
      poster_url = coalesce(excluded.poster_url, media_items.poster_url),
      backdrop_url = coalesce(excluded.backdrop_url, media_items.backdrop_url),
      runtime = coalesce(excluded.runtime, media_items.runtime),
      rating = coalesce(excluded.rating, media_items.rating),
      status = coalesce(excluded.status, media_items.status),
      popularity = coalesce(excluded.popularity, media_items.popularity),
      genres = case when jsonb_array_length(excluded.genres) > 0 then excluded.genres else media_items.genres end,
      language = coalesce(excluded.language, media_items.language),
      source_payload = media_items.source_payload || excluded.source_payload,
      updated_at = now()
    returning *
  `;

  return row;
}

export async function upsertMediaItems(sql: any, items: CatalogMediaInput[]) {
  const rows = [];
  for (const item of items) {
    const row = await upsertMediaItem(sql, item);
    if (row) rows.push(row);
  }
  return rows;
}

export async function upsertMediaCast(sql: any, mediaItem: any, cast: Array<Record<string, unknown>> = []) {
  await ensureMediaCatalogTables(sql);
  if (!mediaItem?.id || !Array.isArray(cast) || cast.length === 0) return;

  for (const member of cast.slice(0, 24)) {
    const tmdbId = numericOrNull(member.tmdbId);
    const name = textOrNull(member.name);
    if (!tmdbId || !name) continue;

    const [person] = await sql`
      insert into people (
        tmdb_id,
        name,
        profile_url,
        known_for_department,
        updated_at
      )
      values (
        ${tmdbId},
        ${name},
        ${textOrNull(member.profileUrl)},
        ${textOrNull(member.knownForDepartment)},
        now()
      )
      on conflict (tmdb_id)
      do update set
        name = excluded.name,
        profile_url = coalesce(excluded.profile_url, people.profile_url),
        known_for_department = coalesce(excluded.known_for_department, people.known_for_department),
        updated_at = now()
      returning *
    `;

    if (!person?.id) continue;

    await sql`
      insert into media_people (
        media_item_id,
        person_id,
        role,
        character_name,
        sort_order
      )
      values (
        ${mediaItem.id},
        ${person.id},
        'cast',
        ${textOrNull(member.character)},
        ${numericOrNull(member.order)}
      )
      on conflict (media_item_id, person_id, role, coalesce(job, ''), coalesce(character_name, ''))
      do update set
        sort_order = coalesce(excluded.sort_order, media_people.sort_order)
    `;
  }
}

export async function findCatalogSearchResults(sql: any, query: string, mediaType: CatalogMediaType | "both" = "both") {
  await ensureMediaCatalogTables(sql);
  const cleanQuery = query.trim();
  if (!cleanQuery) return [];

  const rows = await sql`
    select *
    from media_items
    where (${mediaType} = 'both' or media_type = ${mediaType})
      and (
        title ilike ${`%${cleanQuery}%`}
        or original_title ilike ${`%${cleanQuery}%`}
      )
    order by
      case
        when lower(title) = lower(${cleanQuery}) then 0
        when lower(title) like lower(${`${cleanQuery}%`}) then 1
        else 2
      end,
      popularity desc nulls last,
      updated_at desc
    limit 24
  `;

  return rows;
}

export async function getCatalogMediaItem(sql: any, tmdbId: number, mediaType: CatalogMediaType) {
  await ensureMediaCatalogTables(sql);
  const rows = await sql`
    select *
    from media_items
    where media_type = ${mediaType}
      and tmdb_id = ${tmdbId}
    limit 1
  `;
  return rows[0] || null;
}

function arrayFromJson(value: unknown) {
  return Array.isArray(value) ? value : [];
}

export function mapCatalogSearchResult(row: any) {
  const payload = row.source_payload || {};
  return {
    tmdbId: row.tmdb_id,
    mediaType: normalizeMediaType(row.media_type),
    title: row.title,
    originalTitle: row.original_title || undefined,
    releaseDate: row.release_date ? new Date(row.release_date).toISOString().slice(0, 10) : undefined,
    releaseYear: row.year || undefined,
    overview: row.overview || "No overview is available yet.",
    posterUrl: row.poster_url || undefined,
    backdropUrl: row.backdrop_url || undefined,
    genreIds: Array.isArray(payload.genreIds) ? payload.genreIds : [],
  };
}

export function mapCatalogDetails(row: any) {
  const payload = row.source_payload || {};
  return {
    ...mapCatalogSearchResult(row),
    runtimeMinutes: row.runtime || undefined,
    genres: arrayFromJson(row.genres).filter(Boolean),
    status: row.status || undefined,
    popularity: row.popularity ? Number(row.popularity) : undefined,
    language: row.language || undefined,
    seasonCount: payload.seasonCount || undefined,
    episodeCount: payload.episodeCount || undefined,
    seasons: Array.isArray(payload.seasons) ? payload.seasons : undefined,
    cast: Array.isArray(payload.cast) ? payload.cast : [],
    firstAirYear: row.media_type === "tv" ? row.year || undefined : undefined,
    contentRating: row.rating || undefined,
    contentRatings: Array.isArray(payload.contentRatings) ? payload.contentRatings : [],
    contentRatingVersion: payload.contentRatingVersion,
  };
}
