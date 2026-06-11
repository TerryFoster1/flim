import { ensureAchievementFramework } from "./_achievements.js";
import { ensureCollectionChallengeTables } from "./_challenges.js";
import { ensurePlaylistFollowsTable, ensurePlaylistLikesTable, ensureUserFollowsTable, ensureUserProfilesTable } from "./_db.js";
import { ensureSeasonalChallengeTables } from "./_seasonalChallenges.js";

export type HallOfFameWindow = "all_time" | "year" | "month" | "week";

interface LeaderboardDefinition {
  id: string;
  title: string;
  description: string;
  unit: string;
  group: "prestige" | "watching" | "curators";
}

const leaderboardDefinitions: LeaderboardDefinition[] = [
  { id: "achievement_points", title: "Achievement Points", description: "Total points from earned badges.", unit: "points", group: "prestige" },
  { id: "collections_completed", title: "Collections Completed", description: "Completed movie and TV collections.", unit: "collections", group: "prestige" },
  { id: "challenges_completed", title: "Challenges Completed", description: "Collection and seasonal challenges finished.", unit: "challenges", group: "prestige" },
  { id: "trivia_correct", title: "Trivia Correct", description: "Trivia questions completed.", unit: "correct", group: "prestige" },
  { id: "easter_eggs_found", title: "Easter Eggs Found", description: "Completed Easter Egg Hunts.", unit: "hunts", group: "prestige" },
  { id: "movies_watched", title: "Movies Watched", description: "Movies marked watched in playlists.", unit: "movies", group: "watching" },
  { id: "tv_episodes_watched", title: "TV Episodes Watched", description: "TV episodes marked watched.", unit: "episodes", group: "watching" },
  { id: "playlist_followers", title: "Playlist Followers", description: "Followers earned across public playlists.", unit: "followers", group: "curators" },
  { id: "playlist_likes", title: "Playlist Likes", description: "Likes earned across public playlists.", unit: "likes", group: "curators" },
  { id: "curator_score", title: "Curator Score", description: "Playlist followers, likes, and public playlist creation combined.", unit: "score", group: "curators" },
];

function windowStartFor(window: HallOfFameWindow) {
  const now = new Date();
  if (window === "all_time") return null;
  if (window === "year") return new Date(now.getFullYear(), 0, 1).toISOString();
  if (window === "month") return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const day = now.getDay();
  const diff = day === 0 ? 6 : day - 1;
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff).toISOString();
}

export function normalizeHallOfFameWindow(input: unknown): HallOfFameWindow {
  if (input === "year" || input === "month" || input === "week" || input === "all_time") return input;
  return "all_time";
}

async function safeRows(query: Promise<any[]>) {
  try {
    return await query;
  } catch (error) {
    const message = error instanceof Error ? error.message : String((error as any)?.message || "");
    if (message.includes("does not exist") || message.includes("relation") || message.includes("column")) return [];
    throw error;
  }
}

async function ensureHallOfFameSources(sql: any) {
  await ensureUserProfilesTable(sql);
  await ensureUserFollowsTable(sql);
  await ensurePlaylistFollowsTable(sql);
  await ensurePlaylistLikesTable(sql);
  await ensureAchievementFramework(sql);
  await ensureCollectionChallengeTables(sql);
  await ensureSeasonalChallengeTables(sql);
}

async function hydrateEntries(sql: any, rows: any[]) {
  const ranked = rows
    .map((row) => ({
      userId: String(row.user_id || ""),
      score: Number(row.score || 0),
      secondaryScore: Number(row.secondary_score || 0),
    }))
    .filter((row) => row.userId && row.score > 0)
    .sort((a, b) => b.score - a.score || b.secondaryScore - a.secondaryScore)
    .slice(0, 25);

  if (ranked.length === 0) return [];

  const ids = ranked.map((row) => row.userId);
  const profileRows = await safeRows(sql`
    select
      u.id::text as user_id,
      coalesce(nullif(up.display_name, ''), up.handle, split_part(u.email, '@', 1), 'Flim user') as display_name,
      coalesce(up.handle, '') as handle,
      coalesce(up.profile_image_url, '') as profile_image_url,
      coalesce(achievement_totals.achievement_points, 0)::int as achievement_points,
      coalesce(achievement_totals.badge_count, 0)::int as badge_count,
      top_badge.id as top_badge_id,
      top_badge.name as top_badge_name,
      top_badge.description as top_badge_description,
      top_badge.rarity as top_badge_rarity,
      top_badge.points as top_badge_points
    from users u
    left join user_profiles up on up.user_id = u.id::text
    left join lateral (
      select coalesce(sum(a.points), 0)::int as achievement_points, count(*)::int as badge_count
      from user_achievements ua
      inner join achievements a on a.id = ua.achievement_id
      where ua.user_id = u.id
        and ua.earned_at is not null
    ) achievement_totals on true
    left join lateral (
      select a.id, a.name, a.description, a.rarity, a.points
      from user_achievements ua
      inner join achievements a on a.id = ua.achievement_id
      where ua.user_id = u.id
        and ua.earned_at is not null
      order by a.points desc, ua.earned_at desc
      limit 1
    ) top_badge on true
    where u.id = any(${ids}::uuid[])
  `);
  const profiles = new Map(profileRows.map((row: any) => [String(row.user_id), row]));

  return ranked.map((entry, index) => {
    const profile = profiles.get(entry.userId) || {};
    return {
      userId: entry.userId,
      rank: index + 1,
      score: entry.score,
      secondaryScore: entry.secondaryScore,
      displayName: profile.display_name || "Flim user",
      handle: profile.handle || "",
      profileImageUrl: profile.profile_image_url || "",
      achievementPoints: Number(profile.achievement_points || 0),
      badgeCount: Number(profile.badge_count || 0),
      topBadge: profile.top_badge_name
        ? {
          id: profile.top_badge_id,
          name: profile.top_badge_name,
          description: profile.top_badge_description || "",
          rarity: profile.top_badge_rarity || "common",
          points: Number(profile.top_badge_points || 0),
        }
        : undefined,
    };
  });
}

async function achievementPoints(sql: any, windowStart: string | null) {
  const rows = await safeRows(sql`
    select ua.user_id, coalesce(sum(a.points), 0)::int as score, count(*)::int as secondary_score
    from user_achievements ua
    inner join achievements a on a.id = ua.achievement_id
    where ua.earned_at is not null
      and (${windowStart}::timestamptz is null or ua.earned_at >= ${windowStart}::timestamptz)
    group by ua.user_id
  `);
  return hydrateEntries(sql, rows);
}

async function collectionsCompleted(sql: any, windowStart: string | null) {
  const rows = await safeRows(sql`
    select user_id, count(*)::int as score, coalesce(sum(completion_percent), 0)::int as secondary_score
    from user_collection_progress
    where status = 'completed'
      and (${windowStart}::timestamptz is null or updated_at >= ${windowStart}::timestamptz)
    group by user_id
  `);
  return hydrateEntries(sql, rows);
}

async function challengesCompleted(sql: any, windowStart: string | null) {
  const rows = await safeRows(sql`
    select user_id, count(*)::int as score, coalesce(sum(points_awarded), 0)::int as secondary_score
    from (
      select user_id, points_awarded, completed_at from user_collection_challenges where status = 'completed'
      union all
      select user_id, points_awarded, completed_at from user_seasonal_challenges where status = 'completed'
    ) completed
    where completed_at is not null
      and (${windowStart}::timestamptz is null or completed_at >= ${windowStart}::timestamptz)
    group by user_id
  `);
  return hydrateEntries(sql, rows);
}

async function triviaCorrect(sql: any, windowStart: string | null) {
  const rows = await safeRows(sql`
    select user_id, count(*)::int as score, count(distinct tmdb_id)::int as secondary_score
    from user_trivia_progress
    where (${windowStart}::timestamptz is null or completed_at >= ${windowStart}::timestamptz)
    group by user_id
  `);
  return hydrateEntries(sql, rows);
}

async function easterEggsFound(sql: any, windowStart: string | null) {
  const rows = await safeRows(sql`
    select user_id, count(*)::int as score, count(distinct tmdb_id)::int as secondary_score
    from user_easter_egg_progress
    where status = 'completed'
      and (${windowStart}::timestamptz is null or completed_at >= ${windowStart}::timestamptz)
    group by user_id
  `);
  return hydrateEntries(sql, rows);
}

async function moviesWatched(sql: any, windowStart: string | null) {
  const rows = await safeRows(sql`
    select p.owner_user_id as user_id, count(distinct pm.media_type || ':' || pm.tmdb_id)::int as score, count(distinct p.id)::int as secondary_score
    from playlist_movies pm
    inner join playlists p on p.id = pm.playlist_id
    where pm.watched = true
      and coalesce(pm.media_type, 'movie') = 'movie'
      and p.owner_user_id is not null
      and (${windowStart}::timestamptz is null or pm.added_at >= ${windowStart}::timestamptz)
    group by p.owner_user_id
  `);
  return hydrateEntries(sql, rows);
}

async function tvEpisodesWatched(sql: any, windowStart: string | null) {
  const rows = await safeRows(sql`
    select user_id, count(*)::int as score, count(distinct tmdb_show_id)::int as secondary_score
    from user_episode_progress
    where status = 'watched'
      and (${windowStart}::timestamptz is null or coalesce(last_watched_at, updated_at) >= ${windowStart}::timestamptz)
    group by user_id
  `);
  return hydrateEntries(sql, rows);
}

async function playlistFollowers(sql: any, windowStart: string | null) {
  const rows = await safeRows(sql`
    select p.owner_user_id as user_id, count(pf.id)::int as score, count(distinct p.id)::int as secondary_score
    from playlist_follows pf
    inner join playlists p on p.id = pf.playlist_id
    where p.visibility = 'public'
      and p.owner_user_id is not null
      and (${windowStart}::timestamptz is null or pf.created_at >= ${windowStart}::timestamptz)
    group by p.owner_user_id
  `);
  return hydrateEntries(sql, rows);
}

async function playlistLikes(sql: any, windowStart: string | null) {
  const rows = await safeRows(sql`
    select p.owner_user_id as user_id, count(pl.id)::int as score, count(distinct p.id)::int as secondary_score
    from playlist_likes pl
    inner join playlists p on p.id = pl.playlist_id
    where p.visibility = 'public'
      and p.owner_user_id is not null
      and (${windowStart}::timestamptz is null or pl.created_at >= ${windowStart}::timestamptz)
    group by p.owner_user_id
  `);
  return hydrateEntries(sql, rows);
}

async function curatorScore(sql: any, windowStart: string | null) {
  const rows = await safeRows(sql`
    with public_playlists as (
      select owner_user_id as user_id, count(*)::int as public_playlist_count
      from playlists
      where visibility = 'public'
        and owner_user_id is not null
        and (${windowStart}::timestamptz is null or created_at >= ${windowStart}::timestamptz)
      group by owner_user_id
    ),
    followers as (
      select p.owner_user_id as user_id, count(pf.id)::int as follower_count
      from playlist_follows pf
      inner join playlists p on p.id = pf.playlist_id
      where p.visibility = 'public'
        and p.owner_user_id is not null
        and (${windowStart}::timestamptz is null or pf.created_at >= ${windowStart}::timestamptz)
      group by p.owner_user_id
    ),
    likes as (
      select p.owner_user_id as user_id, count(pl.id)::int as like_count
      from playlist_likes pl
      inner join playlists p on p.id = pl.playlist_id
      where p.visibility = 'public'
        and p.owner_user_id is not null
        and (${windowStart}::timestamptz is null or pl.created_at >= ${windowStart}::timestamptz)
      group by p.owner_user_id
    )
    select
      coalesce(pp.user_id, f.user_id, l.user_id) as user_id,
      (coalesce(f.follower_count, 0) * 5 + coalesce(l.like_count, 0) * 3 + coalesce(pp.public_playlist_count, 0) * 10)::int as score,
      coalesce(pp.public_playlist_count, 0)::int as secondary_score
    from public_playlists pp
    full join followers f on f.user_id = pp.user_id
    full join likes l on l.user_id = coalesce(pp.user_id, f.user_id)
  `);
  return hydrateEntries(sql, rows);
}

export async function hallOfFameFeed(sql: any, window: HallOfFameWindow) {
  await ensureHallOfFameSources(sql);
  const windowStart = windowStartFor(window);
  const runners: Record<string, () => Promise<any[]>> = {
    achievement_points: () => achievementPoints(sql, windowStart),
    collections_completed: () => collectionsCompleted(sql, windowStart),
    challenges_completed: () => challengesCompleted(sql, windowStart),
    trivia_correct: () => triviaCorrect(sql, windowStart),
    easter_eggs_found: () => easterEggsFound(sql, windowStart),
    movies_watched: () => moviesWatched(sql, windowStart),
    tv_episodes_watched: () => tvEpisodesWatched(sql, windowStart),
    playlist_followers: () => playlistFollowers(sql, windowStart),
    playlist_likes: () => playlistLikes(sql, windowStart),
    curator_score: () => curatorScore(sql, windowStart),
  };

  const leaderboards: Record<string, unknown> = {};
  for (const definition of leaderboardDefinitions) {
    leaderboards[definition.id] = {
      ...definition,
      entries: await runners[definition.id](),
    };
  }

  return {
    window,
    windowStart,
    generatedAt: new Date().toISOString(),
    categories: leaderboardDefinitions,
    leaderboards,
  };
}

export async function hallOfFameSummaryForUser(sql: any, userId: string) {
  const feed = await hallOfFameFeed(sql, "all_time");
  const appearances: Array<{ categoryId: string; title: string; rank: number; score: number; unit: string }> = [];

  for (const definition of leaderboardDefinitions) {
    const leaderboard = feed.leaderboards[definition.id] as { entries?: Array<{ userId: string; rank: number; score: number }> };
    const entry = leaderboard.entries?.find((candidate) => candidate.userId === userId);
    if (entry) {
      appearances.push({
        categoryId: definition.id,
        title: definition.title,
        rank: entry.rank,
        score: entry.score,
        unit: definition.unit,
      });
    }
  }

  appearances.sort((a, b) => a.rank - b.rank || b.score - a.score);

  return {
    appearanceCount: appearances.length,
    bestRank: appearances[0]?.rank || null,
    bestCategory: appearances[0]?.title || "",
    positions: appearances.slice(0, 3),
  };
}
