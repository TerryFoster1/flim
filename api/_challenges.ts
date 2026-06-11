import { ensureTriviaTables } from "./_db.js";

type ChallengeStatus = "not_started" | "in_progress" | "completed";
type RequirementType = "collection_completed" | "titles_watched" | "trivia_completed" | "easter_eggs_completed" | "achievement_unlocked";

export interface CollectionChallengeRequirement {
  type: RequirementType;
  label: string;
  target: number;
  achievementId?: string;
}

export interface CollectionChallengeSeed {
  id: string;
  collectionSlug: string;
  name: string;
  description: string;
  badge: string;
  points: number;
  difficulty: "easy" | "medium" | "hard" | "expert";
  category: string;
  requirements: CollectionChallengeRequirement[];
}

interface CollectionProgressInput {
  totalCount: number;
  watchedCount: number;
  status: ChallengeStatus;
  triviaCompleted: number;
  easterEggsCompleted: number;
  unlockedAchievementIds?: Set<string>;
}

const challengeSeeds: CollectionChallengeSeed[] = [
  {
    id: "back_to_the_future_time_traveler",
    collectionSlug: "back-to-the-future",
    name: "Time Traveler",
    description: "Finish the Back to the Future collection and prove you caught the key companion moments.",
    badge: "clock",
    points: 75,
    difficulty: "medium",
    category: "collections",
    requirements: [
      { type: "collection_completed", label: "Watch all 3 movies", target: 1 },
      { type: "trivia_completed", label: "Complete 3 trivia questions", target: 3 },
      { type: "easter_eggs_completed", label: "Complete 2 Easter Egg Hunts", target: 2 },
    ],
  },
  {
    id: "jurassic_park_expert",
    collectionSlug: "jurassic-park",
    name: "Jurassic Park Expert",
    description: "Complete the Jurassic Park collection and companion discoveries.",
    badge: "dinosaur",
    points: 75,
    difficulty: "medium",
    category: "collections",
    requirements: [
      { type: "collection_completed", label: "Watch the full collection", target: 1 },
      { type: "trivia_completed", label: "Complete 3 trivia questions", target: 3 },
      { type: "easter_eggs_completed", label: "Complete 1 Easter Egg Hunt", target: 1 },
    ],
  },
  {
    id: "mission_impossible_agent",
    collectionSlug: "mission-impossible",
    name: "Mission Impossible Agent",
    description: "Accept the mission and finish the full Mission: Impossible collection.",
    badge: "agent",
    points: 60,
    difficulty: "hard",
    category: "collections",
    requirements: [
      { type: "collection_completed", label: "Watch every mission", target: 1 },
    ],
  },
  {
    id: "wizarding_world_completionist",
    collectionSlug: "harry-potter",
    name: "Wizarding World Completionist",
    description: "Complete the Harry Potter collection.",
    badge: "spark",
    points: 60,
    difficulty: "hard",
    category: "collections",
    requirements: [
      { type: "collection_completed", label: "Watch the full collection", target: 1 },
    ],
  },
  {
    id: "pixar_completionist",
    collectionSlug: "toy-story",
    name: "Pixar Completionist",
    description: "Finish the Toy Story collection.",
    badge: "star",
    points: 45,
    difficulty: "easy",
    category: "collections",
    requirements: [
      { type: "collection_completed", label: "Watch the full collection", target: 1 },
    ],
  },
  {
    id: "marvel_phase_one_starter",
    collectionSlug: "avengers",
    name: "Marvel Phase Starter",
    description: "Complete the Avengers collection available in Flim.",
    badge: "shield",
    points: 60,
    difficulty: "medium",
    category: "collections",
    requirements: [
      { type: "collection_completed", label: "Watch the full collection", target: 1 },
    ],
  },
];

function safeJson(value: unknown) {
  return JSON.stringify(value || {});
}

function requirementProgress(requirement: CollectionChallengeRequirement, input: CollectionProgressInput) {
  if (requirement.type === "collection_completed") return input.status === "completed" ? 1 : 0;
  if (requirement.type === "titles_watched") return input.watchedCount;
  if (requirement.type === "trivia_completed") return input.triviaCompleted;
  if (requirement.type === "easter_eggs_completed") return input.easterEggsCompleted;
  if (requirement.type === "achievement_unlocked" && requirement.achievementId) {
    return input.unlockedAchievementIds?.has(requirement.achievementId) ? 1 : 0;
  }
  return 0;
}

function mapChallengeRow(row: any, input?: CollectionProgressInput) {
  const requirements = Array.isArray(row.requirements) ? row.requirements : [];
  const mappedRequirements = requirements.map((requirement: CollectionChallengeRequirement) => {
    const progress = input ? requirementProgress(requirement, input) : 0;
    return {
      type: requirement.type,
      label: requirement.label,
      target: Number(requirement.target || 1),
      progress,
      completed: progress >= Number(requirement.target || 1),
    };
  });
  const completedRequirements = mappedRequirements.filter((requirement: any) => requirement.completed).length;
  const completionPercent = mappedRequirements.length > 0
    ? Math.round((completedRequirements / mappedRequirements.length) * 100)
    : 0;
  const status: ChallengeStatus = completionPercent === 100
    ? "completed"
    : completionPercent > 0
      ? "in_progress"
      : "not_started";

  return {
    id: row.id,
    collectionSlug: row.collection_slug,
    name: row.name,
    description: row.description,
    badge: row.badge,
    points: Number(row.points || 0),
    difficulty: row.difficulty || "medium",
    category: row.category || "collections",
    requirements: mappedRequirements,
    completedRequirements,
    totalRequirements: mappedRequirements.length,
    completionPercent,
    status,
    earnedAt: row.earned_at || undefined,
  };
}

export async function ensureCollectionChallengeTables(sql: any) {
  await ensureTriviaTables(sql);
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
    )
  `);
  await safe(sql`create index if not exists collection_challenges_collection_slug_idx on collection_challenges (collection_slug)`);
  await safe(sql`create index if not exists collection_challenges_category_idx on collection_challenges (category)`);

  await safe(sql`
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
    )
  `);
  await safe(sql`create unique index if not exists user_collection_challenges_user_challenge_unique on user_collection_challenges (user_id, challenge_id)`);
  await safe(sql`create index if not exists user_collection_challenges_user_status_idx on user_collection_challenges (user_id, status, updated_at desc)`);

  for (const seed of challengeSeeds) {
    await sql`
      insert into collection_challenges (id, collection_slug, name, description, badge, points, requirements, difficulty, category, updated_at)
      values (
        ${seed.id},
        ${seed.collectionSlug},
        ${seed.name},
        ${seed.description},
        ${seed.badge},
        ${seed.points},
        ${safeJson(seed.requirements)}::jsonb,
        ${seed.difficulty},
        ${seed.category},
        now()
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
        updated_at = now()
    `;
  }
}

async function collectionCompanionProgress(sql: any, userId: string | undefined, items: any[]) {
  if (!userId || items.length === 0) return { triviaCompleted: 0, easterEggsCompleted: 0, unlockedAchievementIds: new Set<string>() };
  const pairs = items.map((item) => `${item.mediaType || "movie"}:${item.tmdbId}`);
  const [triviaRows, huntRows, achievementRows] = await Promise.all([
    sql`
      select count(*)::int as count
      from user_trivia_progress utp
      where utp.user_id = ${userId}
        and concat(utp.media_type, ':', utp.tmdb_id::text) = any(${pairs})
    `,
    sql`
      select count(*)::int as count
      from user_easter_egg_progress uep
      where uep.user_id = ${userId}
        and uep.status = 'completed'
        and concat(uep.media_type, ':', uep.tmdb_id::text) = any(${pairs})
    `,
    sql`
      select achievement_id
      from user_achievements
      where user_id = ${userId}
        and earned_at is not null
    `,
  ]);

  return {
    triviaCompleted: Number(triviaRows[0]?.count || 0),
    easterEggsCompleted: Number(huntRows[0]?.count || 0),
    unlockedAchievementIds: new Set<string>(achievementRows.map((row: any) => String(row.achievement_id))),
  };
}

export async function challengesForCollection(sql: any, collectionSlug: string, userId: string | undefined, progress: any, items: any[]) {
  await ensureCollectionChallengeTables(sql);
  const rows = await sql`
    select
      cc.*,
      ucc.completed_at as earned_at
    from collection_challenges cc
    left join user_collection_challenges ucc on ucc.challenge_id = cc.id and ucc.user_id = ${userId || null}::uuid
    where cc.collection_slug = ${collectionSlug}
    order by cc.points desc, cc.name
  `;
  const companion = await collectionCompanionProgress(sql, userId, items);
  const input: CollectionProgressInput = {
    totalCount: Number(progress.totalCount || 0),
    watchedCount: Number(progress.watchedCount || 0),
    status: progress.status || "not_started",
    triviaCompleted: companion.triviaCompleted,
    easterEggsCompleted: companion.easterEggsCompleted,
    unlockedAchievementIds: companion.unlockedAchievementIds,
  };
  const challenges = rows.map((row: any) => mapChallengeRow(row, input));

  if (userId) {
    for (const challenge of challenges) {
      if (challenge.status === "not_started") continue;
      await sql`
        insert into user_collection_challenges (
          user_id,
          challenge_id,
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
          ${challenge.id},
          ${challenge.status},
          ${challenge.completedRequirements},
          ${challenge.totalRequirements},
          ${challenge.completionPercent},
          case when ${challenge.status === "completed"} then ${challenge.points} else 0 end,
          case when ${challenge.status === "completed"} then now() else null end,
          now()
        )
        on conflict (user_id, challenge_id) do update set
          status = excluded.status,
          completed_requirements = excluded.completed_requirements,
          total_requirements = excluded.total_requirements,
          completion_percentage = excluded.completion_percentage,
          points_awarded = case
            when user_collection_challenges.completed_at is not null then user_collection_challenges.points_awarded
            when excluded.status = 'completed' then excluded.points_awarded
            else user_collection_challenges.points_awarded
          end,
          completed_at = case
            when user_collection_challenges.completed_at is not null then user_collection_challenges.completed_at
            when excluded.status = 'completed' then now()
            else null
          end,
          updated_at = now()
      `;
    }
  }

  return challenges;
}

export async function challengeFeed(sql: any, userId?: string) {
  await ensureCollectionChallengeTables(sql);
  const rows = await sql`
    select
      cc.*,
      ucc.status,
      ucc.completion_percentage,
      ucc.completed_requirements,
      ucc.total_requirements,
      ucc.completed_at as earned_at
    from collection_challenges cc
    left join user_collection_challenges ucc on ucc.challenge_id = cc.id and ucc.user_id = ${userId || null}::uuid
    order by coalesce(ucc.completion_percentage, 0) desc, cc.points desc, cc.name
  `;
  const challenges = rows.map((row: any) => ({
    ...mapChallengeRow(row),
    status: row.status === "completed" ? "completed" : row.status === "in_progress" ? "in_progress" : "not_started",
    completionPercent: Number(row.completion_percentage || 0),
    completedRequirements: Number(row.completed_requirements || 0),
    totalRequirements: Number(row.total_requirements || (Array.isArray(row.requirements) ? row.requirements.length : 0)),
    earnedAt: row.earned_at || undefined,
  }));

  return {
    challenges,
    sections: {
      popular: challenges.slice(0, 8),
      inProgress: challenges.filter((challenge: any) => challenge.status === "in_progress"),
      completed: challenges.filter((challenge: any) => challenge.status === "completed"),
      newChallenges: challenges.slice(0, 8),
    },
  };
}

export async function challengeSummaryForUser(sql: any, userId: string) {
  await ensureCollectionChallengeTables(sql);
  const [summary] = await sql`
    select
      count(*) filter (where ucc.completed_at is not null)::int as challenge_count,
      coalesce(sum(points_awarded) filter (where ucc.completed_at is not null), 0)::int as challenge_points
    from user_collection_challenges ucc
    where ucc.user_id = ${userId}
  `;
  const badges = await sql`
    select
      cc.id,
      cc.name,
      cc.description,
      cc.badge,
      cc.points,
      cc.difficulty,
      cc.category,
      ucc.completion_percentage,
      ucc.completed_at
    from user_collection_challenges ucc
    inner join collection_challenges cc on cc.id = ucc.challenge_id
    where ucc.user_id = ${userId}
      and ucc.completed_at is not null
    order by ucc.completed_at desc
    limit 6
  `;
  return {
    challengeCount: Number(summary?.challenge_count || 0),
    challengePoints: Number(summary?.challenge_points || 0),
    featuredBadges: badges.slice(0, 3).map((row: any) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      badge: row.badge,
      points: Number(row.points || 0),
      difficulty: row.difficulty,
      category: row.category,
      completionPercent: Number(row.completion_percentage || 100),
      earnedAt: row.completed_at,
    })),
    recentUnlocks: badges.map((row: any) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      badge: row.badge,
      points: Number(row.points || 0),
      difficulty: row.difficulty,
      category: row.category,
      completionPercent: Number(row.completion_percentage || 100),
      earnedAt: row.completed_at,
    })),
  };
}
