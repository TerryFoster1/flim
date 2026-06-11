import { useEffect, useMemo, useState } from "react";
import { getProgressHub } from "../services/progressService";
import type { CollectionChallenge, CompanionAchievement, ProgressActivityItem, ProgressCollectionItem, ProgressHubFeed } from "../types";

interface ProgressProps {
  onNavigate: (path: string) => void;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value || 0);
}

function formatDate(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function progressWidth(value: number) {
  return `${Math.max(0, Math.min(100, Number(value || 0)))}%`;
}

function ProgressTrack({ value, label }: { value: number; label: string }) {
  return (
    <div className="progress-hub-track" aria-label={label}>
      <span style={{ width: progressWidth(value) }} />
    </div>
  );
}

function StatCard({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return (
    <article className="progress-stat-card">
      <strong>{typeof value === "number" ? formatNumber(value) : value}</strong>
      <span>{label}</span>
      {detail ? <small>{detail}</small> : null}
    </article>
  );
}

function CollectionCard({ collection, onNavigate }: { collection: ProgressCollectionItem; onNavigate: (path: string) => void }) {
  return (
    <button className={`progress-collection-card is-${collection.status}`} onClick={() => onNavigate(collection.path)} type="button">
      {collection.posterUrl ? <img alt={`${collection.title} poster`} src={collection.posterUrl} /> : <span className="progress-poster-fallback" />}
      <span className="progress-card-copy">
        <strong>{collection.title}</strong>
        <small>{collection.watchedCount} / {collection.totalCount} watched</small>
        <ProgressTrack value={collection.completionPercent} label={`${collection.completionPercent}% complete`} />
      </span>
      <em>{collection.completionPercent}%</em>
    </button>
  );
}

function ChallengeCard({ challenge, onNavigate }: { challenge: CollectionChallenge; onNavigate: (path: string) => void }) {
  return (
    <button className={`progress-challenge-card is-${challenge.status}`} onClick={() => onNavigate(`/collection/${challenge.collectionSlug}`)} type="button">
      <span className="progress-badge-mark">{challenge.badge}</span>
      <span className="progress-card-copy">
        <strong>{challenge.name}</strong>
        <small>{challenge.completedRequirements} / {challenge.totalRequirements} requirements</small>
        <ProgressTrack value={challenge.completionPercent} label={`${challenge.completionPercent}% complete`} />
      </span>
      <em>{challenge.points} pts</em>
    </button>
  );
}

function AchievementCard({ achievement }: { achievement: CompanionAchievement }) {
  const remaining = Math.max(0, Number(achievement.goalCount || 0) - Number(achievement.progressCount || 0));
  return (
    <article className="progress-achievement-card">
      <span className="progress-badge-mark">{achievement.badgeIcon || "star"}</span>
      <div>
        <strong>{achievement.name}</strong>
        <small>{achievement.unlockedAt ? "Unlocked" : remaining > 0 ? `${remaining} remaining` : "Next unlock"}</small>
        <ProgressTrack value={achievement.completionPercentage || 0} label={`${achievement.completionPercentage || 0}% complete`} />
      </div>
    </article>
  );
}

function ActivityItem({ item, onNavigate }: { item: ProgressActivityItem; onNavigate: (path: string) => void }) {
  return (
    <button className="progress-activity-item" onClick={() => item.path && onNavigate(item.path)} type="button">
      <span />
      <span>
        <strong>{item.label}</strong>
        <small>{item.title}</small>
      </span>
      <em>{formatDate(item.occurredAt)}</em>
    </button>
  );
}

export function Progress({ onNavigate }: ProgressProps) {
  const [feed, setFeed] = useState<ProgressHubFeed | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    setStatus("loading");
    setMessage("");
    getProgressHub()
      .then((result) => {
        if (!active) return;
        setFeed(result);
        setStatus("ready");
      })
      .catch((error) => {
        if (!active) return;
        setStatus("error");
        setMessage(error instanceof Error ? error.message : "Progress is unavailable right now.");
      });
    return () => {
      active = false;
    };
  }, []);

  const inProgressChallenges = useMemo(() => feed?.challenges.inProgress || [], [feed]);
  if (status === "loading") {
    return <section className="route-page progress-hub-page"><p className="empty-state">Loading your progress...</p></section>;
  }

  if (status === "error" || !feed) {
    return (
      <section className="route-page progress-hub-page">
        <p className="error-message">{message || "Progress is unavailable right now."}</p>
        <button className="primary-button compact" onClick={() => onNavigate("/signin")} type="button">Sign In</button>
      </section>
    );
  }

  const summary = feed.summary;
  const companionTotal = summary.triviaTotal + summary.easterEggsTotal;
  const companionDone = summary.triviaCompleted + summary.easterEggsFound;
  const companionPercent = companionTotal ? Math.round((companionDone / companionTotal) * 100) : 0;

  return (
    <section className="route-page progress-hub-page">
      <section className="progress-hero">
        <div>
          <span className="progress-kicker">Progress Hub</span>
          <h1>Your Movie Journey</h1>
          <p>Achievements, collections, challenges, trivia, Easter Eggs, and watch tracking now roll up into one place.</p>
        </div>
        <button className="secondary-button" onClick={() => onNavigate("/hall-of-fame")} type="button">
          Hall of Fame
        </button>
      </section>

      <section className="progress-next-step">
        <div>
          <span>Recommended Next Step</span>
          <h2>{feed.nextStep.title}</h2>
          <p>{feed.nextStep.description}</p>
          <ProgressTrack value={feed.nextStep.completionPercent} label={`${feed.nextStep.completionPercent}% complete`} />
        </div>
        <button className="primary-button compact" onClick={() => onNavigate(feed.nextStep.path)} type="button">
          {feed.nextStep.cta}
        </button>
      </section>

      <section className="progress-stat-grid" aria-label="Progress summary">
        <StatCard label="Achievement Points" value={summary.achievementPoints} detail={`${summary.badgeCount} badges`} />
        <StatCard label="Collections Complete" value={summary.collectionsCompleted} detail={`${summary.collectionsInProgress} in progress`} />
        <StatCard label="Challenges Complete" value={summary.challengesCompleted} detail={`${summary.challengePoints} challenge points`} />
        <StatCard label="Trivia Complete" value={summary.triviaCompleted} detail={`${summary.easterEggsFound} Easter Eggs found`} />
        <StatCard label="Movies Watched" value={summary.moviesWatched} detail={`${summary.tvEpisodesWatched} TV episodes`} />
        <StatCard label="Companion Progress" value={`${companionPercent}%`} detail={`${companionDone} of ${companionTotal || 0} items`} />
      </section>

      <section className="progress-content-grid">
        <div className="progress-panel">
          <div className="progress-panel-heading">
            <h2>Collections In Progress</h2>
            <button onClick={() => onNavigate("/discover")} type="button">Discover</button>
          </div>
          <div className="progress-stack">
            {feed.collections.length > 0 ? feed.collections.map((collection) => (
              <CollectionCard collection={collection} key={collection.id} onNavigate={onNavigate} />
            )) : <p className="empty-state">Start a collection to see progress here.</p>}
          </div>
        </div>

        <div className="progress-panel">
          <div className="progress-panel-heading">
            <h2>Challenges</h2>
            <button onClick={() => onNavigate("/challenges")} type="button">Seasonal</button>
          </div>
          <div className="progress-stack">
            {[...inProgressChallenges, ...feed.challenges.completed].slice(0, 6).map((challenge) => (
              <ChallengeCard challenge={challenge} key={challenge.id} onNavigate={onNavigate} />
            ))}
            {inProgressChallenges.length === 0 && feed.challenges.completed.length === 0 ? <p className="empty-state">Collection challenges will appear as you make progress.</p> : null}
          </div>
        </div>

        <div className="progress-panel">
          <div className="progress-panel-heading">
            <h2>Next Achievements</h2>
          </div>
          <div className="progress-achievement-grid">
            {feed.achievements.nextUnlocks.length > 0 ? feed.achievements.nextUnlocks.slice(0, 4).map((achievement) => (
              <AchievementCard achievement={achievement} key={achievement.id} />
            )) : feed.achievements.featuredBadges.slice(0, 4).map((achievement) => (
              <AchievementCard achievement={achievement} key={achievement.id} />
            ))}
          </div>
        </div>
      </section>

      <section className="progress-panel progress-timeline-panel">
        <div className="progress-panel-heading">
          <h2>Activity Timeline</h2>
        </div>
        <div className="progress-timeline-list">
          {feed.timeline.length > 0 ? feed.timeline.map((item, index) => (
            <ActivityItem item={item} key={`${item.type}-${item.occurredAt}-${index}`} onNavigate={onNavigate} />
          )) : <p className="empty-state">Your movie journey history will appear here as you unlock badges, finish collections, and complete trivia.</p>}
        </div>
      </section>
    </section>
  );
}
