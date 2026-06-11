-- Flim Neon PostgreSQL setup.
-- Production foundation: playlists can be owned by users, public playlists
-- remain publicly viewable, and legacy unowned playlists remain accessible.

create extension if not exists pgcrypto;

create table if not exists playlists (
  id uuid primary key default gen_random_uuid(),
  public_slug text unique,
  shared_slug text unique,
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

alter table playlists
  add column if not exists shared_slug text;

create unique index if not exists playlists_shared_slug_unique
  on playlists (shared_slug)
  where shared_slug is not null;

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
  biography text,
  birth_date date,
  place_of_birth text,
  popularity numeric,
  source_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table people
  add column if not exists biography text,
  add column if not exists birth_date date,
  add column if not exists place_of_birth text,
  add column if not exists popularity numeric,
  add column if not exists source_payload jsonb not null default '{}'::jsonb;

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

create table if not exists tmdb_person_cache (
  id uuid primary key default gen_random_uuid(),
  tmdb_id integer not null unique,
  response_json jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists tmdb_person_cache_expires_at_idx
  on tmdb_person_cache (expires_at);

create table if not exists tmdb_person_search_cache (
  id uuid primary key default gen_random_uuid(),
  query text not null,
  normalized_query text not null unique,
  response_json jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists tmdb_person_search_cache_normalized_query_idx
  on tmdb_person_search_cache (normalized_query);

create index if not exists tmdb_person_search_cache_expires_at_idx
  on tmdb_person_search_cache (expires_at);

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
);

create index if not exists media_collections_title_idx
  on media_collections using gin (to_tsvector('simple', title));

create table if not exists media_collection_items (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references media_collections(id) on delete cascade,
  media_type text not null default 'movie'
    check (media_type in ('movie', 'tv')),
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
);

create unique index if not exists media_collection_items_collection_title_unique
  on media_collection_items (collection_id, media_type, tmdb_id);

create index if not exists media_collection_items_title_idx
  on media_collection_items (media_type, tmdb_id);

create table if not exists user_collection_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  collection_id uuid not null references media_collections(id) on delete cascade,
  watched_count integer not null default 0,
  total_count integer not null default 0,
  completion_percent integer not null default 0,
  status text not null default 'not_started'
    check (status in ('not_started', 'in_progress', 'completed')),
  updated_at timestamptz not null default now()
);

create unique index if not exists user_collection_progress_user_collection_unique
  on user_collection_progress (user_id, collection_id);

create index if not exists user_collection_progress_user_status_idx
  on user_collection_progress (user_id, status, updated_at desc);

create table if not exists collection_challenges (
  id text primary key,
  collection_slug text not null,
  name text not null,
  description text not null,
  badge text not null default 'star',
  points integer not null default 0,
  requirements jsonb not null default '[]'::jsonb,
  difficulty text not null default 'medium',
  category text not null default 'collections',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists collection_challenges_collection_slug_idx
  on collection_challenges (collection_slug);

create index if not exists collection_challenges_category_idx
  on collection_challenges (category);

create table if not exists user_collection_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  challenge_id text not null references collection_challenges(id) on delete cascade,
  status text not null default 'started' check (status in ('started', 'in_progress', 'completed')),
  completed_requirements integer not null default 0,
  total_requirements integer not null default 0,
  completion_percentage integer not null default 0,
  points_awarded integer not null default 0,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create unique index if not exists user_collection_challenges_user_challenge_unique
  on user_collection_challenges (user_id, challenge_id);

create index if not exists user_collection_challenges_user_status_idx
  on user_collection_challenges (user_id, status, updated_at desc);

insert into collection_challenges (id, collection_slug, name, description, badge, points, requirements, difficulty, category)
values
  (
    'back_to_the_future_time_traveler',
    'back-to-the-future',
    'Time Traveler',
    'Finish the Back to the Future collection and prove you caught the key companion moments.',
    'clock',
    75,
    '[{"type":"collection_completed","label":"Watch all 3 movies","target":1},{"type":"trivia_completed","label":"Complete 3 trivia questions","target":3},{"type":"easter_eggs_completed","label":"Complete 2 Easter Egg Hunts","target":2}]'::jsonb,
    'medium',
    'collections'
  ),
  (
    'jurassic_park_expert',
    'jurassic-park',
    'Jurassic Park Expert',
    'Complete the Jurassic Park collection and companion discoveries.',
    'dinosaur',
    75,
    '[{"type":"collection_completed","label":"Watch the full collection","target":1},{"type":"trivia_completed","label":"Complete 3 trivia questions","target":3},{"type":"easter_eggs_completed","label":"Complete 1 Easter Egg Hunt","target":1}]'::jsonb,
    'medium',
    'collections'
  ),
  (
    'mission_impossible_agent',
    'mission-impossible',
    'Mission Impossible Agent',
    'Accept the mission and finish the full Mission: Impossible collection.',
    'agent',
    60,
    '[{"type":"collection_completed","label":"Watch every mission","target":1}]'::jsonb,
    'hard',
    'collections'
  ),
  (
    'wizarding_world_completionist',
    'harry-potter',
    'Wizarding World Completionist',
    'Complete the Harry Potter collection.',
    'spark',
    60,
    '[{"type":"collection_completed","label":"Watch the full collection","target":1}]'::jsonb,
    'hard',
    'collections'
  ),
  (
    'pixar_completionist',
    'toy-story',
    'Pixar Completionist',
    'Finish the Toy Story collection.',
    'star',
    45,
    '[{"type":"collection_completed","label":"Watch the full collection","target":1}]'::jsonb,
    'easy',
    'collections'
  ),
  (
    'marvel_phase_one_starter',
    'avengers',
    'Marvel Phase Starter',
    'Complete the Avengers collection available in Flim.',
    'shield',
    60,
    '[{"type":"collection_completed","label":"Watch the full collection","target":1}]'::jsonb,
    'medium',
    'collections'
  )
on conflict (id) do update set
  collection_slug = excluded.collection_slug,
  name = excluded.name,
  description = excluded.description,
  badge = excluded.badge,
  points = excluded.points,
  requirements = excluded.requirements,
  difficulty = excluded.difficulty,
  category = excluded.category,
  updated_at = now();

create table if not exists seasonal_challenge_events (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text not null default '',
  start_date date not null,
  end_date date not null,
  badge text not null,
  banner text,
  season_key text not null default 'general',
  is_active boolean not null default true,
  difficulty text not null default 'medium',
  requirements jsonb not null default '[]'::jsonb,
  points integer not null default 0,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists seasonal_challenge_events_status_dates_idx
  on seasonal_challenge_events (status, start_date, end_date);

create index if not exists seasonal_challenge_events_active_window_idx
  on seasonal_challenge_events (is_active, status, start_date, end_date);

create index if not exists seasonal_challenge_events_slug_idx
  on seasonal_challenge_events (slug);

create table if not exists user_seasonal_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  event_id uuid not null references seasonal_challenge_events(id) on delete cascade,
  status text not null default 'in_progress' check (status in ('started', 'in_progress', 'completed')),
  completed_requirements integer not null default 0,
  total_requirements integer not null default 0,
  completion_percentage integer not null default 0,
  points_awarded integer not null default 0,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create unique index if not exists user_seasonal_challenges_user_event_unique
  on user_seasonal_challenges (user_id, event_id);

create index if not exists user_seasonal_challenges_user_status_idx
  on user_seasonal_challenges (user_id, status, updated_at desc);

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

create table if not exists playlist_likes (
  id uuid primary key default gen_random_uuid(),
  playlist_id uuid not null references playlists(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create unique index if not exists playlist_likes_playlist_user_unique
  on playlist_likes (playlist_id, user_id);

create index if not exists playlist_likes_playlist_id_idx
  on playlist_likes (playlist_id);

create index if not exists playlist_likes_user_id_idx
  on playlist_likes (user_id);

create index if not exists playlist_likes_created_at_idx
  on playlist_likes (created_at desc);

create table if not exists title_ratings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  media_type text not null check (media_type in ('movie', 'tv')),
  tmdb_id integer not null,
  rating integer not null check (rating between 1 and 3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists title_ratings_user_title_unique
  on title_ratings (user_id, media_type, tmdb_id);

create index if not exists title_ratings_title_idx
  on title_ratings (media_type, tmdb_id);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references users(id) on delete cascade,
  actor_user_id uuid references users(id) on delete set null,
  type text not null,
  entity_type text not null,
  entity_id uuid,
  source_release_event_id uuid,
  title text not null,
  message text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

alter table notifications
  add column if not exists source_release_event_id uuid;

create index if not exists notifications_recipient_created_idx
  on notifications (recipient_user_id, created_at desc);

create index if not exists notifications_recipient_unread_idx
  on notifications (recipient_user_id, read_at);

create unique index if not exists notifications_playlist_followed_unique
  on notifications (recipient_user_id, actor_user_id, type, entity_type, entity_id)
  where actor_user_id is not null;

create index if not exists notifications_type_idx
  on notifications (type);

create index if not exists notifications_entity_idx
  on notifications (entity_type, entity_id);

create unique index if not exists notifications_seasonal_challenge_unique
  on notifications (recipient_user_id, type, entity_type, entity_id)
  where entity_type = 'seasonal_challenge';

create unique index if not exists notifications_release_event_recipient_unique
  on notifications (recipient_user_id, source_release_event_id)
  where source_release_event_id is not null;

create table if not exists followed_titles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  media_item_id uuid not null references media_items(id) on delete cascade,
  media_type text not null
    check (media_type in ('movie', 'tv')),
  notification_settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table followed_titles
  add column if not exists notification_settings jsonb not null default '{}'::jsonb;

create unique index if not exists followed_titles_user_media_unique
  on followed_titles (user_id, media_item_id);

create index if not exists followed_titles_user_created_idx
  on followed_titles (user_id, created_at desc);

create index if not exists followed_titles_media_item_idx
  on followed_titles (media_item_id);

create table if not exists notification_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  followed_title_id uuid not null references followed_titles(id) on delete cascade,
  media_item_id uuid not null references media_items(id) on delete cascade,
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists notification_preferences_followed_title_unique
  on notification_preferences (followed_title_id);

create index if not exists notification_preferences_user_idx
  on notification_preferences (user_id);

create table if not exists release_tracking (
  id uuid primary key default gen_random_uuid(),
  media_item_id uuid not null references media_items(id) on delete cascade,
  media_type text not null
    check (media_type in ('movie', 'tv')),
  release_date date,
  status text,
  upcoming boolean not null default false,
  trailer_count integer not null default 0,
  provider_hash text,
  season_count integer,
  episode_count integer,
  last_checked_at timestamptz,
  change_hash text,
  last_release_check_status text,
  season_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  cached_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table release_tracking
  add column if not exists season_data jsonb not null default '{}'::jsonb,
  add column if not exists trailer_count integer not null default 0,
  add column if not exists provider_hash text,
  add column if not exists season_count integer,
  add column if not exists episode_count integer,
  add column if not exists last_checked_at timestamptz,
  add column if not exists change_hash text,
  add column if not exists last_release_check_status text,
  add column if not exists created_at timestamptz not null default now();

create unique index if not exists release_tracking_media_item_unique
  on release_tracking (media_item_id);

create index if not exists release_tracking_upcoming_idx
  on release_tracking (upcoming, release_date);

create index if not exists release_tracking_last_checked_idx
  on release_tracking (last_checked_at);

create table if not exists notification_events (
  id uuid primary key default gen_random_uuid(),
  media_item_id uuid not null references media_items(id) on delete cascade,
  media_type text not null
    check (media_type in ('movie', 'tv')),
  tmdb_id integer not null,
  event_type text not null,
  title text not null,
  body text not null,
  change_hash text not null,
  old_state jsonb not null default '{}'::jsonb,
  new_state jsonb not null default '{}'::jsonb,
  event_date timestamptz not null default now(),
  source text not null default 'release_intelligence',
  created_at timestamptz not null default now()
);

create unique index if not exists notification_events_media_event_change_unique
  on notification_events (media_item_id, event_type, change_hash);

create index if not exists notification_events_media_created_idx
  on notification_events (media_item_id, created_at desc);

create index if not exists notification_events_type_created_idx
  on notification_events (event_type, created_at desc);

create table if not exists release_events (
  id uuid primary key default gen_random_uuid(),
  media_item_id uuid not null references media_items(id) on delete cascade,
  media_type text not null
    check (media_type in ('movie', 'tv')),
  tmdb_id integer not null,
  event_type text not null,
  old_value jsonb,
  new_value jsonb,
  old_state jsonb not null default '{}'::jsonb,
  new_state jsonb not null default '{}'::jsonb,
  title text not null,
  body text not null,
  change_hash text not null,
  source text not null default 'release_intelligence',
  created_at timestamptz not null default now()
);

create unique index if not exists release_events_media_event_change_unique
  on release_events (media_item_id, event_type, change_hash);

create index if not exists release_events_media_created_idx
  on release_events (media_item_id, created_at desc);

create index if not exists release_events_type_created_idx
  on release_events (event_type, created_at desc);

create table if not exists release_event_notifications (
  id uuid primary key default gen_random_uuid(),
  release_event_id uuid not null references release_events(id) on delete cascade,
  notification_id uuid not null references notifications(id) on delete cascade,
  recipient_user_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create unique index if not exists release_event_notifications_event_recipient_unique
  on release_event_notifications (release_event_id, recipient_user_id);

create index if not exists release_event_notifications_recipient_idx
  on release_event_notifications (recipient_user_id, created_at desc);

create index if not exists release_event_notifications_notification_idx
  on release_event_notifications (notification_id);

create table if not exists tv_season_catalog (
  id uuid primary key default gen_random_uuid(),
  media_item_id uuid not null references media_items(id) on delete cascade,
  tmdb_show_id integer not null,
  season_number integer not null,
  tmdb_season_id integer,
  title text not null,
  overview text,
  poster_url text,
  air_date date,
  episode_count integer not null default 0,
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists tv_season_catalog_show_season_unique
  on tv_season_catalog (tmdb_show_id, season_number);

create index if not exists tv_season_catalog_media_item_idx
  on tv_season_catalog (media_item_id);

create table if not exists tv_episode_catalog (
  id uuid primary key default gen_random_uuid(),
  media_item_id uuid not null references media_items(id) on delete cascade,
  tmdb_show_id integer not null,
  season_number integer not null,
  episode_number integer not null,
  tmdb_episode_id integer,
  title text not null,
  overview text,
  runtime_minutes integer,
  air_date date,
  still_url text,
  released boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists tv_episode_catalog_show_episode_unique
  on tv_episode_catalog (tmdb_show_id, season_number, episode_number);

create index if not exists tv_episode_catalog_show_released_idx
  on tv_episode_catalog (tmdb_show_id, released, air_date);

create table if not exists user_episode_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  media_item_id uuid not null references media_items(id) on delete cascade,
  tmdb_show_id integer not null,
  tmdb_season_number integer not null,
  tmdb_episode_number integer not null,
  status text not null default 'not_started'
    check (status in ('not_started', 'watching', 'watched')),
  progress_percent integer not null default 0,
  last_watched_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists user_episode_progress_identity_unique
  on user_episode_progress (user_id, tmdb_show_id, tmdb_season_number, tmdb_episode_number);

create index if not exists user_episode_progress_user_recent_idx
  on user_episode_progress (user_id, last_watched_at desc);

create table if not exists user_season_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  media_item_id uuid not null references media_items(id) on delete cascade,
  tmdb_show_id integer not null,
  tmdb_season_number integer not null,
  status text not null default 'not_started'
    check (status in ('not_started', 'watching', 'completed')),
  progress_percent integer not null default 0,
  watched_episode_count integer not null default 0,
  released_episode_count integer not null default 0,
  last_watched_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists user_season_progress_identity_unique
  on user_season_progress (user_id, tmdb_show_id, tmdb_season_number);

create table if not exists user_show_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  media_item_id uuid not null references media_items(id) on delete cascade,
  tmdb_show_id integer not null,
  status text not null default 'not_started'
    check (status in ('not_started', 'watching', 'completed')),
  progress_percent integer not null default 0,
  current_season_number integer,
  current_episode_number integer,
  watched_episode_count integer not null default 0,
  released_episode_count integer not null default 0,
  last_watched_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists user_show_progress_identity_unique
  on user_show_progress (user_id, tmdb_show_id);

create index if not exists user_show_progress_user_recent_idx
  on user_show_progress (user_id, last_watched_at desc);

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_success_at timestamptz,
  last_failure_at timestamptz
);

alter table push_subscriptions
  add column if not exists enabled boolean not null default true,
  add column if not exists last_success_at timestamptz,
  add column if not exists last_failure_at timestamptz;

create unique index if not exists push_subscriptions_endpoint_unique
  on push_subscriptions (endpoint);

create index if not exists push_subscriptions_user_enabled_idx
  on push_subscriptions (user_id, enabled);

create table if not exists roulette_playlist_preferences (
  user_id uuid primary key references users(id) on delete cascade,
  excluded_playlist_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists push_notification_preferences (
  user_id uuid primary key references users(id) on delete cascade,
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists notification_delivery_log (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references notifications(id) on delete cascade,
  release_event_id uuid,
  recipient_user_id uuid not null references users(id) on delete cascade,
  push_subscription_id uuid references push_subscriptions(id) on delete set null,
  delivery_channel text not null default 'web_push',
  delivery_status text not null default 'pending',
  error_message text,
  sent_at timestamptz,
  opened_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table notification_delivery_log
  add column if not exists release_event_id uuid,
  add column if not exists delivery_channel text not null default 'web_push',
  add column if not exists delivery_status text not null default 'pending',
  add column if not exists opened_at timestamptz;

create unique index if not exists notification_delivery_push_unique
  on notification_delivery_log (notification_id, push_subscription_id, delivery_channel)
  where push_subscription_id is not null;

create index if not exists notification_delivery_recipient_idx
  on notification_delivery_log (recipient_user_id, created_at desc);

create index if not exists notification_delivery_status_idx
  on notification_delivery_log (delivery_status, created_at desc);

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

create table if not exists title_trivia (
  id uuid primary key default gen_random_uuid(),
  tmdb_id integer not null,
  media_type text not null
    check (media_type in ('movie', 'tv')),
  source_hash text not null,
  question text not null,
  answer text not null,
  options jsonb not null default '[]'::jsonb,
  explanation text,
  difficulty text not null default 'easy',
  spoiler_level text not null default 'none',
  source_urls jsonb not null default '[]'::jsonb,
  source_labels jsonb not null default '[]'::jsonb,
  confidence numeric not null default 0.8,
  status text not null default 'auto_generated',
  report_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table title_trivia
  add column if not exists source_urls jsonb not null default '[]'::jsonb;

alter table title_trivia
  add column if not exists source_labels jsonb not null default '[]'::jsonb;

alter table title_trivia
  add column if not exists confidence numeric not null default 0.8;

alter table title_trivia
  add column if not exists report_count integer not null default 0;

alter table title_trivia
  add column if not exists status text not null default 'auto_generated';

create index if not exists title_trivia_media_status_idx
  on title_trivia (media_type, tmdb_id, status);

create unique index if not exists title_trivia_media_source_question_unique
  on title_trivia (media_type, tmdb_id, source_hash, question);

create table if not exists title_trivia_reports (
  id uuid primary key default gen_random_uuid(),
  trivia_id uuid not null references title_trivia(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  reason text not null,
  created_at timestamptz not null default now()
);

create index if not exists title_trivia_reports_trivia_idx
  on title_trivia_reports (trivia_id, created_at desc);

create index if not exists title_trivia_reports_reason_idx
  on title_trivia_reports (reason);

create table if not exists title_easter_eggs (
  id uuid primary key default gen_random_uuid(),
  tmdb_id integer not null,
  media_type text not null
    check (media_type in ('movie', 'tv')),
  source_hash text not null,
  title text not null,
  prompt text not null,
  hint text,
  answer text not null,
  explanation text not null default '',
  difficulty text not null default 'easy',
  spoiler_level text not null default 'minor',
  source_urls jsonb not null default '[]'::jsonb,
  source_labels jsonb not null default '[]'::jsonb,
  confidence numeric not null default 0.8,
  status text not null default 'auto_generated',
  report_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table title_easter_eggs
  add column if not exists explanation text not null default '';

update title_easter_eggs
set status = 'hidden',
  updated_at = now()
where status in ('approved', 'auto_generated')
  and (
    prompt like 'Watch for one piece of technology%'
    or prompt like 'Look for a repeated object%'
  );

update title_easter_eggs
set
  title = 'Twin Pines / Lone Pine',
  answer = 'Twin Pines Mall became Lone Pine Mall.',
  explanation = 'Marty runs over one of Old Man Peabody''s twin pine trees in 1955, changing the mall name in 1985.',
  updated_at = now()
where media_type = 'movie'
  and tmdb_id = 105
  and prompt = 'Watch for the mall sign near the beginning and again after Marty returns to 1985.';

update title_easter_eggs
set
  explanation = 'The flyer is a small detail that becomes the key to Doc and Marty''s final plan.',
  updated_at = now()
where media_type = 'movie'
  and tmdb_id = 105
  and prompt = 'Notice how the town clock becomes important before the climax explains why.';

create unique index if not exists title_easter_eggs_media_source_prompt_unique
  on title_easter_eggs (media_type, tmdb_id, source_hash, prompt);

create index if not exists title_easter_eggs_media_status_idx
  on title_easter_eggs (media_type, tmdb_id, status);

create table if not exists title_easter_egg_reports (
  id uuid primary key default gen_random_uuid(),
  easter_egg_id uuid not null references title_easter_eggs(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  reason text not null,
  created_at timestamptz not null default now()
);

create index if not exists title_easter_egg_reports_hunt_idx
  on title_easter_egg_reports (easter_egg_id, created_at desc);

create table if not exists user_trivia_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  trivia_id uuid not null references title_trivia(id) on delete cascade,
  tmdb_id integer not null,
  media_type text not null
    check (media_type in ('movie', 'tv')),
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists user_trivia_progress_user_trivia_unique
  on user_trivia_progress (user_id, trivia_id);

create index if not exists user_trivia_progress_user_title_idx
  on user_trivia_progress (user_id, media_type, tmdb_id);

create table if not exists user_easter_egg_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  easter_egg_id uuid not null references title_easter_eggs(id) on delete cascade,
  tmdb_id integer not null,
  media_type text not null
    check (media_type in ('movie', 'tv')),
  status text not null default 'started'
    check (status in ('started', 'hint_used', 'answered', 'completed')),
  answer text,
  is_correct boolean,
  hint_used boolean not null default false,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table user_easter_egg_progress
  add column if not exists status text not null default 'completed';

alter table user_easter_egg_progress
  add column if not exists answer text;

alter table user_easter_egg_progress
  add column if not exists is_correct boolean;

alter table user_easter_egg_progress
  add column if not exists hint_used boolean not null default false;

alter table user_easter_egg_progress
  add column if not exists started_at timestamptz not null default now();

alter table user_easter_egg_progress
  alter column completed_at drop not null;

update user_easter_egg_progress
set
  status = 'completed',
  is_correct = true,
  started_at = coalesce(started_at, created_at),
  completed_at = coalesce(completed_at, created_at)
where completed_at is not null
  and status = 'started';

create unique index if not exists user_easter_egg_progress_user_hunt_unique
  on user_easter_egg_progress (user_id, easter_egg_id);

create index if not exists user_easter_egg_progress_user_title_idx
  on user_easter_egg_progress (user_id, media_type, tmdb_id);

create table if not exists achievements (
  id text primary key,
  name text not null,
  description text not null,
  badge_icon text not null default 'star',
  category text not null default 'companion',
  rarity text not null default 'common',
  tier text,
  points integer not null default 0,
  goal_count integer not null default 1,
  unlock_requirements jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table achievements
  add column if not exists rarity text not null default 'common';

alter table achievements
  add column if not exists tier text;

alter table achievements
  add column if not exists points integer not null default 0;

alter table achievements
  add column if not exists unlock_requirements jsonb not null default '{}'::jsonb;

create index if not exists achievements_category_idx
  on achievements (category);

create index if not exists achievements_rarity_idx
  on achievements (rarity);

create table if not exists user_achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  achievement_id text not null references achievements(id) on delete cascade,
  progress_count integer not null default 0,
  progress numeric not null default 0,
  completion_percentage integer not null default 0,
  goal_count integer not null default 1,
  earned_at timestamptz,
  unlocked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table user_achievements
  add column if not exists progress numeric not null default 0;

alter table user_achievements
  add column if not exists completion_percentage integer not null default 0;

alter table user_achievements
  add column if not exists earned_at timestamptz;

update user_achievements
set earned_at = unlocked_at
where earned_at is null
  and unlocked_at is not null;

create unique index if not exists user_achievements_user_achievement_unique
  on user_achievements (user_id, achievement_id);

create index if not exists user_achievements_user_unlocked_idx
  on user_achievements (user_id, unlocked_at desc);

create index if not exists user_achievements_user_earned_idx
  on user_achievements (user_id, earned_at desc);

insert into achievements (id, name, description, badge_icon, category, rarity, tier, points, goal_count, unlock_requirements, metadata)
values
  ('first_movie_watched', 'First Movie Watched', 'Mark your first movie as watched.', 'clapper', 'movies', 'common', 'bronze', 10, 1, '{"metric":"movies_watched","threshold":1}'::jsonb, '{}'::jsonb),
  ('movie_explorer_bronze', 'Movie Explorer Bronze', 'Mark 10 movies as watched.', 'compass', 'movies', 'common', 'bronze', 10, 10, '{"metric":"movies_watched","threshold":10}'::jsonb, '{}'::jsonb),
  ('movie_collector_silver', 'Movie Collector Silver', 'Mark 50 movies as watched.', 'film-stack', 'movies', 'rare', 'silver', 25, 50, '{"metric":"movies_watched","threshold":50}'::jsonb, '{}'::jsonb),
  ('episode_tracker_bronze', 'Episode Tracker Bronze', 'Track 10 TV episodes.', 'tv', 'tv', 'common', 'bronze', 10, 10, '{"metric":"episodes_watched","threshold":10}'::jsonb, '{}'::jsonb),
  ('season_finisher_silver', 'Season Finisher Silver', 'Finish 3 TV seasons.', 'season', 'tv', 'rare', 'silver', 25, 3, '{"metric":"seasons_completed","threshold":3}'::jsonb, '{}'::jsonb),
  ('binge_watcher_gold', 'Binge Watcher Gold', 'Track 100 watched episodes.', 'bolt', 'tv', 'epic', 'gold', 50, 100, '{"metric":"episodes_watched","threshold":100}'::jsonb, '{}'::jsonb),
  ('playlist_creator_bronze', 'Playlist Creator Bronze', 'Create your first playlist.', 'playlist', 'playlists', 'common', 'bronze', 10, 1, '{"metric":"playlists_created","threshold":1}'::jsonb, '{}'::jsonb),
  ('playlist_collector_bronze', 'Playlist Collector Bronze', 'Follow 5 public playlists.', 'bookmark', 'playlists', 'common', 'bronze', 10, 5, '{"metric":"playlists_followed","threshold":5}'::jsonb, '{}'::jsonb),
  ('playlist_curator_silver', 'Playlist Curator Silver', 'Publish 3 public playlists.', 'spark', 'playlists', 'rare', 'silver', 25, 3, '{"metric":"public_playlists_created","threshold":3}'::jsonb, '{}'::jsonb),
  ('movie_buff_bronze', 'Movie Buff Bronze', 'Answer 10 trivia questions.', 'star', 'trivia', 'common', 'bronze', 10, 10, '{"metric":"trivia_completed","threshold":10}'::jsonb, '{}'::jsonb),
  ('film_fanatic_silver', 'Film Fanatic Silver', 'Answer 50 trivia questions.', 'stars', 'trivia', 'rare', 'silver', 25, 50, '{"metric":"trivia_completed","threshold":50}'::jsonb, '{}'::jsonb),
  ('trivia_master_gold', 'Trivia Master Gold', 'Answer 100 trivia questions.', 'trophy', 'trivia', 'epic', 'gold', 50, 100, '{"metric":"trivia_completed","threshold":100}'::jsonb, '{}'::jsonb),
  ('movie_detective', 'Movie Detective', 'Complete 10 trivia questions.', 'detective', 'trivia', 'common', 'bronze', 10, 10, '{"metric":"trivia_completed","threshold":10}'::jsonb, '{}'::jsonb),
  ('easter_egg_hunter', 'Easter Egg Hunter', 'Complete 5 Easter Egg Hunts.', 'egg', 'easter_eggs', 'common', 'bronze', 10, 5, '{"metric":"easter_eggs_completed","threshold":5}'::jsonb, '{}'::jsonb),
  ('easter_egg_hunter_silver', 'Easter Egg Hunter Silver', 'Complete 25 Easter Egg Hunts.', 'egg', 'easter_eggs', 'rare', 'silver', 25, 25, '{"metric":"easter_eggs_completed","threshold":25}'::jsonb, '{}'::jsonb),
  ('easter_egg_hunter_gold', 'Easter Egg Hunter Gold', 'Complete 100 Easter Egg Hunts.', 'target', 'easter_eggs', 'epic', 'gold', 50, 100, '{"metric":"easter_eggs_completed","threshold":100}'::jsonb, '{}'::jsonb),
  ('master_hunter_gold', 'Master Hunter Gold', 'Complete 25 Easter Egg Hunts.', 'target', 'easter_eggs', 'epic', 'gold', 50, 25, '{"metric":"easter_eggs_completed","threshold":25}'::jsonb, '{}'::jsonb),
  ('sci_fi_expert_bronze', 'Sci-Fi Expert Bronze', 'Complete companion progress in 3 sci-fi titles.', 'rocket', 'collections', 'common', 'bronze', 10, 3, '{"metric":"genre_titles_completed","genre":"Science Fiction","threshold":3}'::jsonb, '{}'::jsonb),
  ('horror_expert_bronze', 'Horror Expert Bronze', 'Complete companion progress in 3 horror titles.', 'mask', 'collections', 'common', 'bronze', 10, 3, '{"metric":"genre_titles_completed","genre":"Horror","threshold":3}'::jsonb, '{}'::jsonb),
  ('comedy_expert_bronze', 'Comedy Expert Bronze', 'Complete companion progress in 3 comedy titles.', 'laugh', 'collections', 'common', 'bronze', 10, 3, '{"metric":"genre_titles_completed","genre":"Comedy","threshold":3}'::jsonb, '{}'::jsonb),
  ('disaster_expert_bronze', 'Disaster Expert Bronze', 'Complete companion progress in 3 disaster titles.', 'storm', 'collections', 'common', 'bronze', 10, 3, '{"metric":"playlist_keyword_watched","keyword":"disaster","threshold":3}'::jsonb, '{}'::jsonb),
  ('franchise_expert_bronze', 'Franchise Expert Bronze', 'Complete companion progress in 3 related franchise titles.', 'collection', 'collections', 'common', 'bronze', 10, 3, '{"metric":"collection_titles_completed","threshold":3}'::jsonb, '{}'::jsonb),
  ('back_to_the_future_expert', 'Back to the Future Expert', 'Complete every available trivia question and Easter Egg Hunt for Back to the Future.', 'clock', 'collections', 'rare', 'gold', 50, 1, '{"metric":"title_companion_complete","mediaType":"movie","tmdbId":105,"threshold":1}'::jsonb, '{"mediaType":"movie","tmdbId":105}'::jsonb)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  badge_icon = excluded.badge_icon,
  category = excluded.category,
  rarity = excluded.rarity,
  tier = excluded.tier,
  points = excluded.points,
  goal_count = excluded.goal_count,
  unlock_requirements = excluded.unlock_requirements,
  metadata = excluded.metadata,
  updated_at = now();

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
  profile_image_url text,
  hero_image_url text,
  favorite_movie text,
  favorite_genre text,
  favorite_director text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table user_profiles
  add column if not exists province_state text;

alter table user_profiles
  add column if not exists profile_image_url text;

alter table user_profiles
  add column if not exists hero_image_url text;

alter table user_profiles
  add column if not exists favorite_movie text;

alter table user_profiles
  add column if not exists favorite_genre text;

alter table user_profiles
  add column if not exists favorite_director text;

create unique index if not exists user_profiles_handle_unique
  on user_profiles (handle);

create unique index if not exists user_profiles_user_id_unique
  on user_profiles (user_id);

create table if not exists user_follows (
  id uuid primary key default gen_random_uuid(),
  follower_user_id uuid not null references users(id) on delete cascade,
  followed_user_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (follower_user_id <> followed_user_id)
);

create unique index if not exists user_follows_pair_unique
  on user_follows (follower_user_id, followed_user_id);

create index if not exists user_follows_follower_idx
  on user_follows (follower_user_id);

create index if not exists user_follows_followed_idx
  on user_follows (followed_user_id);

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
