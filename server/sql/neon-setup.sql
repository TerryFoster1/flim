-- Flim Neon PostgreSQL setup.
-- Demo stage: no auth/user ownership yet. Data is shared until auth introduces
-- owner columns and scoped API authorization.

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
  created_at timestamptz not null default now()
);

create unique index if not exists users_email_unique
  on users (email);

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
  tmdb_id integer not null,
  title text not null,
  year text,
  poster_url text,
  overview text,
  watched boolean not null default false,
  added_at timestamptz not null default now(),
  unique (playlist_id, tmdb_id)
);

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

create table if not exists tmdb_search_cache (
  id uuid primary key default gen_random_uuid(),
  query text not null,
  normalized_query text not null unique,
  response_json jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists tmdb_search_cache_expires_at_idx
  on tmdb_search_cache (expires_at);

create table if not exists tmdb_movie_cache (
  id uuid primary key default gen_random_uuid(),
  tmdb_id integer not null unique,
  response_json jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists tmdb_movie_cache_expires_at_idx
  on tmdb_movie_cache (expires_at);

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
  region text,
  postal_code text,
  streaming_region text not null default '',
  preferred_providers jsonb not null default '[]'::jsonb,
  show_country_publicly boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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
