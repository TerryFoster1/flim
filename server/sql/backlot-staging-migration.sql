-- Backlot Arcade staging migration.
-- Safe to run repeatedly against the Flim staging/preview database.
-- Assumes the core auth schema exists, including the users table.

create extension if not exists pgcrypto;

create table if not exists backlot_games (
  id text primary key,
  title text not null,
  description text not null default '',
  route text not null,
  difficulty text not null,
  estimated_play_time_minutes integer not null default 3,
  genre text not null default 'arcade',
  unlock_type text not null default 'discovery',
  reward_id text,
  achievement_set_id text,
  statistics_provider text not null default 'backlot.server.stats.v1',
  save_provider text not null default 'backlot.server.save.v1',
  launch_provider text not null default 'native.expo-router',
  status text not null default 'active' check (status in ('draft', 'active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists backlot_discovery_locations (
  id uuid primary key default gen_random_uuid(),
  game_id text not null references backlot_games(id) on delete cascade,
  source_type text not null,
  source_id text not null,
  source_title text not null default '',
  status text not null default 'active' check (status in ('draft', 'active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (game_id, source_type, source_id)
);

create table if not exists user_backlot_discoveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  game_id text not null references backlot_games(id) on delete cascade,
  discovery_source_type text not null,
  discovery_source_id text not null,
  discovery_source_title text not null default '',
  client_discovery_id text,
  discovered_at timestamptz not null default now(),
  unlocked_at timestamptz not null default now(),
  unique (user_id, game_id)
);

create table if not exists user_backlot_unlocks (
  user_id uuid not null references users(id) on delete cascade,
  game_id text not null references backlot_games(id) on delete cascade,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, game_id)
);

create table if not exists user_backlot_game_stats (
  user_id uuid not null references users(id) on delete cascade,
  game_id text not null references backlot_games(id) on delete cascade,
  first_played_at timestamptz,
  last_played_at timestamptz,
  total_play_time_ms integer not null default 0,
  best_score integer,
  launch_count integer not null default 0,
  achievement_events integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, game_id)
);

create table if not exists backlot_game_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  game_id text not null references backlot_games(id) on delete cascade,
  event_type text not null,
  score integer,
  play_time_ms integer,
  achievement_event text,
  client_event_id text,
  created_at timestamptz not null default now()
);

create index if not exists user_backlot_discoveries_user_idx
  on user_backlot_discoveries (user_id, discovered_at desc);

create index if not exists user_backlot_game_stats_user_idx
  on user_backlot_game_stats (user_id, updated_at desc);

create index if not exists backlot_game_events_user_idx
  on backlot_game_events (user_id, created_at desc);

insert into backlot_games (
  id,
  title,
  description,
  route,
  difficulty,
  estimated_play_time_minutes,
  genre,
  unlock_type,
  reward_id,
  achievement_set_id,
  statistics_provider,
  save_provider,
  launch_provider,
  status,
  updated_at
)
values
  (
    'relic-run-lost-chapter',
    'Relic Run',
    'Dash through a lost adventure reel hidden inside Flim.',
    '/games/relic-run',
    'medium',
    3,
    'adventure',
    'discovery',
    'relic-run-lost-chapter-ticket-bonus',
    'relic-run-lost-chapter-achievements',
    'backlot.server.stats.v1',
    'backlot.server.save.v1',
    'native.expo-router',
    'active',
    now()
  ),
  (
    'triceratops-backlot-runner',
    'TRICERATOPS!',
    'Terror on Backlot Boulevard, uncovered through dinosaur movie play.',
    '/games/triceratops',
    'medium',
    3,
    'dinosaur',
    'discovery',
    'triceratops-runner-ticket-bonus',
    'triceratops-backlot-runner-achievements',
    'backlot.server.stats.v1',
    'backlot.server.save.v1',
    'native.expo-router',
    'active',
    now()
  )
on conflict (id) do update set
  title = excluded.title,
  description = excluded.description,
  route = excluded.route,
  difficulty = excluded.difficulty,
  estimated_play_time_minutes = excluded.estimated_play_time_minutes,
  genre = excluded.genre,
  unlock_type = excluded.unlock_type,
  reward_id = excluded.reward_id,
  achievement_set_id = excluded.achievement_set_id,
  statistics_provider = excluded.statistics_provider,
  save_provider = excluded.save_provider,
  launch_provider = excluded.launch_provider,
  status = excluded.status,
  updated_at = now();

insert into backlot_discovery_locations (game_id, source_type, source_id, source_title, status, updated_at)
values
  ('relic-run-lost-chapter', 'arcade_mode', 'poster-guess', 'Movie Reveal', 'active', now()),
  ('triceratops-backlot-runner', 'challenge_theme', 'dinosaur-theme', 'Dinosaur Movie Challenge', 'active', now()),
  ('triceratops-backlot-runner', 'title_trivia', 'jurassic-park', 'Jurassic Park Trivia', 'active', now()),
  ('triceratops-backlot-runner', 'title_trivia', 'jurassic-world', 'Jurassic World Trivia', 'active', now()),
  ('triceratops-backlot-runner', 'title_trivia', 'the-land-before-time', 'The Land Before Time Trivia', 'active', now()),
  ('triceratops-backlot-runner', 'title_trivia', 'dinosaur', 'Dinosaur Trivia', 'active', now())
on conflict (game_id, source_type, source_id) do update set
  source_title = excluded.source_title,
  status = excluded.status,
  updated_at = now();
