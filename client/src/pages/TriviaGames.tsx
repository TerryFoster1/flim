import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { BrandMark } from "../components/BrandMark";
import { ShareAssetButton } from "../components/ShareAssetButton";
import { createFriendChallenge, getFriendChallengeHistory } from "../services/friendChallengeService";
import { getSeasonalChallenges } from "../services/seasonalChallengeService";
import { getTicketFeed } from "../services/ticketService";
import { getMovieDetails, getTvDetails } from "../services/tmdbService";
import { completeCompanionItem, getTitleTrivia } from "../services/triviaService";
import type { CompanionAchievement, FriendChallengeHistoryAttempt, FriendTriviaChallenge, MediaType, MovieDetails, SeasonalChallengeEvent, TicketAward, TicketFeed, TriviaFeed, TriviaQuestion } from "../types";

interface TriviaGamesProps {
  onNavigate: (path: string) => void;
  mediaType?: MediaType;
  tmdbId?: number;
  returnTo?: string;
}

interface GameCardDefinition {
  id: string;
  title: string;
  description: string;
  difficulty: "Easy" | "Medium" | "Hard";
  estimatedTime: string;
}

const arcadeFeatureCards = [
  {
    title: "Title Trivia",
    description: "Play source-grounded questions tied to movies and shows you already care about.",
    meta: "Playable now",
  },
  {
    title: "Playlist Trivia",
    description: "Turn curated playlists into game-night rounds built from the titles inside them.",
    meta: "Playlist mode",
  },
  {
    title: "Friend Challenges",
    description: "Finish a trivia pack, share your score, and invite someone to beat it.",
    meta: "Score challenges",
  },
  {
    title: "Weekly Challenges",
    description: "Fresh recurring challenges built around genres, franchises, and featured titles.",
    meta: "Event rounds",
  },
  {
    title: "Seasonal Events",
    description: "Halloween horror, award season, summer blockbusters, and holiday movie events.",
    meta: "Limited-time play",
  },
];

const arcadeRewardCards = [
  {
    title: "Film Critters",
    description: "Avatar identity for players, collectors, and movie-night regulars.",
    image: "/avatars/base/classic.png",
  },
  {
    title: "Tickets",
    description: "Earned through play and challenge participation. Never purchased.",
    image: "/avatars/skins/magnifico.png",
  },
  {
    title: "Concession Stand",
    description: "A home for cosmetics, profile themes, and event rewards as Arcade grows.",
    image: "/avatars/skins/rex.png",
  },
  {
    title: "Partner Rewards",
    description: "Reserved for tasteful entertainment rewards that fit the Flim experience.",
    image: "/avatars/skins/spaceman.png",
  },
];

const popularTriviaTitles: Array<{ title: string; mediaType: MediaType; tmdbId: number; description: string }> = [
  {
    title: "Back to the Future",
    mediaType: "movie",
    tmdbId: 105,
    description: "Time machines, clock towers, and one very specific speed.",
  },
  {
    title: "Star Wars",
    mediaType: "movie",
    tmdbId: 11,
    description: "A fast entry point for galaxy-sized movie knowledge.",
  },
  {
    title: "The Office",
    mediaType: "tv",
    tmdbId: 2316,
    description: "Test what you remember from Scranton's favorite workplace.",
  },
];

const playlistTriviaCards = [
  {
    title: "Director's Cut Trivia",
    description: "Playlist-based rounds that turn curated collections into movie-night quizzes.",
    action: "Browse Playlists",
    path: "/playlists",
  },
  {
    title: "Franchise Night",
    description: "Build a round from connected titles, sequels, and shared movie universes.",
    action: "Explore Discovery",
    path: "/discover",
  },
  {
    title: "Your Watchlist Round",
    description: "A personal trivia night based on the titles you already saved.",
    action: "My Playlists",
    path: "/playlists",
  },
];

const genreChallengeCards = [
  { title: "Sci-Fi Speed Round", path: "/genre/scifi", reason: "Because genre rounds start with discovery hubs" },
  { title: "Horror Night", path: "/genre/horror", reason: "Built for spooky-season and horror playlists" },
  { title: "Time Travel Trivia", path: "/discover?query=time%20travel", reason: "Great for franchise and theme nights" },
];

const titleGameCards: GameCardDefinition[] = [
  {
    id: "classic-trivia",
    title: "Classic Trivia",
    description: "Answer source-grounded questions about the title, cast, release, and story.",
    difficulty: "Easy",
    estimatedTime: "3 min",
  },
  {
    id: "poster-guess",
    title: "Poster Guess",
    description: "Identify titles from cropped poster art and visual clues.",
    difficulty: "Medium",
    estimatedTime: "2 min",
  },
  {
    id: "quote-challenge",
    title: "Quote Challenge",
    description: "Match memorable lines to characters and scenes.",
    difficulty: "Medium",
    estimatedTime: "4 min",
  },
  {
    id: "scene-challenge",
    title: "Scene Challenge",
    description: "Place key moments in the right order without spoiling the ending.",
    difficulty: "Hard",
    estimatedTime: "5 min",
  },
  {
    id: "timeline-challenge",
    title: "Timeline Challenge",
    description: "Build the release, story, or franchise timeline from clues.",
    difficulty: "Hard",
    estimatedTime: "5 min",
  },
  {
    id: "character-match",
    title: "Character Match",
    description: "Pair characters, actors, roles, and relationships.",
    difficulty: "Easy",
    estimatedTime: "3 min",
  },
  {
    id: "soundtrack-challenge",
    title: "Soundtrack Challenge",
    description: "Spot songs, scores, and music cues connected to the title.",
    difficulty: "Medium",
    estimatedTime: "4 min",
  },
  {
    id: "speed-round",
    title: "Speed Round",
    description: "A fast set of short questions for a quick score run.",
    difficulty: "Medium",
    estimatedTime: "90 sec",
  },
];

function gameTargetPath(mediaType: MediaType, tmdbId: number) {
  return mediaType === "tv" ? `/tv/${tmdbId}` : `/movies/${tmdbId}`;
}

function highScoreText() {
  return "No high score yet";
}

function scoreTrivia(questions: TriviaQuestion[], answers: Record<string, string>) {
  const correctCount = questions.reduce((count, question) => count + (answers[question.id] === question.answer ? 1 : 0), 0);
  return {
    correctCount,
    totalCount: questions.length,
    score: correctCount * 100,
  };
}

function resultState(correctCount: number, totalCount: number) {
  if (totalCount > 0 && correctCount === totalCount) return "perfect";
  const percent = totalCount > 0 ? correctCount / totalCount : 0;
  if (percent >= 0.75) return "strong";
  if (percent >= 0.45) return "complete";
  return "low";
}

function resultHeadline(correctCount: number, totalCount: number) {
  const state = resultState(correctCount, totalCount);
  if (state === "perfect") return "Perfect Score!";
  if (state === "strong") return "Movie Buff";
  if (state === "complete") return "Challenge Complete";
  return "Try again?";
}

function resultCritterLine(correctCount: number, totalCount: number) {
  const state = resultState(correctCount, totalCount);
  if (state === "perfect") return "Holy popcorn! You nailed it.";
  if (state === "strong") return "You are ready for the big screen.";
  if (state === "complete") return "Nice run. A replay could push you higher.";
  return "Every movie buff starts somewhere. Run it back.";
}

function ticketTotal(awards: TicketAward[]) {
  return awards.filter((award) => award.awarded).reduce((sum, award) => sum + award.amount, 0);
}

function GameCard({ game, disabled }: { game: GameCardDefinition; disabled: boolean }) {
  return (
    <article className="title-game-card">
      <div className="title-game-card-copy">
        <span>{game.difficulty} / {game.estimatedTime}</span>
        <h3>{game.title}</h3>
        <p>{game.description}</p>
      </div>
      <div className="title-game-score-row">
        <small>{highScoreText()}</small>
        <button className="primary-button compact" disabled={disabled} type="button">
          Play
        </button>
      </div>
    </article>
  );
}

function FriendChallengeHistory({ onNavigate }: { onNavigate: (path: string) => void }) {
  const [created, setCreated] = useState<FriendTriviaChallenge[]>([]);
  const [attempts, setAttempts] = useState<FriendChallengeHistoryAttempt[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "signed_out" | "error">("loading");

  useEffect(() => {
    let mounted = true;
    getFriendChallengeHistory()
      .then((feed) => {
        if (!mounted) return;
        setCreated(feed.created);
        setAttempts(feed.attempts);
        setStatus("ready");
      })
      .catch((error) => {
        if (!mounted) return;
        setStatus(error instanceof Error && error.message.includes("Sign in") ? "signed_out" : "error");
      });
    return () => {
      mounted = false;
    };
  }, []);

  if (status === "loading") return <p className="empty-state">Loading your challenge history...</p>;
  if (status === "signed_out") return null;
  if (status === "error") return <p className="empty-state">Challenge history is unavailable right now.</p>;
  if (created.length === 0 && attempts.length === 0) return null;

  const won = attempts.filter((attempt) => attempt.result === "won");
  const lost = attempts.filter((attempt) => attempt.result === "lost");

  return (
    <section className="title-games-section friend-challenge-history">
      <div className="actor-section-heading">
        <h2>Challenge History</h2>
        <span>{created.length + attempts.length}</span>
      </div>
      <div className="challenge-history-grid">
        {created.slice(0, 4).map((challenge) => (
          <button className="challenge-history-card" key={challenge.token} onClick={() => onNavigate(challenge.shareUrl)} type="button">
            <span>Active Challenge</span>
            <strong>{challenge.title}</strong>
            <small>Beat {challenge.score} / {challenge.attempts} attempts</small>
          </button>
        ))}
        {[...won, ...lost, ...attempts.filter((attempt) => attempt.result === "tie")].slice(0, 4).map((attempt) => (
          <button className={`challenge-history-card is-${attempt.result}`} key={attempt.id} onClick={() => onNavigate(attempt.shareUrl)} type="button">
            <span>{attempt.result === "won" ? "Won" : attempt.result === "lost" ? "Lost" : "Tie"}</span>
            <strong>{attempt.title}</strong>
            <small>{attempt.score} vs {attempt.challengeScore}</small>
          </button>
        ))}
      </div>
    </section>
  );
}

function FeaturedChallengeCard({ event, onNavigate }: { event: SeasonalChallengeEvent; onNavigate: (path: string) => void }) {
  const status = event.dateStatus === "active"
    ? event.daysRemaining === 1 ? "1 day remaining" : `${event.daysRemaining} days remaining`
    : event.dateStatus === "upcoming"
      ? "Scheduled event"
      : "Completed event";

  return (
    <article className={`arcade-featured-challenge is-${event.dateStatus}`}>
      <div className="arcade-challenge-badge" aria-hidden="true">{event.banner || event.badge}</div>
      <div>
        <span>{event.challengeType === "weekly" ? "Weekly Challenge" : event.challengeType === "special_event" ? "Special Event" : "Featured Challenge"}</span>
        <h3>{event.name}</h3>
        <p>{event.description}</p>
        <div className="challenge-card-meta">
          <strong>{event.points} pts</strong>
          <span>{status}</span>
          <span>{event.participantCount || 0} players</span>
        </div>
      </div>
      <button className="primary-button compact" onClick={() => onNavigate(`/challenges/${event.slug}`)} type="button">
        {event.dateStatus === "active" ? "Play Now" : "View Challenge"}
      </button>
    </article>
  );
}

function TicketSummaryPanel() {
  const [feed, setFeed] = useState<TicketFeed | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "signed_out" | "error">("loading");

  useEffect(() => {
    let mounted = true;
    getTicketFeed()
      .then((result) => {
        if (!mounted) return;
        setFeed(result);
        setStatus("ready");
      })
      .catch((error) => {
        if (!mounted) return;
        setStatus(error instanceof Error && error.message.toLowerCase().includes("sign in") ? "signed_out" : "error");
      });
    return () => {
      mounted = false;
    };
  }, []);

  if (status === "loading") {
    return (
      <section className="title-games-section ticket-summary-panel">
        <p className="empty-state">Loading Tickets...</p>
      </section>
    );
  }

  if (status === "signed_out") {
    return (
      <section className="title-games-section ticket-summary-panel">
        <div>
          <span>Tickets</span>
          <h2>Earn Tickets by playing Flim.</h2>
          <p>Sign in to track ticket rewards from trivia, friend challenges, and seasonal events.</p>
        </div>
      </section>
    );
  }

  if (status === "error" || !feed) return null;

  return (
    <section className="title-games-section ticket-summary-panel">
      <div className="ticket-balance-card">
        <span>Ticket Balance</span>
        <strong>{feed.wallet.ticketBalance}</strong>
        <small>{feed.wallet.lifetimeTicketsEarned} lifetime earned / never purchasable</small>
      </div>
      <div className="ticket-earning-card">
        <div className="actor-section-heading">
          <h2>How To Earn Tickets</h2>
          <span>Earned only</span>
        </div>
        <div className="ticket-rule-list">
          {feed.earningRules.slice(0, 5).map((rule) => (
            <article key={rule.ruleKey}>
              <strong>{rule.name}</strong>
              <span>{rule.ticketAmount} Tickets</span>
              <small>{rule.description}</small>
            </article>
          ))}
        </div>
      </div>
      {feed.history.length > 0 ? (
        <div className="ticket-history-card">
          <div className="actor-section-heading">
            <h2>Recent Earnings</h2>
            <span>{feed.history.length}</span>
          </div>
          <div className="ticket-history-list">
            {feed.history.slice(0, 5).map((transaction) => (
              <article key={transaction.id}>
                <strong>+{transaction.amount} Tickets</strong>
                <span>{String(transaction.metadata?.ruleName || transaction.transactionType).replace(/_/g, " ")}</span>
              </article>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function GlobalTriviaGames({ onNavigate }: { onNavigate: (path: string) => void }) {
  const [notifyMessage, setNotifyMessage] = useState("");
  const [featuredChallenges, setFeaturedChallenges] = useState<SeasonalChallengeEvent[]>([]);

  useEffect(() => {
    let mounted = true;
    getSeasonalChallenges()
      .then((feed) => {
        if (!mounted) return;
        const visible = [
          feed.sections.featured,
          ...feed.sections.active,
        ].filter((event): event is SeasonalChallengeEvent => {
          return Boolean(event) && (event as SeasonalChallengeEvent).dateStatus === "active";
        });
        const unique = Array.from(new Map(visible.map((event) => [event.id, event])).values());
        setFeaturedChallenges(unique.slice(0, 3));
      })
      .catch(() => {
        if (mounted) setFeaturedChallenges([]);
      });
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <section className="route-page trivia-games-page arcade-preview-page">
      <header className="arcade-preview-hero">
        <div className="arcade-hero-copy">
          <span>Flim Arcade</span>
          <h1>Trivia & Games</h1>
          <p>Test your movie knowledge, challenge friends, and discover new favorites through playable film and TV experiences.</p>
          <div className="arcade-hero-actions">
            <button className="primary-button" onClick={() => onNavigate("/games/title/movie/105")} type="button">
              Play Back to the Future
            </button>
            <button className="secondary-button" onClick={() => onNavigate("/challenges")} type="button">
              View Challenges
            </button>
          </div>
          {notifyMessage ? <small className="arcade-notify-message">{notifyMessage}</small> : null}
        </div>
        <div className="arcade-hero-art" aria-hidden="true">
          <div className="arcade-play-menu">
            <span>Play Menu</span>
            <strong>Choose a round</strong>
            <div className="arcade-play-menu-list">
              <div>
                <b>Classic Trivia</b>
                <small>Movie fan questions</small>
              </div>
              <div>
                <b>Friend Challenge</b>
                <small>Share a score to beat</small>
              </div>
              <div>
                <b>Seasonal Event</b>
                <small>Limited-time challenges</small>
              </div>
            </div>
          </div>
        </div>
      </header>

      <TicketSummaryPanel />

      {featuredChallenges.length > 0 ? (
        <section className="title-games-section arcade-live-section">
          <div className="actor-section-heading">
            <h2>Featured Challenges</h2>
            <span>Play now</span>
          </div>
          <div className="arcade-live-grid">
            {featuredChallenges.map((event) => (
              <FeaturedChallengeCard event={event} key={event.id} onNavigate={onNavigate} />
            ))}
          </div>
        </section>
      ) : null}

      <section className="title-games-section arcade-live-section">
        <div className="actor-section-heading">
          <h2>Popular Movie Trivia</h2>
          <span>Playable title packs</span>
        </div>
        <div className="arcade-trivia-grid">
          {popularTriviaTitles.map((title) => (
            <article className="arcade-trivia-card" key={`${title.mediaType}-${title.tmdbId}`}>
              <span>{title.mediaType === "tv" ? "TV Trivia" : "Movie Trivia"}</span>
              <h3>{title.title}</h3>
              <p>{title.description}</p>
              <button
                className="primary-button compact"
                onClick={() => onNavigate(`/games/title/${title.mediaType}/${title.tmdbId}`)}
                type="button"
              >
                Play Now
              </button>
            </article>
          ))}
        </div>
      </section>

      <section className="title-games-section arcade-feature-section">
        <div className="actor-section-heading">
          <h2>Playlist Trivia</h2>
          <span>Playlist-first games</span>
        </div>
        <div className="arcade-trivia-grid">
          {playlistTriviaCards.map((card) => (
            <article className="arcade-trivia-card" key={card.title}>
              <span>Playlist Mode</span>
              <h3>{card.title}</h3>
              <p>{card.description}</p>
              <button className="secondary-button compact" onClick={() => onNavigate(card.path)} type="button">
                {card.action}
              </button>
            </article>
          ))}
        </div>
      </section>

      <section className="title-games-section arcade-feature-section">
        <div className="actor-section-heading">
          <h2>Genre Challenges</h2>
          <span>Discover a round</span>
        </div>
        <div className="challenge-discovery-row">
          {genreChallengeCards.map((card) => (
            <article className="challenge-discovery-card" key={card.title}>
              <strong>{card.title}</strong>
              <small>{card.reason}</small>
              <button className="secondary-button compact" onClick={() => onNavigate(card.path)} type="button">
                Explore
              </button>
            </article>
          ))}
        </div>
      </section>

      <section className="title-games-section arcade-feature-section">
        <div className="actor-section-heading">
          <h2>Game Modes</h2>
          <span>Arcade experiences</span>
        </div>
        <div className="arcade-feature-grid">
          {arcadeFeatureCards.map((feature) => (
            <article className="arcade-feature-card" key={feature.title}>
              <span>{feature.meta}</span>
              <h3>{feature.title}</h3>
              <p>{feature.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="title-games-section arcade-reward-section">
        <div className="actor-section-heading">
          <h2>Rewards</h2>
          <span>Built for playful progress</span>
        </div>
        <div className="arcade-reward-grid">
          {arcadeRewardCards.map((reward) => (
            <article className="arcade-reward-card" key={reward.title}>
              <img
                alt=""
                src={reward.image}
                onError={(event) => {
                  event.currentTarget.style.display = "none";
                }}
              />
              <div>
                <h3>{reward.title}</h3>
                <p>{reward.description}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="title-games-section arcade-play-section">
        <div className="actor-section-heading">
          <h2>Start With a Title</h2>
          <span>Play title trivia</span>
        </div>
        <p>
          Open a movie or TV detail page and tap Trivia & Games, or jump into a featured title here.
          Trivia packs are cached per title and friend challenges reuse the same question set for fair score runs.
        </p>
        <button className="secondary-button" onClick={() => setNotifyMessage("Arcade updates will appear here as new rounds open.")} type="button">
          Keep Me Posted
        </button>
      </section>

      <FriendChallengeHistory onNavigate={onNavigate} />
    </section>
  );
}

function ClassicTriviaPanel({ mediaType, tmdbId, title }: { mediaType: MediaType; tmdbId: number; title: string }) {
  const [feed, setFeed] = useState<TriviaFeed | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [completed, setCompleted] = useState(false);
  const [challengeUrl, setChallengeUrl] = useState("");
  const [challengeToken, setChallengeToken] = useState("");
  const [challengeStatus, setChallengeStatus] = useState("");
  const [ticketStatus, setTicketStatus] = useState("");
  const [completionStatus, setCompletionStatus] = useState("");
  const [completionAwards, setCompletionAwards] = useState<TicketAward[]>([]);
  const [completionAchievements, setCompletionAchievements] = useState<CompanionAchievement[]>([]);
  const questions = feed?.questions || [];
  const isBuildingPack = feed?.generationStatus === "missing" || feed?.generationStatus === "queued" || feed?.generationStatus === "generating";
  const score = useMemo(() => scoreTrivia(questions, answers), [questions, answers]);
  const allAnswered = questions.length > 0 && questions.every((question) => answers[question.id]);

  function loadTriviaPack() {
    let mounted = true;
    setStatus("loading");
    setFeed(null);
    setAnswers({});
    setCompleted(false);
    setChallengeUrl("");
    setChallengeToken("");
    setChallengeStatus("");
    setCompletionStatus("");
    setCompletionAwards([]);
    setCompletionAchievements([]);
    getTitleTrivia({ mediaType, tmdbId })
      .then((result) => {
        if (!mounted) return;
        setFeed(result);
        setStatus("ready");
      })
      .catch(() => {
        if (!mounted) return;
        setStatus("error");
      });
    return () => {
      mounted = false;
    };
  }

  useEffect(() => {
    return loadTriviaPack();
  }, [mediaType, tmdbId]);

  async function handleCreateChallenge() {
    if (!allAnswered || !feed) return;
    setChallengeStatus("Creating challenge...");
    try {
      const result = await createFriendChallenge({
        mediaType,
        tmdbId,
        title,
        questionIds: questions.map((question) => question.id),
        answers,
      });
      const url = `${window.location.origin}${result.challenge.shareUrl}`;
      setChallengeUrl(url);
      setChallengeToken(result.challenge.token);
      setChallengeStatus("Challenge ready.");
      const earned = (result.ticketAwards || []).filter((award) => award.awarded).reduce((sum, award) => sum + award.amount, 0);
      setTicketStatus(earned > 0 ? `Earned ${earned} Tickets.` : "");
    } catch (error) {
      setChallengeStatus(error instanceof Error ? error.message : "Could not create challenge.");
    }
  }

  async function copyChallengeLink() {
    if (!challengeUrl) return;
    await navigator.clipboard?.writeText(challengeUrl).catch(() => undefined);
    setChallengeStatus("Challenge link copied.");
  }

  async function shareChallenge() {
    if (!challengeUrl) return copyChallengeLink();
    const text = `I scored ${score.score} on ${title} trivia. Can you beat it?`;
    if (navigator.share) {
      await navigator.share({ title: `${title} Trivia Challenge`, text, url: challengeUrl }).catch(() => undefined);
      return;
    }
    return copyChallengeLink();
  }
  async function finishTrivia() {
    if (!allAnswered || completed) return;
    setCompleted(true);
    setCompletionStatus("Saving your trivia run...");
    setCompletionAwards([]);
    setCompletionAchievements([]);

    const correctQuestions = questions.filter((question) => answers[question.id] === question.answer && !question.completed);
    if (!correctQuestions.length) {
      setCompletionStatus(score.correctCount > 0 ? "Score saved locally." : "Run complete. Try again to climb higher.");
      return;
    }

    const results = await Promise.allSettled(correctQuestions.map((question) => completeCompanionItem("trivia", question.id)));
    const fulfilled = results.filter((result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof completeCompanionItem>>> => result.status === "fulfilled");
    const awards = fulfilled.map((result) => result.value.ticketAward).filter((award): award is TicketAward => Boolean(award));
    const achievements = fulfilled.flatMap((result) => result.value.unlockedAchievements || []);
    const uniqueAchievements = Array.from(new Map(achievements.map((achievement) => [achievement.id, achievement])).values());
    setCompletionAwards(awards);
    setCompletionAchievements(uniqueAchievements);

    if (fulfilled.length === 0) {
      setCompletionStatus("Score complete. Sign in to save Tickets and badges.");
      return;
    }

    const earnedTickets = ticketTotal(awards);
    setCompletionStatus(earnedTickets > 0 || uniqueAchievements.length > 0 ? "Rewards saved." : "Progress saved.");
  }

  if (status === "loading") {
    return (
      <section className="title-games-section">
        <p className="empty-state">Please wait while we load your trivia questions.</p>
      </section>
    );
  }

  if (status === "error" || questions.length === 0) {
    return (
      <section className="title-games-section">
        <h2>Classic Trivia</h2>
        <p className="empty-state">
          {isBuildingPack ? "Building your trivia pack..." : "This title does not have enough movie-fan trivia yet."}
        </p>
        <p className="helper-text">{feed?.notes || "We do not fall back to cast-table or metadata questions."}</p>
        <button className="secondary-button compact" onClick={loadTriviaPack} type="button">
          Retry Trivia Pack
        </button>
      </section>
    );
  }

  const earnedTickets = ticketTotal(completionAwards);
  const resultKind = resultState(score.correctCount, score.totalCount);
  const resultQuery = new URLSearchParams({
    result: "trivia",
    score: String(score.score),
    correct: String(score.correctCount),
    total: String(score.totalCount),
    tickets: String(earnedTickets),
    state: resultKind,
  });
  const resultShareUrl = `/games/title/${mediaType}/${tmdbId}?${resultQuery.toString()}`;
  const resultCardUrl = `/api/og/trivia-result/${mediaType}/${tmdbId}?score=${score.score}&correct=${score.correctCount}&total=${score.totalCount}&tickets=${earnedTickets}&state=${resultKind}`;

  return (
    <section className="title-games-section classic-trivia-play">
      <div className="actor-section-heading">
        <h2>Classic Trivia</h2>
        <span>{questions.length} questions</span>
      </div>
      <div className="trivia-score-strip">
        <strong>{completed ? `${score.score} points` : "Beat my score mode"}</strong>
        <span>{completed ? `${score.correctCount} / ${score.totalCount} correct` : "Answer the same cached pack your friends will play."}</span>
      </div>
      <div className="classic-trivia-list">
        {questions.map((question, index) => (
          <article className="classic-trivia-question" key={question.id}>
            <span>Question {index + 1}</span>
            <h3>{question.question}</h3>
            <div className="classic-trivia-options">
              {question.options.map((option) => {
                const selected = answers[question.id] === option;
                const isCorrect = completed && option === question.answer;
                const isWrong = completed && selected && option !== question.answer;
                return (
                  <button
                    className={`${selected ? "is-selected" : ""} ${isCorrect ? "is-correct" : ""} ${isWrong ? "is-wrong" : ""}`}
                    disabled={completed}
                    key={option}
                    onClick={() => setAnswers((current) => ({ ...current, [question.id]: option }))}
                    type="button"
                  >
                    {option}
                  </button>
                );
              })}
            </div>
            {completed ? <p>{question.explanation}</p> : null}
          </article>
        ))}
      </div>
      {!completed ? (
        <button className="primary-button" disabled={!allAnswered} onClick={finishTrivia} type="button">
          Finish Trivia
        </button>
      ) : (
        <div className={`trivia-completion-card is-${resultKind}`}>
          <div className="trivia-completion-burst" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </div>
          <div className="trivia-completion-hero-row">
            <img alt="" src="/avatars/base/classic.png" />
            <div>
              <span>Trivia Complete</span>
              <h3>{resultHeadline(score.correctCount, score.totalCount)}</h3>
              <p>{resultCritterLine(score.correctCount, score.totalCount)}</p>
            </div>
          </div>
          <div className="trivia-result-stat-grid">
            <div>
              <span>Score</span>
              <strong>{score.correctCount}/{score.totalCount}</strong>
              <small>{score.score} points</small>
            </div>
            <div className="is-reward">
              <span>Reward</span>
              <strong>{earnedTickets > 0 ? `+${earnedTickets}` : "+0"}</strong>
              <small>{earnedTickets > 0 ? "Tickets earned" : completionStatus || "Sign in to save Tickets"}</small>
            </div>
            <div>
              <span>Accuracy</span>
              <strong>{score.totalCount ? `${Math.round((score.correctCount / score.totalCount) * 100)}%` : "0%"}</strong>
              <small>{completionStatus || "Run complete"}</small>
            </div>
          </div>
          {completionAchievements.length ? (
            <div className="trivia-achievement-strip" aria-label="Unlocked achievements">
              {completionAchievements.slice(0, 3).map((achievement) => (
                <span key={achievement.id}>{achievement.badgeIcon || "Badge"} {achievement.name}</span>
              ))}
            </div>
          ) : null}
          <div className="share-inline-row trivia-result-actions">
            <ShareAssetButton
              className="primary-button compact"
              label="Share Result"
              title={`${title} Trivia Result`}
              text={`I scored ${score.correctCount}/${score.totalCount} on ${title} Trivia. Can you beat my score?`}
              url={resultShareUrl}
              cardUrl={resultCardUrl}
              downloadName={`${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "trivia"}-${score.score}-result-card.png`}
            />
            <button className="secondary-button compact" onClick={handleCreateChallenge} type="button">
              {challengeUrl ? "Challenge Created" : "Challenge Friends"}
            </button>
            <button className="secondary-button compact" onClick={loadTriviaPack} type="button">Play Again</button>
            {challengeUrl ? <button className="secondary-button compact" onClick={shareChallenge} type="button">Share Challenge</button> : null}
            {challengeUrl ? <button className="secondary-button compact" onClick={copyChallengeLink} type="button">Copy Link</button> : null}
            {challengeToken ? (
              <ShareAssetButton
                className="secondary-button compact"
                label="Challenge Card"
                title={`${title} Trivia Challenge`}
                text={`Share your ${title} trivia score challenge.`}
                url={`/challenge/${challengeToken}`}
                cardUrl={`/api/og/challenge/${challengeToken}`}
                downloadName={`${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "trivia"}-challenge-card.png`}
              />
            ) : null}
          </div>
          {challengeStatus ? <small>{challengeStatus}</small> : null}
          {ticketStatus ? <small>{ticketStatus}</small> : null}
        </div>
      )}
    </section>
  );
}

function TitleGamesPage({ mediaType = "movie", tmdbId = 0, returnTo, onNavigate }: TriviaGamesProps) {
  const [title, setTitle] = useState<MovieDetails | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const targetPath = Number.isFinite(tmdbId) && tmdbId > 0 ? gameTargetPath(mediaType, tmdbId) : "/playlists";
  const gamePath = `/games/title/${mediaType}/${tmdbId}`;
  const genres = useMemo(() => title?.genres?.filter(Boolean) || [], [title]);
  const recommendationReason = genres[0] ? `Because this is ${genres[0]}` : `Because this is ${mediaType === "tv" ? "TV" : "Movies"}`;
  const recommendedGames = useMemo(() => {
    const genre = genres[0] || (mediaType === "tv" ? "TV" : "Movie");
    return [
      `${genre} Speed Round`,
      `${genre} Poster Guess`,
      `${genre} Trivia Challenge`,
    ];
  }, [genres, mediaType]);

  useEffect(() => {
    let mounted = true;
    setStatus("loading");
    setTitle(null);

    const loader = mediaType === "tv" ? getTvDetails : getMovieDetails;
    loader(tmdbId)
      .then((result) => {
        if (!mounted) return;
        setTitle(result);
        setStatus("ready");
      })
      .catch(() => {
        if (!mounted) return;
        setStatus("error");
      });

    return () => {
      mounted = false;
    };
  }, [mediaType, tmdbId]);

  function closePage() {
    if (returnTo) {
      onNavigate(returnTo);
      return;
    }
    onNavigate(targetPath);
  }

  if (!Number.isFinite(tmdbId) || tmdbId <= 0) {
    return <section className="route-page title-games-page"><p className="error-message">Title games are unavailable for this title.</p></section>;
  }

  return (
    <section className="route-page title-games-page">
      <header className="title-games-header">
        <button className="title-games-brand reset-button" onClick={() => onNavigate("/")} type="button">
          <BrandMark />
          <span>Flim</span>
        </button>
        <button className="title-games-close" onClick={closePage} type="button" aria-label="Close Trivia and Games">
          X
        </button>
      </header>

      {status === "loading" ? <p className="empty-state">Loading title games...</p> : null}
      {status === "error" ? (
        <div className="media-extension-card">
          <h3>Trivia & Games are taking longer than expected.</h3>
          <p>Return to the title page and try again.</p>
          <button className="primary-button" onClick={closePage} type="button">Back to Title</button>
        </div>
      ) : null}

      {title ? (
        <>
          <section className="title-games-hero" style={title.backdropUrl ? { "--title-games-backdrop": `url("${title.backdropUrl}")` } as CSSProperties : undefined}>
            <div className="title-games-backdrop" aria-hidden="true" />
            {title.posterUrl ? <img alt={`${title.title} poster`} src={title.posterUrl} /> : <span className="poster tone-blue" />}
            <div className="title-games-copy">
              <span>{mediaType === "tv" ? "TV Show Games" : "Movie Games"}</span>
              <h1>{title.title}</h1>
              <p>{title.overview || "Trivia and challenge experiences for this title will live here."}</p>
              <div className="meta-row">
                {title.releaseYear ? <span>{title.releaseYear}</span> : null}
                {genres.slice(0, 3).map((genre) => <span key={genre}>{genre}</span>)}
              </div>
              <div className="share-inline-row">
                <ShareAssetButton
                  label="Share Challenge"
                  title={`${title.title} Trivia & Games`}
                  text="Share a Flim challenge card."
                  url={gamePath}
                  cardUrl={`/api/og/title/${mediaType}/${tmdbId}?card=game`}
                  downloadName={`${title.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || `${mediaType}-${tmdbId}`}-challenge-card.png`}
                />
              </div>
            </div>
          </section>

          <ClassicTriviaPanel mediaType={mediaType} tmdbId={tmdbId} title={title.title} />

          <section className="title-games-section">
            <div className="actor-section-heading">
              <h2>Available Games & Challenges</h2>
              <span>{titleGameCards.length} modes</span>
            </div>
            <div className="title-game-grid">
              {titleGameCards.map((game) => <GameCard key={game.id} game={game} disabled />)}
            </div>
          </section>

          <section className="title-games-section">
            <div className="actor-section-heading">
              <h2>Recommended Games & Challenges</h2>
              <span>{recommendationReason}</span>
            </div>
            <div className="challenge-discovery-row">
              {recommendedGames.map((game) => (
                <article className="challenge-discovery-card" key={game}>
                  <strong>{game}</strong>
                  <small>{highScoreText()}</small>
                </article>
              ))}
            </div>
          </section>
        </>
      ) : null}
    </section>
  );
}

export function TriviaGames(props: TriviaGamesProps) {
  if (props.tmdbId && props.mediaType) return <TitleGamesPage {...props} />;
  return <GlobalTriviaGames onNavigate={props.onNavigate} />;
}
