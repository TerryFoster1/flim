import { useEffect, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { getSeasonalChallengeHistory, getSeasonalChallenges } from "../services/seasonalChallengeService";
import { getTicketFeed } from "../services/ticketService";
import type { SeasonalChallengeEvent, SeasonalChallengeFeed, SeasonalChallengeHistoryItem, TicketFeed } from "../types";

interface SeasonalChallengesProps {
  onNavigate: (path: string) => void;
}

function statusText(event: SeasonalChallengeEvent) {
  if (event.userStatus === "completed") return "Badge unlocked";
  if (event.dateStatus === "active") return event.daysRemaining === 1 ? "1 day remaining" : `${event.daysRemaining} days remaining`;
  if (event.dateStatus === "upcoming") return "Coming soon";
  return "Event ended";
}

function challengeTypeLabel(type?: SeasonalChallengeEvent["challengeType"]) {
  if (type === "weekly") return "Weekly Challenge";
  if (type === "monthly") return "Monthly Challenge";
  if (type === "special_event") return "Special Event";
  return "Seasonal Challenge";
}

function titleOg(id: number) {
  return `/api/og/title/movie/${id}?card=game`;
}

function challengeArtworkUrls(event: SeasonalChallengeEvent) {
  if (event.heroImageUrl) return [event.heroImageUrl];

  const key = `${event.slug} ${event.name} ${event.banner || ""} ${event.seasonKey || ""}`.toLowerCase();

  if (key.includes("adventure")) {
    return [titleOg(85), titleOg(22), titleOg(564), titleOg(87)];
  }
  if (key.includes("disney") || key.includes("animation")) {
    return [titleOg(8587), titleOg(812), titleOg(277834), titleOg(109445)];
  }
  if (key.includes("simpsons") || key.includes("springfield")) {
    return ["/api/og/title/tv/456?card=game", titleOg(35), titleOg(862), titleOg(12)];
  }
  if (key.includes("quote")) {
    return [titleOg(289), titleOg(11), titleOg(218), titleOg(603)];
  }
  if (key.includes("space") || key.includes("world")) {
    return [titleOg(11), titleOg(348), titleOg(157336), titleOg(286217)];
  }
  if (key.includes("time")) {
    return [titleOg(105), titleOg(218), titleOg(59967), titleOg(137113)];
  }
  if (key.includes("blockbuster") || key.includes("summer")) {
    return [titleOg(329), titleOg(603), titleOg(575265), titleOg(85)];
  }
  if (key.includes("horror") || key.includes("halloween")) {
    return [titleOg(694), titleOg(348), titleOg(1091), titleOg(138843)];
  }
  if (key.includes("christmas") || key.includes("holiday")) {
    return [titleOg(771), titleOg(772), titleOg(1585), titleOg(11395)];
  }
  if (key.includes("oscar") || key.includes("award")) {
    return [titleOg(13), titleOg(238), titleOg(11216), titleOg(496243)];
  }

  return ["/arcade/flim-arcade-hero.png"];
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
  const questionCount = Number(event.playableQuestionCount || event.questionCount || 0);
  const themeKey = String(event.banner || event.seasonKey || "challenge").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "challenge";
  const artworkUrls = challengeArtworkUrls(event);
  const openChallenge = () => onNavigate?.(`/challenges/${event.slug}`);
  const handleKeyDown = (keyEvent: KeyboardEvent<HTMLElement>) => {
    if (!onNavigate) return;
    if (keyEvent.key === "Enter" || keyEvent.key === " ") {
      keyEvent.preventDefault();
      openChallenge();
    }
  };

  return (
    <article
      className={`seasonal-challenge-card is-${event.dateStatus} user-${event.userStatus} theme-${themeKey}`}
      onClick={onNavigate ? openChallenge : undefined}
      onKeyDown={onNavigate ? handleKeyDown : undefined}
      role={onNavigate ? "button" : undefined}
      tabIndex={onNavigate ? 0 : undefined}
    >
      <div className="seasonal-banner-artwork">
        <div aria-hidden="true" className={`seasonal-art-collage count-${Math.min(artworkUrls.length, 4)}`}>
          {artworkUrls.slice(0, 4).map((url, index) => (
            <img alt="" className={`seasonal-art-tile tile-${index + 1}`} key={`${event.slug}-art-${url}`} src={url} />
          ))}
        </div>
        <span>{event.banner || event.badge}</span>
      </div>
      <div className="seasonal-challenge-copy">
        <div className="challenge-card-topline">
          <span className="challenge-badge-mark">{event.badge}</span>
          <span>{challengeTypeLabel(event.challengeType)} - {questionCount} questions - {event.points} points</span>
        </div>
        <h3>{event.name}</h3>
        <p>{event.description}</p>
        <div className="challenge-card-meta">
          <span>{event.participantCount || 0} participants</span>
          <span>{event.topScore ? `Top score ${event.topScore}` : "No score yet"}</span>
          {event.personalBest ? <span>Your best {event.personalBest}</span> : null}
        </div>
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
        {children}
      </div>
    </article>
  );
}

export function SeasonalChallenges({ onNavigate }: SeasonalChallengesProps) {
  const [feed, setFeed] = useState<SeasonalChallengeFeed | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [history, setHistory] = useState<SeasonalChallengeHistoryItem[]>([]);
  const [tickets, setTickets] = useState<TicketFeed | null>(null);

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
    getSeasonalChallengeHistory()
      .then((items) => {
        if (active) setHistory(items);
      })
      .catch(() => undefined);
    getTicketFeed(6)
      .then((result) => {
        if (active) setTickets(result);
      })
      .catch(() => undefined);
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

  const card = (event: SeasonalChallengeEvent) => (
    <SeasonalChallengeCard event={event} key={event.id} onNavigate={onNavigate}>
      {event.userStatus === "completed" ? (
        <span className="challenge-action-status">Badge unlocked</span>
      ) : event.dateStatus === "active" ? (
        <span className="challenge-action-status">Tap card to play</span>
      ) : (
        <span className="challenge-action-status">{statusText(event)}</span>
      )}
    </SeasonalChallengeCard>
  );

  const activeEvents = feed.sections.active;
  const upcomingEvents = feed.sections.upcoming;
  const completed = feed.sections.recentlyCompleted;

  return (
    <section className="route-page seasonal-challenges-page">
      <div className="page-heading">
        <h1>Games & Trivia</h1>
        <p>Weekly, seasonal, and special movie challenges built around shared trivia and watch goals.</p>
        <div className="collection-hero-actions">
          <button className="secondary-button hall-inline-link" onClick={() => onNavigate("/progress")} type="button">
            View Progress
          </button>
          <button className="secondary-button hall-inline-link" onClick={() => onNavigate("/hall-of-fame")} type="button">
            Hall of Fame
          </button>
        </div>
      </div>

      {tickets ? (
        <section className="challenge-ticket-strip">
          <div>
            <span>Ticket Balance</span>
            <strong>{tickets.wallet.ticketBalance}</strong>
          </div>
          <p>Tickets are earned through trivia and challenge participation. They are not purchased.</p>
          <div className="challenge-ticket-rules">
            {tickets.earningRules.slice(0, 3).map((rule) => (
              <span key={rule.ruleKey}>{rule.name}: {rule.ticketAmount}</span>
            ))}
          </div>
        </section>
      ) : null}

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
      ) : <p className="empty-state">No seasonal challenge is active right now.</p>}

      {upcomingEvents.length > 0 ? (
        <section className="discovery-section">
          <div className="discovery-section-heading">
            <h2>Upcoming Challenges</h2>
          </div>
          <div className="seasonal-challenge-grid">
            {upcomingEvents.map((event) => <SeasonalChallengeCard event={event} key={event.id} onNavigate={onNavigate} />)}
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

      {history.length > 0 ? (
        <section className="discovery-section">
          <div className="discovery-section-heading">
            <h2>Your Challenge History</h2>
          </div>
          <div className="challenge-history-grid">
            {history.slice(0, 6).map((item) => (
              <button className="challenge-history-card" key={item.id} onClick={() => onNavigate(item.shareUrl)} type="button">
                <span>{challengeTypeLabel(item.challengeType)}</span>
                <strong>{item.challengeName}</strong>
                <small>{item.score} points - {item.correctCount}/{item.totalCount} correct</small>
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </section>
  );
}
