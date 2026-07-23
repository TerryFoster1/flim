import { checkRateLimit, ensureAuthTables, ensurePgCrypto, getCurrentUser } from "./_db.js";

export type BacklotGameId = "relic-run-lost-chapter" | "triceratops-backlot-runner";

export type BacklotDiscoverySourceType =
  | "arcade_mode"
  | "title_trivia"
  | "challenge_theme"
  | "collection_theme";

export type BacklotEventType =
  | "launch"
  | "pause"
  | "resume"
  | "game_over"
  | "score"
  | "achievement";

export interface BacklotGameRegistration {
  id: BacklotGameId;
  title: string;
  description: string;
  route: string;
  difficulty: "easy" | "medium" | "hard" | "expert";
  estimatedPlayTimeMinutes: number;
  genre: string;
  unlockType: "discovery";
  rewardId: string;
  achievementSetId: string;
  statisticsProvider: string;
  saveProvider: string;
  launchProvider: string;
}

interface DiscoveryRule {
  gameId: BacklotGameId;
  sourceType: BacklotDiscoverySourceType;
  sourceId: string;
  sourceTitle: string;
}

const backlotGames: BacklotGameRegistration[] = [
  {
    id: "relic-run-lost-chapter",
    title: "Relic Run",
    description: "Dash through a lost adventure reel hidden inside Flim.",
    route: "/games/relic-run",
    difficulty: "medium",
    estimatedPlayTimeMinutes: 3,
    genre: "adventure",
    unlockType: "discovery",
    rewardId: "relic-run-lost-chapter-ticket-bonus",
    achievementSetId: "relic-run-lost-chapter-achievements",
    statisticsProvider: "backlot.server.stats.v1",
    saveProvider: "backlot.server.save.v1",
    launchProvider: "native.expo-router"
  },
  {
    id: "triceratops-backlot-runner",
    title: "TRICERATOPS!",
    description: "Terror on Backlot Boulevard, uncovered through dinosaur movie play.",
    route: "/games/triceratops",
    difficulty: "medium",
    estimatedPlayTimeMinutes: 3,
    genre: "dinosaur",
    unlockType: "discovery",
    rewardId: "triceratops-runner-ticket-bonus",
    achievementSetId: "triceratops-backlot-runner-achievements",
    statisticsProvider: "backlot.server.stats.v1",
    saveProvider: "backlot.server.save.v1",
    launchProvider: "native.expo-router"
  }
];

const discoveryRules: DiscoveryRule[] = [
  {
    gameId: "relic-run-lost-chapter",
    sourceType: "arcade_mode",
    sourceId: "poster-guess",
    sourceTitle: "Movie Reveal"
  },
  {
    gameId: "triceratops-backlot-runner",
    sourceType: "challenge_theme",
    sourceId: "dinosaur-theme",
    sourceTitle: "Dinosaur Movie Challenge"
  },
  {
    gameId: "triceratops-backlot-runner",
    sourceType: "title_trivia",
    sourceId: "jurassic-park",
    sourceTitle: "Jurassic Park Trivia"
  },
  {
    gameId: "triceratops-backlot-runner",
    sourceType: "title_trivia",
    sourceId: "jurassic-world",
    sourceTitle: "Jurassic World Trivia"
  },
  {
    gameId: "triceratops-backlot-runner",
    sourceType: "title_trivia",
    sourceId: "the-land-before-time",
    sourceTitle: "The Land Before Time Trivia"
  },
  {
    gameId: "triceratops-backlot-runner",
    sourceType: "title_trivia",
    sourceId: "dinosaur",
    sourceTitle: "Dinosaur Trivia"
  }
];

const validEventTypes = new Set<BacklotEventType>(["launch", "pause", "resume", "game_over", "score", "achievement"]);

export function visibleBacklotGame(gameId: string) {
  const game = backlotGames.find((item) => item.id === gameId);
  if (!game) return null;
  return {
    id: game.id,
    title: game.title,
    description: game.description,
    route: game.route,
    difficulty: game.difficulty,
    estimatedPlayTimeMinutes: game.estimatedPlayTimeMinutes,
    genre: game.genre,
    rewardId: game.rewardId,
    achievementSetId: game.achievementSetId
  };
}

export function validateBacklotDiscovery(body: any) {
  const gameId = String(body?.gameId || "");
  const sourceType = String(body?.sourceType || "") as BacklotDiscoverySourceType;
  const sourceId = String(body?.sourceId || "");
  const rule = discoveryRules.find(
    (item) => item.gameId === gameId && item.sourceType === sourceType && item.sourceId === sourceId
  );
  return rule || null;
}

export function validateBacklotEventType(value: unknown): BacklotEventType | null {
  const eventType = String(value || "") as BacklotEventType;
  return validEventTypes.has(eventType) ? eventType : null;
}

export async function ensureBacklotTables(sql: any) {
  await ensureAuthTables(sql);
  await ensurePgCrypto(sql);
  await sql`
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
    )
  `;
  await sql`
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
    )
  `;
  await sql`
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
    )
  `;
  await sql`
    create table if not exists user_backlot_unlocks (
      user_id uuid not null references users(id) on delete cascade,
      game_id text not null references backlot_games(id) on delete cascade,
      unlocked_at timestamptz not null default now(),
      primary key (user_id, game_id)
    )
  `;
  await sql`
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
    )
  `;
  await sql`
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
    )
  `;
  await sql`create index if not exists user_backlot_discoveries_user_idx on user_backlot_discoveries (user_id, discovered_at desc)`;
  await sql`create index if not exists user_backlot_game_stats_user_idx on user_backlot_game_stats (user_id, updated_at desc)`;
  await sql`create index if not exists backlot_game_events_user_idx on backlot_game_events (user_id, created_at desc)`;

  for (const game of backlotGames) {
    await sql`
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
      values (
        ${game.id},
        ${game.title},
        ${game.description},
        ${game.route},
        ${game.difficulty},
        ${game.estimatedPlayTimeMinutes},
        ${game.genre},
        ${game.unlockType},
        ${game.rewardId},
        ${game.achievementSetId},
        ${game.statisticsProvider},
        ${game.saveProvider},
        ${game.launchProvider},
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
        updated_at = now()
    `;
  }

  for (const rule of discoveryRules) {
    await sql`
      insert into backlot_discovery_locations (game_id, source_type, source_id, source_title, status, updated_at)
      values (${rule.gameId}, ${rule.sourceType}, ${rule.sourceId}, ${rule.sourceTitle}, 'active', now())
      on conflict (game_id, source_type, source_id) do update set
        source_title = excluded.source_title,
        status = excluded.status,
        updated_at = now()
    `;
  }
}

export async function getBacklotState(sql: any, request: any) {
  await ensureBacklotTables(sql);
  const user = await getCurrentUser(sql, request);
  if (!user) return null;

  const rows = await sql`
    select
      d.id,
      d.game_id,
      g.title as game_title,
      g.description as game_description,
      g.route,
      g.difficulty,
      g.estimated_play_time_minutes,
      g.genre,
      g.reward_id,
      g.achievement_set_id,
      d.discovery_source_type,
      d.discovery_source_id,
      d.discovery_source_title,
      d.discovered_at,
      d.unlocked_at,
      s.first_played_at,
      coalesce(s.total_play_time_ms, 0) as total_play_time_ms
    from user_backlot_discoveries d
    inner join backlot_games g on g.id = d.game_id and g.status = 'active'
    left join user_backlot_game_stats s on s.user_id = d.user_id and s.game_id = d.game_id
    where d.user_id = ${user.id}
    order by d.discovered_at desc
  `;

  const games = rows.map((row: any) => ({
    id: row.game_id,
    title: row.game_title,
    description: row.game_description,
    route: row.route,
    difficulty: row.difficulty,
    estimatedPlayTimeMinutes: Number(row.estimated_play_time_minutes || 3),
    genre: row.genre,
    rewardId: row.reward_id || undefined,
    achievementSetId: row.achievement_set_id || undefined
  }));

  return {
    userId: user.id,
    unlockIds: Array.from(new Set(rows.map((row: any) => row.game_id))),
    discoveries: rows.map((row: any) => ({
      id: row.id,
      gameId: row.game_id,
      gameTitle: row.game_title,
      sourceType: row.discovery_source_type,
      sourceId: row.discovery_source_id,
      sourceTitle: row.discovery_source_title,
      discoveredAt: row.discovered_at,
      unlockedAt: row.unlocked_at,
      firstPlayedAt: row.first_played_at || null,
      totalPlayTimeMs: Number(row.total_play_time_ms || 0)
    })),
    games,
    progress: {
      discoveredCount: rows.length,
      secretsRemainingLabel: "??"
    }
  };
}

export async function discoverBacklotGame(sql: any, request: any, body: any) {
  await ensureBacklotTables(sql);
  const user = await getCurrentUser(sql, request);
  if (!user) return { status: 401, body: { error: "Sign in to save Backlot discoveries." } };

  await checkRateLimit(sql, request, "backlot:discover", user.id, 60, 60 * 60);
  const rule = validateBacklotDiscovery(body);
  if (!rule) return { status: 403, body: { error: "That Backlot discovery could not be verified." } };

  const rows = await sql`
    insert into user_backlot_discoveries (
      user_id,
      game_id,
      discovery_source_type,
      discovery_source_id,
      discovery_source_title,
      client_discovery_id
    )
    values (
      ${user.id},
      ${rule.gameId},
      ${rule.sourceType},
      ${rule.sourceId},
      ${String(body?.sourceTitle || rule.sourceTitle).slice(0, 120)},
      ${String(body?.clientDiscoveryId || "").slice(0, 120) || null}
    )
    on conflict (user_id, game_id) do update set
      discovery_source_type = user_backlot_discoveries.discovery_source_type,
      discovery_source_id = user_backlot_discoveries.discovery_source_id,
      discovery_source_title = user_backlot_discoveries.discovery_source_title
    returning id, (xmax = 0) as created
  `;

  await sql`
    insert into user_backlot_unlocks (user_id, game_id)
    values (${user.id}, ${rule.gameId})
    on conflict (user_id, game_id) do nothing
  `;

  const state = await getBacklotState(sql, request);
  return { status: 200, body: { ok: true, created: Boolean(rows[0]?.created), state } };
}

export async function recordBacklotEvent(sql: any, request: any, body: any) {
  await ensureBacklotTables(sql);
  const user = await getCurrentUser(sql, request);
  if (!user) return { status: 401, body: { error: "Sign in to save Backlot progress." } };

  await checkRateLimit(sql, request, "backlot:event", user.id, 180, 60 * 60);
  const gameId = String(body?.gameId || "");
  const eventType = validateBacklotEventType(body?.eventType);
  const hasUnlock = await sql`
    select 1 from user_backlot_unlocks
    where user_id = ${user.id} and game_id = ${gameId}
    limit 1
  `;
  if (!eventType || !visibleBacklotGame(gameId) || !hasUnlock[0]) {
    return { status: 403, body: { error: "That Backlot event could not be verified." } };
  }

  const score = Number.isFinite(Number(body?.score)) ? Math.max(0, Math.round(Number(body.score))) : null;
  const playTimeMs = Number.isFinite(Number(body?.playTimeMs)) ? Math.max(0, Math.round(Number(body.playTimeMs))) : null;
  const achievementEvent = eventType === "achievement" ? String(body?.achievementEvent || "").slice(0, 120) : null;

  await sql`
    insert into backlot_game_events (user_id, game_id, event_type, score, play_time_ms, achievement_event, client_event_id)
    values (
      ${user.id},
      ${gameId},
      ${eventType},
      ${score},
      ${playTimeMs},
      ${achievementEvent},
      ${String(body?.clientEventId || "").slice(0, 120) || null}
    )
  `;

  await sql`
    insert into user_backlot_game_stats (
      user_id,
      game_id,
      first_played_at,
      last_played_at,
      total_play_time_ms,
      best_score,
      launch_count,
      achievement_events,
      updated_at
    )
    values (
      ${user.id},
      ${gameId},
      case when ${eventType} = 'launch' then now() else null end,
      now(),
      ${playTimeMs || 0},
      ${score},
      case when ${eventType} = 'launch' then 1 else 0 end,
      case when ${eventType} = 'achievement' then 1 else 0 end,
      now()
    )
    on conflict (user_id, game_id) do update set
      first_played_at = coalesce(user_backlot_game_stats.first_played_at, excluded.first_played_at),
      last_played_at = excluded.last_played_at,
      total_play_time_ms = user_backlot_game_stats.total_play_time_ms + excluded.total_play_time_ms,
      best_score = greatest(coalesce(user_backlot_game_stats.best_score, 0), coalesce(excluded.best_score, 0)),
      launch_count = user_backlot_game_stats.launch_count + excluded.launch_count,
      achievement_events = user_backlot_game_stats.achievement_events + excluded.achievement_events,
      updated_at = now()
  `;

  return { status: 200, body: { ok: true, state: await getBacklotState(sql, request) } };
}
