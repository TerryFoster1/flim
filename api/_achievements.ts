import { ensureTriviaTables } from "./_db.js";

type MediaType = "movie" | "tv";

interface AchievementRequirement {
  metric?: string;
  threshold?: number;
  mediaType?: MediaType;
  tmdbId?: number;
  genre?: string;
  keyword?: string;
}

function parseRequirement(value: unknown): AchievementRequirement {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }
  return value as AchievementRequirement;
}

function mapAchievement(row: any) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    badgeIcon: row.badge_icon,
    category: row.category,
    rarity: row.rarity || "common",
    tier: row.tier || undefined,
    points: Number(row.points || 0),
    goalCount: Number(row.goal_count || 0),
    progressCount: Number(row.progress_count || row.progress || 0),
    completionPercentage: Number(row.completion_percentage || 0),
    unlockedAt: row.earned_at || row.unlocked_at || undefined,
  };
}

async function safeCount(sql: any, query: Promise<any>, field = "count") {
  try {
    const rows = await query;
    return Number(rows[0]?.[field] || 0);
  } catch {
    return 0;
  }
}

async function companionTitleComplete(sql: any, userId: string, mediaType: MediaType, tmdbId: number) {
  const [row] = await sql`
    select
      (select count(*)::int from title_trivia where media_type = ${mediaType} and tmdb_id = ${tmdbId} and status in ('approved', 'auto_generated') and report_count < 3) as trivia_total,
      (select count(*)::int from user_trivia_progress utp inner join title_trivia tt on tt.id = utp.trivia_id where utp.user_id = ${userId} and tt.media_type = ${mediaType} and tt.tmdb_id = ${tmdbId}) as trivia_done,
      (select count(*)::int from title_easter_eggs where media_type = ${mediaType} and tmdb_id = ${tmdbId} and status in ('approved', 'auto_generated') and report_count < 3) as hunt_total,
      (select count(*)::int from user_easter_egg_progress uep inner join title_easter_eggs tee on tee.id = uep.easter_egg_id where uep.user_id = ${userId} and uep.status = 'completed' and tee.media_type = ${mediaType} and tee.tmdb_id = ${tmdbId}) as hunt_done
  `;
  const total = Number(row?.trivia_total || 0) + Number(row?.hunt_total || 0);
  const done = Number(row?.trivia_done || 0) + Number(row?.hunt_done || 0);
  return total > 0 && done >= total ? 1 : 0;
}

async function metricProgress(sql: any, userId: string, requirement: AchievementRequirement) {
  const metric = requirement.metric || "";
  if (metric === "movies_watched") {
    return safeCount(sql, sql`
      select count(distinct pm.tmdb_id)::int as count
      from playlist_movies pm
      inner join playlists p on p.id = pm.playlist_id
      where p.owner_user_id = ${userId}
        and pm.media_type = 'movie'
        and pm.watched = true
    `);
  }
  if (metric === "episodes_watched") {
    return safeCount(sql, sql`
      select count(*)::int as count
      from user_episode_progress
      where user_id = ${userId}
        and status = 'watched'
    `);
  }
  if (metric === "seasons_completed") {
    return safeCount(sql, sql`
      select count(*)::int as count
      from user_season_progress
      where user_id = ${userId}
        and status = 'completed'
    `);
  }
  if (metric === "playlists_created") {
    return safeCount(sql, sql`select count(*)::int as count from playlists where owner_user_id = ${userId}`);
  }
  if (metric === "public_playlists_created") {
    return safeCount(sql, sql`select count(*)::int as count from playlists where owner_user_id = ${userId} and visibility = 'public'`);
  }
  if (metric === "playlists_followed") {
    return safeCount(sql, sql`select count(*)::int as count from playlist_follows where follower_user_id = ${userId}`);
  }
  if (metric === "trivia_completed") {
    return safeCount(sql, sql`select count(*)::int as count from user_trivia_progress where user_id = ${userId}`);
  }
  if (metric === "easter_eggs_completed") {
    return safeCount(sql, sql`select count(*)::int as count from user_easter_egg_progress where user_id = ${userId} and status = 'completed'`);
  }
  if (metric === "title_companion_complete" && requirement.mediaType && requirement.tmdbId) {
    return companionTitleComplete(sql, userId, requirement.mediaType, Number(requirement.tmdbId));
  }
  if (metric === "playlist_keyword_watched" && requirement.keyword) {
    return safeCount(sql, sql`
      select count(distinct pm.tmdb_id)::int as count
      from playlist_movies pm
      inner join playlists p on p.id = pm.playlist_id
      where p.owner_user_id = ${userId}
        and pm.watched = true
        and lower(p.name) like ${`%${String(requirement.keyword).toLowerCase()}%`}
    `);
  }
  return 0;
}

export async function ensureAchievementFramework(sql: any) {
  await ensureTriviaTables(sql);
}

export async function readAchievementState(sql: any, userId?: string) {
  await ensureAchievementFramework(sql);
  if (!userId) return { achievements: [], unlocked: [] };
  const rows = await sql`
    select
      a.id,
      a.name,
      a.description,
      a.badge_icon,
      a.category,
      a.rarity,
      a.tier,
      a.points,
      a.goal_count,
      coalesce(ua.progress_count, 0) as progress_count,
      coalesce(ua.progress, 0) as progress,
      coalesce(ua.completion_percentage, 0) as completion_percentage,
      ua.earned_at,
      ua.unlocked_at
    from achievements a
    left join user_achievements ua on ua.achievement_id = a.id and ua.user_id = ${userId}
    order by a.category, a.points, a.name
  `;
  return { achievements: rows.map(mapAchievement), unlocked: [] };
}

export async function evaluateAchievements(sql: any, userId: string) {
  await ensureAchievementFramework(sql);
  const definitions = await sql`
    select id, name, description, badge_icon, category, rarity, tier, points, goal_count, unlock_requirements
    from achievements
    order by category, points, name
  `;
  const newlyUnlocked: any[] = [];

  for (const definition of definitions) {
    const requirement = parseRequirement(definition.unlock_requirements);
    const goal = Number(requirement.threshold || definition.goal_count || 1);
    const progress = await metricProgress(sql, userId, requirement);
    const completion = goal > 0 ? Math.min(100, Math.round((progress / goal) * 100)) : 0;
    const priorRows = await sql`
      select earned_at, unlocked_at
      from user_achievements
      where user_id = ${userId}
        and achievement_id = ${definition.id}
      limit 1
    `;
    const alreadyEarned = Boolean(priorRows[0]?.earned_at || priorRows[0]?.unlocked_at);
    const shouldUnlock = progress >= goal;

    const rows = await sql`
      insert into user_achievements (
        user_id,
        achievement_id,
        progress_count,
        progress,
        completion_percentage,
        goal_count,
        earned_at,
        unlocked_at,
        updated_at
      )
      values (
        ${userId},
        ${definition.id},
        ${Math.floor(progress)},
        ${progress},
        ${completion},
        ${goal},
        case when ${shouldUnlock} then now() else null end,
        case when ${shouldUnlock} then now() else null end,
        now()
      )
      on conflict (user_id, achievement_id) do update set
        progress_count = excluded.progress_count,
        progress = excluded.progress,
        completion_percentage = excluded.completion_percentage,
        goal_count = excluded.goal_count,
        earned_at = case
          when user_achievements.earned_at is null and excluded.progress >= excluded.goal_count then now()
          else user_achievements.earned_at
        end,
        unlocked_at = case
          when user_achievements.unlocked_at is null and excluded.progress >= excluded.goal_count then now()
          else user_achievements.unlocked_at
        end,
        updated_at = now()
      returning earned_at, unlocked_at, progress_count, completion_percentage
    `;

    if (shouldUnlock && !alreadyEarned) {
      newlyUnlocked.push(mapAchievement({
        ...definition,
        progress_count: rows[0]?.progress_count || progress,
        completion_percentage: rows[0]?.completion_percentage || completion,
        earned_at: rows[0]?.earned_at || rows[0]?.unlocked_at,
      }));
    }
  }

  return newlyUnlocked;
}

export async function getAchievementSummary(sql: any, userId: string) {
  await ensureAchievementFramework(sql);
  await evaluateAchievements(sql, userId);

  const [summary] = await sql`
    select
      count(*) filter (where ua.earned_at is not null)::int as achievement_count,
      coalesce(sum(a.points) filter (where ua.earned_at is not null), 0)::int as total_points
    from user_achievements ua
    inner join achievements a on a.id = ua.achievement_id
    where ua.user_id = ${userId}
  `;
  const earnedRows = await sql`
    select
      a.id,
      a.name,
      a.description,
      a.badge_icon,
      a.category,
      a.rarity,
      a.tier,
      a.points,
      a.goal_count,
      ua.progress_count,
      ua.completion_percentage,
      ua.earned_at,
      ua.unlocked_at
    from user_achievements ua
    inner join achievements a on a.id = ua.achievement_id
    where ua.user_id = ${userId}
      and ua.earned_at is not null
    order by ua.earned_at desc
    limit 8
  `;
  const earned = earnedRows.map(mapAchievement);
  return {
    achievementCount: Number(summary?.achievement_count || 0),
    totalPoints: Number(summary?.total_points || 0),
    featuredBadges: earned.slice(0, 3),
    recentUnlocks: earned.slice(0, 5),
  };
}
