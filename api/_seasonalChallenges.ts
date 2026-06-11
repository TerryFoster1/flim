import { ensureCollectionChallengeTables } from "./_challenges.js";
import { ensureNotificationsTable } from "./_db.js";

type SeasonalStatus = "upcoming" | "active" | "ended";

interface SeasonalRequirement {
  type: "movies_watched" | "tv_episodes_watched" | "collection_progress" | "trivia_completed" | "easter_eggs_completed" | "challenge_completed";
  label: string;
  target: number;
  genre?: string;
  collectionSlug?: string;
  challengeId?: string;
}

const defaultEvents = [
  {
    slug: "halloween-horror-2026",
    seasonKey: "halloween",
    name: "Halloween Horror Challenge",
    description: "Watch horror picks, answer trivia, and hunt for spooky details before Halloween ends.",
    startDate: "2026-09-15",
    endDate: "2026-10-31",
    badge: "Halloween Horror Hunter 2026",
    banner: "horror",
    difficulty: "medium",
    points: 100,
    requirements: [
      { type: "movies_watched", label: "Watch 5 horror movies", target: 5, genre: "Horror" },
      { type: "trivia_completed", label: "Complete 10 horror trivia questions", target: 10, genre: "Horror" },
      { type: "easter_eggs_completed", label: "Find 3 horror Easter Eggs", target: 3, genre: "Horror" },
    ],
  },
  {
    slug: "christmas-movie-2026",
    seasonKey: "christmas",
    name: "Christmas Movie Challenge",
    description: "Build a holiday movie streak and earn a seasonal badge.",
    startDate: "2026-11-15",
    endDate: "2026-12-31",
    badge: "Christmas Movie Marathoner 2026",
    banner: "holiday",
    difficulty: "easy",
    points: 80,
    requirements: [
      { type: "movies_watched", label: "Watch 5 Christmas or family movies", target: 5, genre: "Family" },
      { type: "trivia_completed", label: "Complete 5 holiday trivia questions", target: 5 },
    ],
  },
  {
    slug: "summer-blockbuster-2026",
    seasonKey: "summer_blockbusters",
    name: "Summer Blockbuster Challenge",
    description: "Finish action, adventure, and franchise movie goals during blockbuster season.",
    startDate: "2026-05-15",
    endDate: "2026-08-31",
    badge: "Summer Blockbuster Champion 2026",
    banner: "blockbuster",
    difficulty: "medium",
    points: 100,
    requirements: [
      { type: "movies_watched", label: "Watch 8 action or adventure movies", target: 8, genre: "Action" },
      { type: "challenge_completed", label: "Complete 1 collection challenge", target: 1 },
    ],
  },
  {
    slug: "oscar-challenge-2026",
    seasonKey: "oscars",
    name: "Oscar Challenge",
    description: "Watch award-season films and complete companion trivia.",
    startDate: "2026-01-15",
    endDate: "2026-03-31",
    badge: "Oscar Expert 2026",
    banner: "awards",
    difficulty: "medium",
    points: 90,
    requirements: [
      { type: "movies_watched", label: "Watch 6 drama movies", target: 6, genre: "Drama" },
      { type: "trivia_completed", label: "Complete 10 trivia questions", target: 10 },
    ],
  },
];

function safeJson(value: unknown) {
  return JSON.stringify(value || []);
}

function dateOnly(value: unknown) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const raw = String(value || "");
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const date = new Date(raw);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : raw.slice(0, 10);
}

function todayStatus(startDate: unknown, endDate: unknown): SeasonalStatus {
  const now = new Date();
  const start = new Date(`${dateOnly(startDate)}T00:00:00Z`);
  const end = new Date(`${dateOnly(endDate)}T23:59:59Z`);
  if (now < start) return "upcoming";
  if (now > end) return "ended";
  return "active";
}

function daysRemaining(endDate: unknown) {
  const end = new Date(`${dateOnly(endDate)}T23:59:59Z`).getTime();
  const diff = end - Date.now();
  return Math.max(0, Math.ceil(diff / 86400000));
}

function normalizeRequirements(value: unknown): SeasonalRequirement[] {
  if (!value) return [];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return Array.isArray(value) ? value as SeasonalRequirement[] : [];
}

function normalizeGenre(value?: string) {
  return String(value || "").trim().toLowerCase();
}

async function safeCount(query: Promise<any[]>) {
  try {
    const rows = await query;
    return Number(rows[0]?.count || 0);
  } catch {
    return 0;
  }
}

export async function ensureSeasonalChallengeTables(sql: any) {
  await ensureCollectionChallengeTables(sql);
  await ensureNotificationsTable(sql);
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
    )
  `);
  await safe(sql`alter table seasonal_challenge_events add column if not exists season_key text not null default 'general'`);
  await safe(sql`alter table seasonal_challenge_events add column if not exists is_active boolean not null default true`);
  await safe(sql`create index if not exists seasonal_challenge_events_status_dates_idx on seasonal_challenge_events (status, start_date, end_date)`);
  await safe(sql`create index if not exists seasonal_challenge_events_active_window_idx on seasonal_challenge_events (is_active, status, start_date, end_date)`);
  await safe(sql`create index if not exists seasonal_challenge_events_slug_idx on seasonal_challenge_events (slug)`);

  await safe(sql`
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
    )
  `);
  await safe(sql`create unique index if not exists user_seasonal_challenges_user_event_unique on user_seasonal_challenges (user_id, event_id)`);
  await safe(sql`create index if not exists user_seasonal_challenges_user_status_idx on user_seasonal_challenges (user_id, status, updated_at desc)`);
  await safe(sql`
    create unique index if not exists notifications_seasonal_challenge_unique
    on notifications (recipient_user_id, type, entity_type, entity_id)
    where entity_type = 'seasonal_challenge'
  `);

  for (const event of defaultEvents) {
    await sql`
      insert into seasonal_challenge_events (
        slug,
        name,
        description,
        start_date,
        end_date,
        badge,
        banner,
        season_key,
        is_active,
        difficulty,
        requirements,
        points,
        status,
        updated_at
      )
      values (
        ${event.slug},
        ${event.name},
        ${event.description},
        ${event.startDate},
        ${event.endDate},
        ${event.badge},
        ${event.banner},
        ${event.seasonKey},
        true,
        ${event.difficulty},
        ${safeJson(event.requirements)}::jsonb,
        ${event.points},
        'published',
        now()
      )
      on conflict (slug) do nothing
    `;
  }

  await sql`
    update seasonal_challenge_events
    set
      season_key = case slug
        when 'halloween-horror-2026' then case when season_key = 'general' then 'halloween' else season_key end
        when 'christmas-movie-2026' then case when season_key = 'general' then 'christmas' else season_key end
        when 'summer-blockbuster-2026' then case when season_key = 'general' then 'summer_blockbusters' else season_key end
        when 'oscar-challenge-2026' then case when season_key = 'general' then 'oscars' else season_key end
        else season_key
      end,
      start_date = case slug
        when 'halloween-horror-2026' then case when start_date = date '2026-10-01' then date '2026-09-15' else start_date end
        when 'christmas-movie-2026' then case when start_date = date '2026-12-01' then date '2026-11-15' else start_date end
        when 'summer-blockbuster-2026' then case when start_date = date '2026-06-01' then date '2026-05-15' else start_date end
        else start_date
      end,
      updated_at = now()
    where slug in (
      'halloween-horror-2026',
      'christmas-movie-2026',
      'summer-blockbuster-2026',
      'oscar-challenge-2026'
    )
  `;
}

async function progressForRequirement(sql: any, userId: string | undefined, requirement: SeasonalRequirement) {
  if (!userId) return 0;
  const genre = normalizeGenre(requirement.genre);

  if (requirement.type === "movies_watched") {
    if (genre) {
      return safeCount(sql`
        select count(distinct pm.tmdb_id)::int as count
        from playlist_movies pm
        inner join playlists p on p.id = pm.playlist_id
        left join media_items mi on mi.media_type = coalesce(pm.media_type, 'movie') and mi.tmdb_id = pm.tmdb_id
        where p.owner_user_id = ${userId}
          and coalesce(pm.media_type, 'movie') = 'movie'
          and pm.watched = true
          and (
            lower(coalesce(mi.genres::text, '')) like ${`%${genre}%`}
            or lower(coalesce(pm.title, '')) like ${`%${genre}%`}
          )
      `);
    }
    return safeCount(sql`
      select count(distinct pm.tmdb_id)::int as count
      from playlist_movies pm
      inner join playlists p on p.id = pm.playlist_id
      where p.owner_user_id = ${userId}
        and coalesce(pm.media_type, 'movie') = 'movie'
        and pm.watched = true
    `);
  }

  if (requirement.type === "tv_episodes_watched") {
    return safeCount(sql`select count(*)::int as count from user_episode_progress where user_id = ${userId} and status = 'watched'`);
  }

  if (requirement.type === "collection_progress" && requirement.collectionSlug) {
    const rows = await sql`
      select ucp.completion_percent
      from user_collection_progress ucp
      inner join media_collections mc on mc.id = ucp.collection_id
      where ucp.user_id = ${userId}
        and mc.slug = ${requirement.collectionSlug}
      limit 1
    `;
    return Number(rows[0]?.completion_percent || 0);
  }

  if (requirement.type === "challenge_completed") {
    if (requirement.challengeId) {
      return safeCount(sql`
        select count(*)::int as count
        from user_collection_challenges
        where user_id = ${userId}
          and challenge_id = ${requirement.challengeId}
          and completed_at is not null
      `);
    }
    return safeCount(sql`
      select count(*)::int as count
      from user_collection_challenges
      where user_id = ${userId}
        and completed_at is not null
    `);
  }

  if (requirement.type === "trivia_completed") {
    if (genre) {
      return safeCount(sql`
        select count(*)::int as count
        from user_trivia_progress utp
        left join media_items mi on mi.media_type = utp.media_type and mi.tmdb_id = utp.tmdb_id
        where utp.user_id = ${userId}
          and lower(coalesce(mi.genres::text, '')) like ${`%${genre}%`}
      `);
    }
    return safeCount(sql`select count(*)::int as count from user_trivia_progress where user_id = ${userId}`);
  }

  if (requirement.type === "easter_eggs_completed") {
    if (genre) {
      return safeCount(sql`
        select count(*)::int as count
        from user_easter_egg_progress uep
        left join media_items mi on mi.media_type = uep.media_type and mi.tmdb_id = uep.tmdb_id
        where uep.user_id = ${userId}
          and uep.status = 'completed'
          and lower(coalesce(mi.genres::text, '')) like ${`%${genre}%`}
      `);
    }
    return safeCount(sql`select count(*)::int as count from user_easter_egg_progress where user_id = ${userId} and status = 'completed'`);
  }

  return 0;
}

async function mapEvent(sql: any, row: any, userId?: string) {
  const requirements = normalizeRequirements(row.requirements);
  const mappedRequirements = [];
  for (const requirement of requirements) {
    const progress = await progressForRequirement(sql, userId, requirement);
    mappedRequirements.push({
      ...requirement,
      target: Number(requirement.target || 1),
      progress,
      completed: progress >= Number(requirement.target || 1),
    });
  }
  const completedRequirements = mappedRequirements.filter((requirement) => requirement.completed).length;
  const totalRequirements = mappedRequirements.length;
  const completionPercent = totalRequirements > 0 ? Math.round((completedRequirements / totalRequirements) * 100) : 0;
  const dateStatus = todayStatus(row.start_date, row.end_date);
  const storedUserStatus = row.user_challenge_status || null;
  const userStatus = completionPercent >= 100 ? "completed" : completionPercent > 0 ? "in_progress" : storedUserStatus || "not_started";
  const remainingDays = dateStatus === "active" ? daysRemaining(row.end_date) : 0;

  if (userId && userStatus !== "not_started") {
    await sql`
      insert into user_seasonal_challenges (
        user_id,
        event_id,
        status,
        completed_requirements,
        total_requirements,
        completion_percentage,
        points_awarded,
        completed_at,
        updated_at
      )
      values (
        ${userId},
        ${row.id},
        ${userStatus === "completed" ? "completed" : "in_progress"},
        ${completedRequirements},
        ${totalRequirements},
        ${completionPercent},
        case when ${userStatus === "completed"} then ${Number(row.points || 0)} else 0 end,
        case when ${userStatus === "completed"} then now() else null end,
        now()
      )
      on conflict (user_id, event_id) do update set
        status = excluded.status,
        completed_requirements = excluded.completed_requirements,
        total_requirements = excluded.total_requirements,
        completion_percentage = excluded.completion_percentage,
        points_awarded = case
          when user_seasonal_challenges.completed_at is not null then user_seasonal_challenges.points_awarded
          when excluded.status = 'completed' then excluded.points_awarded
          else user_seasonal_challenges.points_awarded
        end,
        completed_at = case
          when user_seasonal_challenges.completed_at is not null then user_seasonal_challenges.completed_at
          when excluded.status = 'completed' then now()
          else null
        end,
        updated_at = now()
    `;

    if (userStatus === "completed") {
      await sql`
        insert into notifications (recipient_user_id, type, entity_type, entity_id, title, message)
        values (
          ${userId},
          'seasonal_challenge_completed',
          'seasonal_challenge',
          ${row.id},
          'Seasonal badge unlocked',
          ${`You completed ${row.name} and earned ${row.badge}.`}
        )
        on conflict do nothing
      `;
    }

    if (userStatus === "in_progress" && dateStatus === "active" && remainingDays <= 7) {
      await sql`
        insert into notifications (recipient_user_id, type, entity_type, entity_id, title, message)
        values (
          ${userId},
          'seasonal_challenge_ending',
          'seasonal_challenge',
          ${row.id},
          'Seasonal challenge ending soon',
          ${`${row.name} ends in ${remainingDays === 1 ? "1 day" : `${remainingDays} days`}.`}
        )
        on conflict do nothing
      `;
    }
  }

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description || "",
    startDate: dateOnly(row.start_date),
    endDate: dateOnly(row.end_date),
    badge: row.badge,
    banner: row.banner || "",
    seasonKey: row.season_key || "general",
    isActive: row.is_active !== false,
    difficulty: row.difficulty || "medium",
    requirements: mappedRequirements,
    points: Number(row.points || 0),
    status: row.status,
    dateStatus,
    userStatus,
    completedRequirements,
    totalRequirements,
    completionPercent,
    daysRemaining: remainingDays,
    earnedAt: row.completed_at || undefined,
  };
}

export async function seasonalChallengeFeed(sql: any, userId?: string) {
  await ensureSeasonalChallengeTables(sql);
  const rows = await sql`
    select
      sce.*,
      usc.completed_at,
      usc.status as user_challenge_status
    from seasonal_challenge_events sce
    left join user_seasonal_challenges usc on usc.event_id = sce.id and usc.user_id = ${userId || null}::uuid
    where sce.status = 'published'
      and sce.is_active = true
      and (now() at time zone 'America/Toronto')::date between sce.start_date and sce.end_date
    order by sce.start_date asc, sce.points desc
  `;
  const events = [];
  for (const row of rows) events.push(await mapEvent(sql, row, userId));
  return {
    events,
    sections: {
      active: events.filter((event) => event.dateStatus === "active"),
      endingSoon: events.filter((event) => event.dateStatus === "active" && event.daysRemaining <= 14),
      upcoming: [],
      recentlyCompleted: events.filter((event) => event.userStatus === "completed").slice(0, 8),
      featured: events.find((event) => event.dateStatus === "active") || null,
    },
  };
}

export async function joinSeasonalChallenge(sql: any, userId: string, eventId: string) {
  await ensureSeasonalChallengeTables(sql);
  const [event] = await sql`
    select *
    from seasonal_challenge_events
    where id = ${eventId}
      and status = 'published'
      and is_active = true
      and (now() at time zone 'America/Toronto')::date between start_date and end_date
    limit 1
  `;
  if (!event) return null;

  await sql`
    insert into user_seasonal_challenges (
      user_id,
      event_id,
      status,
      completed_requirements,
      total_requirements,
      completion_percentage,
      points_awarded,
      updated_at
    )
    values (
      ${userId},
      ${eventId},
      'in_progress',
      0,
      ${normalizeRequirements(event.requirements).length},
      0,
      0,
      now()
    )
    on conflict (user_id, event_id) do update set
      status = case
        when user_seasonal_challenges.status = 'completed' then user_seasonal_challenges.status
        else 'in_progress'
      end,
      updated_at = now()
  `;

  await sql`
    insert into notifications (recipient_user_id, type, entity_type, entity_id, title, message)
    values (
      ${userId},
      'seasonal_challenge_started',
      'seasonal_challenge',
      ${eventId},
      'Seasonal challenge started',
      ${`You joined ${event.name}.`}
    )
    on conflict do nothing
  `;

  return mapEvent(sql, event, userId);
}

export async function seasonalChallengeSummaryForUser(sql: any, userId: string) {
  await ensureSeasonalChallengeTables(sql);
  const [summary] = await sql`
    select
      count(*) filter (where usc.completed_at is not null)::int as seasonal_badge_count,
      coalesce(sum(points_awarded) filter (where usc.completed_at is not null), 0)::int as seasonal_points
    from user_seasonal_challenges usc
    where usc.user_id = ${userId}
  `;
  const badges = await sql`
    select
      sce.id,
      sce.slug,
      sce.name,
      sce.description,
      sce.badge,
      sce.points,
      sce.difficulty,
      sce.banner,
      usc.completion_percentage,
      usc.completed_at
    from user_seasonal_challenges usc
    inner join seasonal_challenge_events sce on sce.id = usc.event_id
    where usc.user_id = ${userId}
      and usc.completed_at is not null
    order by usc.completed_at desc
    limit 6
  `;
  return {
    seasonalBadgeCount: Number(summary?.seasonal_badge_count || 0),
    seasonalPoints: Number(summary?.seasonal_points || 0),
    featuredBadges: badges.slice(0, 3).map((row: any) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      badge: row.badge,
      points: Number(row.points || 0),
      difficulty: row.difficulty,
      banner: row.banner || "",
      completionPercent: Number(row.completion_percentage || 100),
      earnedAt: row.completed_at,
    })),
    recentUnlocks: badges.map((row: any) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      badge: row.badge,
      points: Number(row.points || 0),
      difficulty: row.difficulty,
      banner: row.banner || "",
      completionPercent: Number(row.completion_percentage || 100),
      earnedAt: row.completed_at,
    })),
  };
}

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "seasonal-challenge";
}

export function cleanSeasonalChallengeInput(body: any) {
  const name = String(body.name || "").trim().slice(0, 120);
  const rawIsActive = body.isActive ?? body.is_active ?? true;
  return {
    slug: slugify(String(body.slug || name)),
    name,
    description: String(body.description || "").trim().slice(0, 600),
    startDate: String(body.startDate || body.start_date || "").slice(0, 10),
    endDate: String(body.endDate || body.end_date || "").slice(0, 10),
    seasonKey: String(body.seasonKey || body.season_key || "general").trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_").slice(0, 80) || "general",
    isActive: rawIsActive === true || rawIsActive === "true" || rawIsActive === "on" || rawIsActive === "1" || rawIsActive === 1,
    badge: String(body.badge || `${name} Badge`).trim().slice(0, 120),
    banner: String(body.banner || "").trim().slice(0, 120),
    difficulty: ["easy", "medium", "hard", "expert"].includes(body.difficulty) ? body.difficulty : "medium",
    requirements: normalizeRequirements(body.requirements).slice(0, 8),
    points: Math.max(0, Math.min(1000, Number(body.points || 0))),
    status: ["draft", "published", "archived"].includes(body.status) ? body.status : "draft",
  };
}
