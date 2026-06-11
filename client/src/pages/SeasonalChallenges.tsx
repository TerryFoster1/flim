import { useEffect, useState } from "react";
import { getSeasonalChallenges } from "../services/seasonalChallengeService";
import type { SeasonalChallengeEvent, SeasonalChallengeFeed } from "../types";

interface SeasonalChallengesProps {
  onNavigate: (path: string) => void;
}

function statusText(event: SeasonalChallengeEvent) {
  if (event.userStatus === "completed") return "Badge unlocked";
  if (event.dateStatus === "active") return event.daysRemaining === 1 ? "1 day remaining" : `${event.daysRemaining} days remaining`;
  if (event.dateStatus === "upcoming") return "Coming soon";
  return "Event ended";
}

export function SeasonalChallengeCard({ event, onNavigate }: { event: SeasonalChallengeEvent; onNavigate?: (path: string) => void }) {
  return (
    <article className={`seasonal-challenge-card is-${event.dateStatus} user-${event.userStatus}`}>
      <div className="seasonal-banner-mark" aria-hidden="true">{event.banner || event.badge}</div>
      <div className="seasonal-challenge-copy">
        <div className="challenge-card-topline">
          <span className="challenge-badge-mark">{event.badge}</span>
          <span>{event.points} points</span>
        </div>
        <h3>{event.name}</h3>
        <p>{event.description}</p>
        <div className="challenge-progress-track" aria-label={`${event.completionPercent}% complete`}>
          <span style={{ width: `${event.completionPercent}%` }} />
        </div>
        <div className="challenge-card-meta">
          <strong>{event.completionPercent}%</strong>
          <span>{event.completedRequirements} / {event.totalRequirements} tasks - {statusText(event)}</span>
        </div>
        <div className="challenge-requirement-row">
          {event.requirements.slice(0, 3).map((requirement) => (
            <span className={requirement.completed ? "is-complete" : ""} key={`${event.id}-${requirement.label}`}>
              {requirement.completed ? "Done" : `${Math.min(requirement.progress, requirement.target)}/${requirement.target}`} {requirement.label}
            </span>
          ))}
        </div>
        {onNavigate ? (
          <button className="secondary-button" onClick={() => onNavigate("/playlists")} type="button">
            Find Playlists
          </button>
        ) : null}
      </div>
    </article>
  );
}

export function SeasonalChallenges({ onNavigate }: SeasonalChallengesProps) {
  const [feed, setFeed] = useState<SeasonalChallengeFeed | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let active = true;
    setStatus("loading");
    getSeasonalChallenges()
      .then((result) => {
        if (!active) return;
        setFeed(result);
        setStatus("ready");
      })
      .catch(() => {
        if (!active) return;
        setStatus("error");
      });
    return () => {
      active = false;
    };
  }, []);

  if (status === "loading") {
    return <section className="route-page seasonal-challenges-page"><p className="empty-state">Loading challenges...</p></section>;
  }

  if (status === "error" || !feed) {
    return <section className="route-page seasonal-challenges-page"><p className="error-message">Seasonal challenges are unavailable right now.</p></section>;
  }

  const activeEvents = feed.sections.active;
  const upcoming = feed.sections.upcoming;
  const completed = feed.sections.recentlyCompleted;

  return (
    <section className="route-page seasonal-challenges-page">
      <div className="page-heading">
        <h1>Seasonal Challenges</h1>
        <p>Limited-time movie goals, exclusive badges, and reasons to come back throughout the year.</p>
      </div>

      {feed.sections.featured ? (
        <section className="seasonal-featured-section">
          <SeasonalChallengeCard event={feed.sections.featured} onNavigate={onNavigate} />
        </section>
      ) : null}

      {activeEvents.length > 0 ? (
        <section className="discovery-section">
          <div className="discovery-section-heading">
            <h2>Active Challenges</h2>
          </div>
          <div className="seasonal-challenge-grid">
            {activeEvents.map((event) => <SeasonalChallengeCard event={event} key={event.id} onNavigate={onNavigate} />)}
          </div>
        </section>
      ) : null}

      {upcoming.length > 0 ? (
        <section className="discovery-section">
          <div className="discovery-section-heading">
            <h2>Coming Soon</h2>
          </div>
          <div className="seasonal-challenge-grid">
            {upcoming.map((event) => <SeasonalChallengeCard event={event} key={event.id} onNavigate={onNavigate} />)}
          </div>
        </section>
      ) : null}

      {completed.length > 0 ? (
        <section className="discovery-section">
          <div className="discovery-section-heading">
            <h2>Recently Completed</h2>
          </div>
          <div className="seasonal-challenge-grid">
            {completed.map((event) => <SeasonalChallengeCard event={event} key={event.id} />)}
          </div>
        </section>
      ) : null}
    </section>
  );
}
