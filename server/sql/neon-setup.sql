-- Flim Neon PostgreSQL setup.
-- Production foundation: playlists can be owned by users, public playlists
-- remain publicly viewable, and legacy unowned playlists remain accessible.

create extension if not exists pgcrypto;

create table if not exists playlists (
  id uuid primary key default gen_random_uuid(),
  public_slug text unique,
  owner_user_id uuid,
  name text not null,
  description text default '',
  visibility text not null default 'private'
    check (visibility in ('private', 'shared', 'public')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table playlists
  add column if not exists public_slug text unique;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table users
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists users_email_unique
  on users (email);

create table if not exists media_items (
  id uuid primary key default gen_random_uuid(),
  media_type text not null
    check (media_type in ('movie', 'tv')),
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
);

alter table media_items
  add column if not exists original_title text,
  add column if not exists backdrop_url text,
  add column if not exists runtime integer,
  add column if not exists rating text,
  add column if not exists status text,
  add column if not exists popularity numeric,
  add column if not exists genres jsonb not null default '[]'::jsonb,
  add column if not exists language text,
  add column if not exists provider_last_checked timestamptz,
  add column if not exists source_payload jsonb not null default '{}'::jsonb;

create unique index if not exists media_items_media_tmdb_unique
  on media_items (media_type, tmdb_id);

create index if not exists media_items_title_idx
  on media_items using gin (to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(original_title, '')));

create index if not exists media_items_year_idx
  on media_items (year);

create index if not exists media_items_media_type_idx
  on media_items (media_type);

create table if not exists people (
  id uuid primary key default gen_random_uuid(),
  tmdb_id integer unique,
  name text not null,
  profile_url text,
  known_for_department text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists people_name_idx
  on people using gin (to_tsvector('simple', name));

create table if not exists media_people (
  id uuid primary key default gen_random_uuid(),
  media_item_id uuid not null references media_items(id) on delete cascade,
  person_id uuid not null references people(id) on delete cascade,
  role text not null
    check (role in ('cast', 'crew', 'director', 'actor')),
  character_name text,
  job text,
  sort_order integer,
  created_at timestamptz not null default now()
);

create index if not exists media_people_media_item_idx
  on media_people (media_item_id);

create index if not exists media_people_person_idx
  on media_people (person_id);

create unique index if not exists media_people_identity_unique
  on media_people (media_item_id, person_id, role, coalesce(job, ''), coalesce(character_name, ''));

create table if not exists user_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists user_sessions_user_id_idx
  on user_sessions (user_id);

create index if not exists user_sessions_expires_at_idx
  on user_sessions (expires_at);

alter table playlists
  add column if not exists owner_user_id uuid references users(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'playlists_owner_user_id_fkey'
  ) then
    alter table playlists
      add constraint playlists_owner_user_id_fkey
      foreign key (owner_user_id) references users(id) on delete set null;
  end if;
end $$;

update playlists
set public_slug = 'playlist-' || lower(substr(replace(id::text, '-', ''), 1, 10))
where public_slug is null;

alter table playlists
  alter column public_slug set not null;

create table if not exists playlist_movies (
  id uuid primary key default gen_random_uuid(),
  playlist_id uuid not null references playlists(id) on delete cascade,
  media_item_id uuid references media_items(id) on delete set null,
  media_type text not null default 'movie'
    check (media_type in ('movie', 'tv')),
  tmdb_id integer not null,
  title text not null,
  year text,
  poster_url text,
  overview text,
  runtime_minutes integer,
  season_count integer,
  episode_count integer,
  sort_order integer,
  watched boolean not null default false,
  added_at timestamptz not null default now(),
  unique (playlist_id, media_type, tmdb_id)
);

alter table playlist_movies
  add column if not exists media_type text not null default 'movie',
  add column if not exists media_item_id uuid references media_items(id) on delete set null,
  add column if not exists runtime_minutes integer,
  add column if not exists season_count integer,
  add column if not exists episode_count integer,
  add column if not exists sort_order integer;

do $$
declare
  legacy_constraint record;
  legacy_index record;
begin
  for legacy_constraint in
    select distinct c.conname
    from pg_constraint c
    left join pg_class i on i.oid = c.conindid
    where c.conrelid = 'playlist_movies'::regclass
      and (
        c.conname = 'playlist_movies_playlist_id_tmdb_id_key'
        or i.relname = 'playlist_movies_playlist_id_tmdb_id_key'
      )
  loop
    execute format('alter table playlist_movies drop constraint %I', legacy_constraint.conname);
  end loop;

  for legacy_index in
    select i.oid::regclass::text as index_name
    from pg_class i
    where i.relname = 'playlist_movies_playlist_id_tmdb_id_key'
      and i.relkind = 'i'
      and not exists (
        select 1
        from pg_constraint c
        where c.conindid = i.oid
      )
  loop
    execute format('drop index if exists %s', legacy_index.index_name);
  end loop;
end $$;

create unique index if not exists playlist_movies_playlist_media_tmdb_unique
  on playlist_movies (playlist_id, media_type, tmdb_id);

create index if not exists playlists_visibility_idx
  on playlists (visibility);

create unique index if not exists playlists_public_slug_idx
  on playlists (public_slug);

create index if not exists playlists_updated_at_idx
  on playlists (updated_at desc);

create index if not exists playlists_owner_user_id_idx
  on playlists (owner_user_id);

create index if not exists playlist_movies_playlist_id_idx
  on playlist_movies (playlist_id);

create index if not exists playlist_movies_tmdb_id_idx
  on playlist_movies (tmdb_id);

create index if not exists playlist_movies_media_type_idx
  on playlist_movies (media_type);

create index if not exists playlist_movies_watched_idx
  on playlist_movies (watched);

create index if not exists playlist_movies_sort_order_idx
  on playlist_movies (playlist_id, sort_order);

create index if not exists playlist_movies_media_item_id_idx
  on playlist_movies (media_item_id);

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
  updated_at = now();

update playlist_movies pm
set media_item_id = mi.id
from media_items mi
where pm.media_item_id is null
  and mi.media_type = coalesce(pm.media_type, 'movie')
  and mi.tmdb_id = pm.tmdb_id;

create table if not exists playlist_follows (
  id uuid primary key default gen_random_uuid(),
  playlist_id uuid not null references playlists(id) on delete cascade,
  follower_user_id uuid references users(id) on delete cascade,
  follower_session_id text,
  created_at timestamptz not null default now(),
  check (follower_user_id is not null or nullif(follower_session_id, '') is not null)
);

create unique index if not exists playlist_follows_user_unique
  on playlist_follows (playlist_id, follower_user_id)
  where follower_user_id is not null;

create unique index if not exists playlist_follows_session_unique
  on playlist_follows (playlist_id, follower_session_id)
  where follower_session_id is not null;

create index if not exists playlist_follows_playlist_id_idx
  on playlist_follows (playlist_id);

create index if not exists playlist_follows_user_id_idx
  on playlist_follows (follower_user_id);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references users(id) on delete cascade,
  actor_user_id uuid references users(id) on delete set null,
  type text not null,
  entity_type text not null,
  entity_id uuid,
  title text not null,
  message text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_recipient_created_idx
  on notifications (recipient_user_id, created_at desc);

create index if not exists notifications_recipient_unread_idx
  on notifications (recipient_user_id, read_at);

create unique index if not exists notifications_playlist_followed_unique
  on notifications (recipient_user_id, actor_user_id, type, entity_type, entity_id)
  where actor_user_id is not null;

create table if not exists director_profile (
  id text primary key default 'the-director',
  display_name text not null default 'The Director',
  bio text not null default 'Curating movie collections for Flim.',
  tagline text not null default 'Official Flim editorial curator.',
  quote text not null default 'Some movies deserve a second watch.',
  updated_at timestamptz not null default now()
);

insert into director_profile (id)
values ('the-director')
on conflict (id) do nothing;

create table if not exists tmdb_search_cache (
  id uuid primary key default gen_random_uuid(),
  query text not null,
  normalized_query text not null,
  media_type text not null default 'movie',
  response_json jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

alter table tmdb_search_cache
  drop constraint if exists tmdb_search_cache_normalized_query_key;

create unique index if not exists tmdb_search_cache_media_query_unique
  on tmdb_search_cache (media_type, normalized_query);

create index if not exists tmdb_search_cache_normalized_query_idx
  on tmdb_search_cache (normalized_query);

create index if not exists tmdb_search_cache_expires_at_idx
  on tmdb_search_cache (expires_at);

create table if not exists tmdb_movie_cache (
  id uuid primary key default gen_random_uuid(),
  tmdb_id integer not null,
  media_type text not null default 'movie',
  response_json jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

alter table tmdb_search_cache
  add column if not exists media_type text not null default 'movie';

alter table tmdb_movie_cache
  add column if not exists media_type text not null default 'movie';

alter table tmdb_movie_cache
  drop constraint if exists tmdb_movie_cache_tmdb_id_key;

create unique index if not exists tmdb_movie_cache_media_tmdb_unique
  on tmdb_movie_cache (media_type, tmdb_id);

create index if not exists tmdb_movie_cache_tmdb_id_idx
  on tmdb_movie_cache (tmdb_id);

create index if not exists tmdb_movie_cache_expires_at_idx
  on tmdb_movie_cache (expires_at);

create table if not exists watch_providers (
  id text primary key,
  name text not null,
  logo_url text,
  icon_key text,
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists watch_providers_name_unique
  on watch_providers (name);

create table if not exists title_availability (
  id uuid primary key default gen_random_uuid(),
  media_type text not null
    check (media_type in ('movie', 'tv')),
  tmdb_id integer not null,
  region text not null default 'CA',
  provider_id text not null,
  provider_name text not null,
  logo_url text,
  availability_type text not null default 'unknown',
  deep_link text,
  search_fallback_url text,
  source text not null default 'manual',
  cached_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create unique index if not exists title_availability_media_provider_region_unique
  on title_availability (media_type, tmdb_id, region, provider_id, availability_type);

create index if not exists title_availability_media_tmdb_region_idx
  on title_availability (media_type, tmdb_id, region);

create index if not exists title_availability_expires_at_idx
  on title_availability (expires_at);

create table if not exists provider_links (
  id uuid primary key default gen_random_uuid(),
  media_type text not null
    check (media_type in ('movie', 'tv')),
  tmdb_id integer not null,
  provider_id text not null,
  region text not null default 'CA',
  deep_link text,
  search_fallback_url text,
  link_type text not null default 'search_fallback',
  created_at timestamptz not null default now()
);

create index if not exists provider_links_media_tmdb_region_idx
  on provider_links (media_type, tmdb_id, region);

delete from provider_links a
using provider_links b
where a.ctid < b.ctid
  and a.media_type = b.media_type
  and a.tmdb_id = b.tmdb_id
  and a.provider_id = b.provider_id
  and a.region = b.region
  and a.link_type = b.link_type;

create unique index if not exists provider_links_media_provider_region_unique
  on provider_links (media_type, tmdb_id, provider_id, region, link_type);

create table if not exists provider_region (
  id uuid primary key default gen_random_uuid(),
  provider_id text not null,
  region text not null default 'CA',
  supported boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists provider_region_provider_region_unique
  on provider_region (provider_id, region);

create table if not exists provider_availability_cache (
  id uuid primary key default gen_random_uuid(),
  media_type text not null
    check (media_type in ('movie', 'tv')),
  tmdb_id integer not null,
  region text not null default 'CA',
  source text not null,
  cached_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create unique index if not exists provider_availability_cache_media_region_unique
  on provider_availability_cache (media_type, tmdb_id, region, source);

create index if not exists provider_availability_cache_expires_at_idx
  on provider_availability_cache (expires_at);

create or replace view provider_availability as
select
  id,
  media_type,
  tmdb_id,
  region,
  provider_id,
  provider_name,
  logo_url,
  availability_type,
  deep_link,
  search_fallback_url,
  source,
  cached_at,
  expires_at
from title_availability;

create table if not exists recommendations (
  id uuid primary key default gen_random_uuid(),
  tmdb_id integer not null,
  recommendation_reason text not null,
  source_signal text,
  created_at timestamptz not null default now(),
  dismissed_at timestamptz
);

create index if not exists recommendations_tmdb_id_idx
  on recommendations (tmdb_id);

create table if not exists user_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id text not null unique,
  display_name text not null default '',
  handle text not null unique,
  bio text,
  country_code text not null default '',
  province_state text,
  region text,
  postal_code text,
  streaming_region text not null default '',
  preferred_providers jsonb not null default '[]'::jsonb,
  show_country_publicly boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table user_profiles
  add column if not exists province_state text;

create unique index if not exists user_profiles_handle_unique
  on user_profiles (handle);

create unique index if not exists user_profiles_user_id_unique
  on user_profiles (user_id);

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists playlists_set_updated_at on playlists;
create trigger playlists_set_updated_at
before update on playlists
for each row
execute function set_updated_at();

drop trigger if exists user_profiles_set_updated_at on user_profiles;
create trigger user_profiles_set_updated_at
before update on user_profiles
for each row
execute function set_updated_at();

drop trigger if exists users_set_updated_at on users;
create trigger users_set_updated_at
before update on users
for each row
execute function set_updated_at();

create or replace function touch_playlist_after_movie_change()
returns trigger
language plpgsql
as $$
begin
  update playlists
  set updated_at = now()
  where id = coalesce(new.playlist_id, old.playlist_id);
  return coalesce(new, old);
end;
$$;

drop trigger if exists playlist_movies_touch_playlist_insert on playlist_movies;
create trigger playlist_movies_touch_playlist_insert
after insert on playlist_movies
for each row
execute function touch_playlist_after_movie_change();

drop trigger if exists playlist_movies_touch_playlist_update on playlist_movies;
create trigger playlist_movies_touch_playlist_update
after update on playlist_movies
for each row
execute function touch_playlist_after_movie_change();

drop trigger if exists playlist_movies_touch_playlist_delete on playlist_movies;
create trigger playlist_movies_touch_playlist_delete
after delete on playlist_movies
for each row
execute function touch_playlist_after_movie_change();
