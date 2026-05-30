-- Flim Neon PostgreSQL setup.
-- Demo stage: no auth/user ownership yet. Data is shared until auth introduces
-- owner columns and scoped API authorization.

create extension if not exists pgcrypto;

create table if not exists playlists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text default '',
  visibility text not null default 'private'
    check (visibility in ('private', 'shared', 'public')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

create index if not exists playlists_updated_at_idx
  on playlists (updated_at desc);

create index if not exists playlist_movies_playlist_id_idx
  on playlist_movies (playlist_id);

create index if not exists playlist_movies_tmdb_id_idx
  on playlist_movies (tmdb_id);

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
