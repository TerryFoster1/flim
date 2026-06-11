import { getAchievementSummary, readAchievementState } from "./_achievements.js";
import { challengeFeed, challengesForCollection, challengeSummaryForUser } from "./_challenges.js";
import { ensureTriviaTables } from "./_db.js";
import { seasonalChallengeFeed, seasonalChallengeSummaryForUser } from "./_seasonalChallenges.js";
import { ensureTvProgressTables } from "./_tvProgress.js";

async function safeRows(query: Promise<any[]>) {
  try {
    return await query;
  } catch (error) {
    const message = error instanceof Error ? error.message : String((error as any)?.message || "");
    if (message.includes("does not exist") || message.includes("relation") || message.includes("column")) return [];
    throw error;
  }
}

async function safeOne(query: Promise<any[]>) {
  const rows = await safeRows(query);
  return rows[0] || {};
}

function numberValue(value: unknown) {
  return Number(value || 0);
}

function formatDate(value: unknown) {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

function normalizeRoute(row: any) {
  if (row.collection_slug) return `/collection/${row.collection_slug}`;
  if (row.collectionSlug) return `/collection/${row.collectionSlug}`;
  if (row.tmdb_id && row.media_type) return row.media_type === "tv" ? `/tv/${row.tmdb_id}` : `/movies/${row.tmdb_id}`;
  return "/progress";
}

async function ensureProgressSources(sql: any) {
  await ensureTriviaTables(sql);
  await ensureTvProgressTables(sql);
}

async function collectionProgress(sql: any, userId: string) {
  const rows = await safeRows(sql`
    select
      mc.id,
      mc.slug,
      mc.title,
      mc.poster_url,
      mc.backdrop_url,
      ucp.total_count,
      ucp.watched_count,
      ucp.remaining_count,
      ucp.completion_percent,
      ucp.status,
      ucp.updated_at
    from user_collection_progress ucp
    inner join media_collections mc on mc.id = ucp.collection_id
    where ucp.user_id = ${userId}
    order by
      case when ucp.status = 'in_progress' then 0 when ucp.status = 'completed' then 1 else 2 end,
      ucp.updated_at desc
    limit 8
  `);

  return rows.map((row: any) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    posterUrl: row.poster_url || "",
    backdropUrl: row.backdrop_url || "",
    totalCount: numberValue(row.total_count),
    watchedCount: numberValue(row.watched_count),
    remainingCount: numberValue(row.remaining_count),
    completionPercent: numberValue(row.completion_percent),
    status: row.status || "not_started",
    updatedAt: formatDate(row.updated_at),
    path: `/collection/${row.slug}`,
  }));
}

async function syncCollectionProgress(sql: any, userId: string) {
  const rows = await safeRows(sql`
    select
      mc.id as collection_id,
      mc.slug as collection_slug,
      mci.media_type,
      mci.tmdb_id,
      mci.title,
      exists (
        select 1
        from playlist_movies pm
        inner join playlists p on p.id = pm.playlist_id
        where p.owner_user_id = ${userId}
          and coalesce(pm.media_type, 'movie') = mci.media_type
          and pm.tmdb_id = mci.tmdb_id
          and pm.watched = true
      ) as watched
    from media_collections mc
    inner join media_collection_items mci on mci.collection_id = mc.id
    order by mc.slug, coalesce(mci.sort_order, 2147483647), mci.title
  `);

  const byCollection = new Map<string, { id: string; slug: string; items: any[] }>();
  for (const row of rows) {
    const key = String(row.collection_id);
    const current = byCollection.get(key) || { id: key, slug: String(row.collection_slug), items: [] };
    current.items.push({
      mediaType: row.media_type || "movie",
      tmdbId: Number(row.tmdb_id),
      title: row.title,
      watchStatus: row.watched ? "watched" : "not_watched",
    });
    byCollection.set(key, current);
  }

  for (const collection of byCollection.values()) {
    const totalCount = collection.items.length;
    const watchedCount = collection.items.filter((item) => item.watchStatus === "watched").length;
    const remainingCount = Math.max(0, totalCount - watchedCount);
    const completionPercent = totalCount > 0 ? Math.round((watchedCount / totalCount) * 100) : 0;
    const status = watchedCount === 0 ? "not_started" : watchedCount >= totalCount ? "completed" : "in_progress";
    const progress = { totalCount, watchedCount, remainingCount, completionPercent, status };

    await safeRows(sql`
      insert into user_collection_progress (
        user_id,
        collection_id,
        watched_count,
        total_count,
        completion_percent,
        status,
        updated_at
      )
      values (
        ${userId},
        ${collection.id},
        ${watchedCount},
        ${totalCount},
        ${completionPercent},
        ${status},
        now()
      )
      on conflict (user_id, collection_id)
      do update set
        watched_count = excluded.watched_count,
        total_count = excluded.total_count,
        completion_percent = excluded.completion_percent,
        status = excluded.status,
        updated_at = now()
      returning id
    `);

    await challengesForCollection(sql, collection.slug, userId, progress, collection.items);
  }
}

async function progressSummary(sql: any, userId: string, achievementSummary: any, challengeSummary: any, seasonalSummary: any) {
  const [collections, trivia, tv, movies] = await Promise.all([
    safeOne(sql`
      select
        count(*) filter (where status = 'completed')::int as completed,
        count(*) filter (where status = 'in_progress')::int as in_progress,
        coalesce(avg(completion_percent), 0)::int as average_completion
      from user_collection_progress
      where user_id = ${userId}
    `),
    safeOne(sql`
      select
        (select count(*)::int from user_trivia_progress where user_id = ${userId}) as trivia_completed,
        (select count(*)::int from user_easter_egg_progress where user_id = ${userId} and status = 'completed') as easter_eggs_completed,
        (select count(*)::int from title_trivia where status in ('approved', 'auto_generated') and report_count < 3) as trivia_total,
        (select count(*)::int from title_easter_eggs where status in ('approved', 'auto_generated') and report_count < 3) as easter_eggs_total
    `),
    safeOne(sql`
      select count(*)::int as episodes_watched
      from user_episode_progress
      where user_id = ${userId}
        and status = 'watched'
    `),
    safeOne(sql`
      select count(distinct pm.media_type || ':' || pm.tmdb_id)::int as movies_watched
      from playlist_movies pm
      inner join playlists p on p.id = pm.playlist_id
      where p.owner_user_id = ${userId}
        and pm.watched = true
        and coalesce(pm.media_type, 'movie') = 'movie'
    `),
  ]);

  return {
    achievementPoints: numberValue(achievementSummary.totalPoints),
    badgeCount: numberValue(achievementSummary.achievementCount),
    collectionsCompleted: numberValue(collections.completed),
    collectionsInProgress: numberValue(collections.in_progress),
    collectionAverageCompletion: numberValue(collections.average_completion),
    challengesCompleted: numberValue(challengeSummary.challengeCount) + numberValue(seasonalSummary.seasonalBadgeCount),
    challengePoints: numberValue(challengeSummary.challengePoints) + numberValue(seasonalSummary.seasonalPoints),
    triviaCompleted: numberValue(trivia.trivia_completed),
    triviaTotal: numberValue(trivia.trivia_total),
    easterEggsFound: numberValue(trivia.easter_eggs_completed),
    easterEggsTotal: numberValue(trivia.easter_eggs_total),
    seasonalBadges: numberValue(seasonalSummary.seasonalBadgeCount),
    moviesWatched: numberValue(movies.movies_watched),
    tvEpisodesWatched: numberValue(tv.episodes_watched),
  };
}

function pickNextStep(input: {
  collections: any[];
  challenges: any[];
  achievements: any[];
  summary: any;
}) {
  const collection = input.collections.find((item) => item.status === "in_progress");
  if (collection) {
    return {
      type: "collection",
      title: `Finish ${collection.title}`,
      description: `${collection.remainingCount} title${collection.remainingCount === 1 ? "" : "s"} remaining.`,
      cta: "Open Collection",
      path: collection.path,
      completionPercent: collection.completionPercent,
    };
  }

  const challenge = input.challenges.find((item) => item.status === "in_progress");
  if (challenge) {
    return {
      type: "challenge",
      title: `Complete ${challenge.name}`,
      description: `${challenge.completedRequirements} / ${challenge.totalRequirements} requirements done.`,
      cta: "View Challenges",
      path: challenge.collectionSlug ? `/collection/${challenge.collectionSlug}` : "/challenges",
      completionPercent: challenge.completionPercent,
    };
  }

  const achievement = input.achievements
    .filter((item) => !item.unlockedAt && numberValue(item.completionPercentage) > 0)
    .sort((a, b) => numberValue(b.completionPercentage) - numberValue(a.completionPercentage))[0];
  if (achievement) {
    const remaining = Math.max(0, numberValue(achievement.goalCount) - numberValue(achievement.progressCount));
    return {
      type: "achievement",
      title: `Unlock ${achievement.name}`,
      description: remaining > 0 ? `${remaining} more to go.` : "Almost unlocked.",
      cta: "Find Something To Watch",
      path: "/playlists",
      completionPercent: numberValue(achievement.completionPercentage),
    };
  }

  if (input.summary.triviaTotal > input.summary.triviaCompleted) {
    return {
      type: "trivia",
      title: "Complete a Trivia question",
      description: "Open a title and keep building your movie knowledge.",
      cta: "Browse Playlists",
      path: "/playlists",
      completionPercent: input.summary.triviaTotal ? Math.round((input.summary.triviaCompleted / input.summary.triviaTotal) * 100) : 0,
    };
  }

  return {
    type: "discover",
    title: "Start your next movie goal",
    description: "Pick a collection, challenge, or playlist and keep your Flim progress moving.",
    cta: "Discover",
    path: "/discover",
    completionPercent: 0,
  };
}

async function activityTimeline(sql: any, userId: string) {
  const rows = await safeRows(sql`
    select * from (
      select
        'achievement_unlocked' as type,
        a.name as title,
        'Achievement unlocked' as label,
        ua.earned_at as occurred_at,
        null::text as path
      from user_achievements ua
      inner join achievements a on a.id = ua.achievement_id
      where ua.user_id = ${userId}
        and ua.earned_at is not null

      union all

      select
        'collection_completed' as type,
        mc.title,
        'Collection completed' as label,
        ucp.updated_at as occurred_at,
        concat('/collection/', mc.slug) as path
      from user_collection_progress ucp
      inner join media_collections mc on mc.id = ucp.collection_id
      where ucp.user_id = ${userId}
        and ucp.status = 'completed'

      union all

      select
        'challenge_completed' as type,
        cc.name as title,
        'Challenge completed' as label,
        ucc.completed_at as occurred_at,
        concat('/collection/', cc.collection_slug) as path
      from user_collection_challenges ucc
      inner join collection_challenges cc on cc.id = ucc.challenge_id
      where ucc.user_id = ${userId}
        and ucc.completed_at is not null

      union all

      select
        'seasonal_challenge_completed' as type,
        sce.name as title,
        'Seasonal badge unlocked' as label,
        usc.completed_at as occurred_at,
        '/challenges' as path
      from user_seasonal_challenges usc
      inner join seasonal_challenge_events sce on sce.id = usc.event_id
      where usc.user_id = ${userId}
        and usc.completed_at is not null

      union all

      select
        'trivia_completed' as type,
        coalesce(mi.title, concat(initcap(utp.media_type), ' trivia')) as title,
        'Trivia completed' as label,
        utp.completed_at as occurred_at,
        case when utp.media_type = 'tv' then concat('/tv/', utp.tmdb_id::text) else concat('/movies/', utp.tmdb_id::text) end as path
      from user_trivia_progress utp
      left join media_items mi on mi.media_type = utp.media_type and mi.tmdb_id = utp.tmdb_id
      where utp.user_id = ${userId}

      union all

      select
        'easter_egg_found' as type,
        coalesce(mi.title, tee.title) as title,
        'Easter Egg found' as label,
        uep.completed_at as occurred_at,
        case when uep.media_type = 'tv' then concat('/tv/', uep.tmdb_id::text) else concat('/movies/', uep.tmdb_id::text) end as path
      from user_easter_egg_progress uep
      left join title_easter_eggs tee on tee.id = uep.easter_egg_id
      left join media_items mi on mi.media_type = uep.media_type and mi.tmdb_id = uep.tmdb_id
      where uep.user_id = ${userId}
        and uep.status = 'completed'
    ) activity
    where occurred_at is not null
    order by occurred_at desc
    limit 18
  `);

  return rows.map((row: any) => ({
    type: row.type,
    title: row.title || "Progress updated",
    label: row.label,
    occurredAt: formatDate(row.occurred_at),
    path: row.path || normalizeRoute(row),
  }));
}

export async function progressHubFeed(sql: any, userId: string) {
  await ensureProgressSources(sql);
  await syncCollectionProgress(sql, userId);

  const [achievementSummary, achievementState, challengeData, challengeSummary, seasonalData, seasonalSummary, collections] = await Promise.all([
    getAchievementSummary(sql, userId),
    readAchievementState(sql, userId),
    challengeFeed(sql, userId),
    challengeSummaryForUser(sql, userId),
    seasonalChallengeFeed(sql, userId),
    seasonalChallengeSummaryForUser(sql, userId),
    collectionProgress(sql, userId),
  ]);

  const summary = await progressSummary(sql, userId, achievementSummary, challengeSummary, seasonalSummary);
  const challenges = challengeData.challenges || [];
  const seasonalChallenges = seasonalData.events || [];
  const achievements = achievementState.achievements || [];
  const nextStep = pickNextStep({ collections, challenges, achievements, summary });
  const timeline = await activityTimeline(sql, userId);

  return {
    summary,
    nextStep,
    collections,
    challenges: {
      inProgress: challenges.filter((challenge: any) => challenge.status === "in_progress").slice(0, 6),
      completed: challenges.filter((challenge: any) => challenge.status === "completed").slice(0, 6),
      all: challenges.slice(0, 12),
    },
    seasonalChallenges: {
      active: seasonalChallenges.filter((event: any) => event.dateStatus === "active").slice(0, 4),
      inProgress: seasonalChallenges.filter((event: any) => event.userStatus === "in_progress").slice(0, 4),
      completed: seasonalChallenges.filter((event: any) => event.userStatus === "completed").slice(0, 4),
    },
    achievements: {
      featuredBadges: achievementSummary.featuredBadges || [],
      recentUnlocks: achievementSummary.recentUnlocks || [],
      nextUnlocks: achievements
        .filter((achievement: any) => !achievement.unlockedAt)
        .sort((a: any, b: any) => numberValue(b.completionPercentage) - numberValue(a.completionPercentage))
        .slice(0, 6),
    },
    timeline,
    generatedAt: new Date().toISOString(),
  };
}
