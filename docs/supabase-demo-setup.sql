-- Flim demo-stage Supabase setup.
-- No auth is implemented yet. These tables are intentionally shared demo data so
-- the app can be shown today. Add user ownership and scoped RLS policies before
-- using this with real user accounts.

create extension if not exists pgcrypto;

create table if not exists public.playlists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text default '',
  visibility text not null default 'private'
    check (visibility in ('private', 'shared', 'public')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.playlist_movies (
  id uuid primary key default gen_random_uuid(),
  playlist_id uuid not null references public.playlists(id) on delete cascade,
  tmdb_id integer not null,
  title text not null,
  year text,
  poster_url text,
  overview text,
  watched boolean not null default false,
  added_at timestamptz not null default now(),
  unique (playlist_id, tmdb_id)
);

create index if not exists playlist_movies_playlist_id_idx
  on public.playlist_movies (playlist_id);

create index if not exists playlist_movies_tmdb_id_idx
  on public.playlist_movies (tmdb_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists playlists_set_updated_at on public.playlists;
create trigger playlists_set_updated_at
before update on public.playlists
for each row
execute function public.set_updated_at();

alter table public.playlists enable row level security;
alter table public.playlist_movies enable row level security;

-- Demo policies: anonymous users can read/write shared demo data.
-- Replace these with auth.uid()-scoped ownership policies when auth is added.
drop policy if exists "demo read playlists" on public.playlists;
create policy "demo read playlists"
on public.playlists for select
to anon
using (true);

drop policy if exists "demo insert playlists" on public.playlists;
create policy "demo insert playlists"
on public.playlists for insert
to anon
with check (true);

drop policy if exists "demo update playlists" on public.playlists;
create policy "demo update playlists"
on public.playlists for update
to anon
using (true)
with check (true);

drop policy if exists "demo delete playlists" on public.playlists;
create policy "demo delete playlists"
on public.playlists for delete
to anon
using (true);

drop policy if exists "demo read playlist movies" on public.playlist_movies;
create policy "demo read playlist movies"
on public.playlist_movies for select
to anon
using (true);

drop policy if exists "demo insert playlist movies" on public.playlist_movies;
create policy "demo insert playlist movies"
on public.playlist_movies for insert
to anon
with check (true);

drop policy if exists "demo update playlist movies" on public.playlist_movies;
create policy "demo update playlist movies"
on public.playlist_movies for update
to anon
using (true)
with check (true);

drop policy if exists "demo delete playlist movies" on public.playlist_movies;
create policy "demo delete playlist movies"
on public.playlist_movies for delete
to anon
using (true);

grant usage on schema public to anon;
grant select, insert, update, delete on public.playlists to anon;
grant select, insert, update, delete on public.playlist_movies to anon;
