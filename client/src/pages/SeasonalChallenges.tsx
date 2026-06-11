import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { getSeasonalChallenges, joinSeasonalChallenge } from "../services/seasonalChallengeService";
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

export function SeasonalChallengeCard({
  children,
  event,
  onNavigate,
}: {
  children?: ReactNode;
  event: SeasonalChallengeEvent;
  onNavigate?: (path: string) => void;
}) {
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
        {children}
      </div>
    </article>
  );
}

export function SeasonalChallenges({ onNavigate }: SeasonalChallengesProps) {
  const [feed, setFeed] = useState<SeasonalChallengeFeed | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");

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

  function replaceEvent(event: SeasonalChallengeEvent) {
    if (!feed) return;
    const replace = (events: SeasonalChallengeEvent[]) => events.map((item) => (item.id === event.id ? event : item));
    setFeed({
      events: replace(feed.events),
      sections: {
        active: replace(feed.sections.active),
        endingSoon: replace(feed.sections.endingSoon),
        upcoming: replace(feed.sections.upcoming),
        recentlyCompleted: replace(feed.sections.recentlyCompleted),
        featured: feed.sections.featured?.id === event.id ? event : feed.sections.featured,
      },
    });
  }

  async function handleJoin(event: SeasonalChallengeEvent) {
    setActionError("");
    setJoiningId(event.id);
    try {
      replaceEvent(await joinSeasonalChallenge(event.id));
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to join seasonal challenge.");
    } finally {
      setJoiningId(null);
    }
  }

  const card = (event: SeasonalChallengeEvent) => (
    <SeasonalChallengeCard event={event} key={event.id} onNavigate={onNavigate}>
      {event.userStatus === "not_started" && event.dateStatus !== "ended" ? (
        <button className="primary-button compact" disabled={joiningId === event.id} onClick={() => handleJoin(event)} type="button">
          {joiningId === event.id ? "Starting..." : "Start Challenge"}
        </button>
      ) : event.userStatus === "completed" ? (
        <span className="challenge-action-status">Badge unlocked</span>
      ) : (
        <span className="challenge-action-status">Challenge started</span>
      )}
    </SeasonalChallengeCard>
  );

  const activeEvents = feed.sections.active;
  const upcoming = feed.sections.upcoming;
  const completed = feed.sections.recentlyCompleted;

  return (
    <section className="route-page seasonal-challenges-page">
      <div className="page-heading">
        <h1>Seasonal Challenges</h1>
        <p>Limited-time movie goals, exclusive badges, and reasons to come back throughout the year.</p>
      </div>
      {actionError ? <p className="error-message">{actionError}</p> : null}

      {feed.sections.featured ? (
        <section className="seasonal-featured-section">
          {card(feed.sections.featured)}
        </section>
      ) : null}

      {activeEvents.length > 0 ? (
        <section className="discovery-section">
          <div className="discovery-section-heading">
            <h2>Active Challenges</h2>
          </div>
          <div className="seasonal-challenge-grid">
            {activeEvents.map(card)}
          </div>
        </section>
      ) : null}

      {upcoming.length > 0 ? (
        <section className="discovery-section">
          <div className="discovery-section-heading">
            <h2>Coming Soon</h2>
          </div>
          <div className="seasonal-challenge-grid">
            {upcoming.map(card)}
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
