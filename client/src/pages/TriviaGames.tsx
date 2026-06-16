import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
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

type TriviaRoundMode = "casual" | "timed";
type TriviaLoadStatus = "loading" | "building" | "ready" | "error";

const TRIVIA_PACK_POLL_MS = 5000;
const TRIVIA_PACK_MAX_POLLS = 36;

const triviaModeConfig: Record<TriviaRoundMode, { label: string; detail: string; secondsPerQuestion?: number }> = {
  casual: { label: "Casual", detail: "No timer. Best for relaxed play." },
  timed: { label: "Timed", detail: "20 seconds/question. Chase a personal best.", secondsPerQuestion: 20 },
};

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

const popularTriviaTitles: Array<{ title: string; mediaType: MediaType; tmdbId: number; questionCount: number; badge: string }> = [
  {
    title: "Back to the Future",
    mediaType: "movie",
    tmdbId: 105,
    questionCount: 40,
    badge: "Featured",
  },
  {
    title: "Star Wars",
    mediaType: "movie",
    tmdbId: 11,
    questionCount: 40,
    badge: "Classic",
  },
  {
    title: "The Office",
    mediaType: "tv",
    tmdbId: 2316,
    questionCount: 30,
    badge: "TV Round",
  },
  {
    title: "The Terminator",
    mediaType: "movie",
    tmdbId: 218,
    questionCount: 40,
    badge: "Sci-Fi",
  },
  {
    title: "Jurassic Park",
    mediaType: "movie",
    tmdbId: 329,
    questionCount: 40,
    badge: "Adventure",
  },
];

const playlistTriviaCards = [
  {
    title: "Best Time Travel Movies",
    meta: "18 titles",
    image: "/api/og/title/movie/105?card=game",
    action: "Browse Playlists",
    path: "/playlists",
  },
  {
    title: "Space Operas",
    meta: "24 titles",
    image: "/api/og/title/movie/11?card=game",
    action: "Browse Public Playlists",
    path: "/public",
  },
  {
    title: "80s Action",
    meta: "20 titles",
    image: "/api/og/title/movie/218?card=game",
    action: "My Playlists",
    path: "/playlists",
  },
];

const genreChallengeCards = [
  { title: "Summer Blockbuster Challenge", path: "/challenges", image: "/api/og/title/movie/329?card=game", meta: "25 questions / tickets" },
  { title: "Halloween Horror Challenge", path: "/challenges", image: "/api/og/title/movie/348?card=game", meta: "30 questions / seasonal badge" },
  { title: "Oscar Challenge", path: "/challenges", image: "/api/og/title/movie/13?card=game", meta: "20 questions / awards round" },
];

const titleGameCards: GameCardDefinition[] = [
  {
    id: "classic-trivia",
    title: "Classic Trivia",
    description: "Answer source-grounded questions about the title, cast, release, and story.",
    difficulty: "Easy",
    estimatedTime: "3 min",
  },
];

const playableTitleGameCards = titleGameCards;

function gameTargetPath(mediaType: MediaType, tmdbId: number) {
  return mediaType === "tv" ? `/tv/${tmdbId}` : `/movies/${tmdbId}`;
}

function highScoreText() {
  return "No high score yet";
}

function safeTriviaStatusCopy(feed: TriviaFeed | null, pollAttempt: number) {
  if (feed?.generationStatus === "queued") return "Queued";
  if (feed?.generationStatus === "generating") return "Building";
  if (pollAttempt >= TRIVIA_PACK_MAX_POLLS) return "Longer than usual";
  return "Temporarily unavailable";
}

function safeTriviaUnavailableCopy(feed: TriviaFeed | null, pollAttempt: number) {
  const notes = `${feed?.error || ""} ${feed?.notes || ""}`.toLowerCase();
  const providerName = ["open", "ai"].join("");
  if (notes.includes("not configured") || notes.includes(providerName) || notes.includes("api key") || notes.includes("model")) {
    return "Trivia Pack Temporarily Unavailable. Please try again later.";
  }
  if (pollAttempt >= TRIVIA_PACK_MAX_POLLS) {
    return "This trivia pack is taking longer than usual. Please try again shortly.";
  }
  return "Trivia Pack Temporarily Unavailable. Please try again later.";
}

function scoreTrivia(questions: TriviaQuestion[], answers: Record<string, string>) {
  const correctCount = questions.reduce((count, question) => count + (answers[question.id] === question.answer ? 1 : 0), 0);
  return {
    correctCount,
    totalCount: questions.length,
    score: correctCount * 100,
  };
}

function inferQuestionType(question: TriviaQuestion) {
  if (question.questionType) return question.questionType;
  const prompt = question.question.toLowerCase();
  if (prompt.includes("quote") || prompt.includes("line")) return "quote";
  if (prompt.includes("weapon")) return "weapon";
  if (prompt.includes("vehicle") || prompt.includes("car") || prompt.includes("travel through time")) return "vehicle";
  if (prompt.includes("where") || prompt.includes("location") || prompt.includes("place")) return "location";
  if (prompt.includes("who") || prompt.includes("which character")) return "character";
  if (prompt.includes("director") || prompt.includes("producer") || prompt.includes("production")) return "production";
  if (prompt.includes("franchise") || prompt.includes("sequel")) return "franchise";
  return "story";
}

function imageCouldRevealAnswer(question: TriviaQuestion, imageType?: TriviaQuestion["imageType"]) {
  if (!imageType) return false;
  const questionType = inferQuestionType(question);
  if (questionType === "weapon" && (imageType === "weapon" || imageType === "object" || imageType === "character")) return true;
  if (questionType === "vehicle" && (imageType === "vehicle" || imageType === "object" || imageType === "poster")) return true;
  if (questionType === "character" && imageType === "character") return true;
  if (questionType === "quote" && imageType === "character") return true;
  if (questionType === "story" && (imageType === "weapon" || imageType === "vehicle" || imageType === "object")) return true;
  return false;
}

function safeTriviaImage(question: TriviaQuestion, fallbackArtworkUrl?: string) {
  const questionType = inferQuestionType(question);
  if (question.imageUrl && !imageCouldRevealAnswer(question, question.imageType)) {
    return {
      src: question.imageUrl,
      label: question.imageType || "image",
    };
  }
  if (fallbackArtworkUrl && !["character", "quote", "vehicle", "weapon"].includes(questionType)) {
    return {
      src: fallbackArtworkUrl,
      label: "backdrop",
    };
  }
  return null;
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

function GameCard({ game, selected, onPlay }: { game: GameCardDefinition; selected?: boolean; onPlay: () => void }) {
  return (
    <article className={`title-game-card${selected ? " is-selected" : ""}`}>
      <div className="title-game-card-copy">
        <span>{game.difficulty} / {game.estimatedTime}</span>
        <h3>{game.title}</h3>
        <p>{game.description}</p>
      </div>
      <div className="title-game-score-row">
        <small>{highScoreText()}</small>
        <button className="primary-button compact" onClick={onPlay} type="button">
          {selected ? "Selected" : "Play"}
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

  const featuredTrivia = popularTriviaTitles[0];

  return (
    <section className="route-page trivia-games-page arcade-preview-page">
      <header className="arcade-preview-hero">
        <div className="arcade-hero-copy">
          <span>Flim Arcade</span>
          <h1>Movie trivia, ready to play.</h1>
          <div className="arcade-hero-actions">
            <button className="primary-button" onClick={() => onNavigate(`/games/title/${featuredTrivia.mediaType}/${featuredTrivia.tmdbId}`)} type="button">
              Play Now
            </button>
            <button className="secondary-button" onClick={() => onNavigate("/challenges")} type="button">
              Challenges
            </button>
          </div>
          {notifyMessage ? <small className="arcade-notify-message">{notifyMessage}</small> : null}
        </div>
        <article className="arcade-featured-trivia-card">
          <img alt="" src={`/api/og/title/${featuredTrivia.mediaType}/${featuredTrivia.tmdbId}?card=game`} />
          <div>
            <span>Featured Trivia</span>
            <h2>{featuredTrivia.title}</h2>
            <p>{featuredTrivia.questionCount} questions</p>
          </div>
        </article>
      </header>

      {featuredChallenges.length > 0 ? (
        <section className="title-games-section arcade-live-section">
          <div className="actor-section-heading">
            <h2>Featured challenges</h2>
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
          <h2>Trending trivia</h2>
          <span>Movie rounds</span>
        </div>
        <div className="arcade-movie-row">
          {popularTriviaTitles.map((title) => (
            <article className="arcade-trivia-card" key={`${title.mediaType}-${title.tmdbId}`}>
              <img alt="" src={`/api/og/title/${title.mediaType}/${title.tmdbId}?card=game`} />
              <span>{title.badge}</span>
              <h3>{title.title}</h3>
              <p>{title.questionCount} questions</p>
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
          <h2>Movie challenges</h2>
          <span>Event rounds</span>
        </div>
        <div className="arcade-challenge-row">
          {genreChallengeCards.map((card) => (
            <article className="challenge-discovery-card" key={card.title}>
              <img alt="" src={card.image} />
              <h3>{card.title}</h3>
              <p>{card.meta}</p>
              <button className="secondary-button compact" onClick={() => onNavigate(card.path)} type="button">
                Play Now
              </button>
            </article>
          ))}
        </div>
      </section>

      <section className="title-games-section arcade-feature-section">
        <div className="actor-section-heading">
          <h2>Playlist trivia</h2>
          <span>Curated rounds</span>
        </div>
        <div className="arcade-challenge-row">
          {playlistTriviaCards.map((card) => (
            <article className="challenge-discovery-card" key={card.title}>
              <img alt="" src={card.image} />
              <h3>{card.title}</h3>
              <p>{card.meta}</p>
              <button className="secondary-button compact" onClick={() => onNavigate(card.path)} type="button">
                {card.action}
              </button>
            </article>
          ))}
        </div>
      </section>

      <TicketSummaryPanel />

      <section className="title-games-section arcade-reward-section">
        <div className="actor-section-heading">
          <h2>Rewards</h2>
          <span>Earned by playing</span>
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

      <FriendChallengeHistory onNavigate={onNavigate} />
    </section>
  );
}

function ClassicTriviaPanel({ mediaType, tmdbId, title, artworkUrl, gameTitle = "Classic Trivia", sectionLabel = "Title-specific pack" }: { mediaType: MediaType; tmdbId: number; title: string; artworkUrl?: string; gameTitle?: string; sectionLabel?: string }) {
  const [feed, setFeed] = useState<TriviaFeed | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<TriviaLoadStatus>("loading");
  const [loadStartedAt, setLoadStartedAt] = useState(() => Date.now());
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [pollAttempt, setPollAttempt] = useState(0);
  const [lastPackCheck, setLastPackCheck] = useState("");
  const activeTriviaRequest = useRef(0);
  const [completed, setCompleted] = useState(false);
  const [mode, setMode] = useState<TriviaRoundMode>("casual");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [skippedQuestionIds, setSkippedQuestionIds] = useState<Set<string>>(() => new Set());
  const [reviewingSkipped, setReviewingSkipped] = useState(false);
  const [showSubmitChoice, setShowSubmitChoice] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);
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
  const answeredCount = useMemo(() => questions.filter((question) => Boolean(answers[question.id])).length, [answers, questions]);
  const skippedRemaining = questions.filter((question) => skippedQuestionIds.has(question.id) && !answers[question.id]);
  const attemptedCount = new Set([...Object.keys(answers).filter((id) => Boolean(answers[id])), ...Array.from(skippedQuestionIds)]).size;
  const currentQuestion = questions[currentIndex] || questions[0];
  const currentAnswered = currentQuestion ? Boolean(answers[currentQuestion.id]) : false;
  const questionArtwork = currentQuestion ? safeTriviaImage(currentQuestion, artworkUrl) : null;
  const progressPercent = questions.length ? ((currentIndex + 1) / questions.length) * 100 : 0;

  function resetTriviaRound() {
    setAnswers({});
    setCompleted(false);
    setCurrentIndex(0);
    setSkippedQuestionIds(new Set());
    setReviewingSkipped(false);
    setShowSubmitChoice(false);
    setSecondsRemaining(null);
    setChallengeUrl("");
    setChallengeToken("");
    setChallengeStatus("");
    setCompletionStatus("");
    setCompletionAwards([]);
    setCompletionAchievements([]);
  }

  function loadTriviaPack(options: { reset?: boolean; poll?: boolean } = {}) {
    const requestId = activeTriviaRequest.current + 1;
    activeTriviaRequest.current = requestId;
    if (options.reset) {
      resetTriviaRound();
      setFeed(null);
      setPollAttempt(0);
      setLoadStartedAt(Date.now());
      setElapsedSeconds(0);
      setLastPackCheck("");
    }
    setStatus(options.poll ? "building" : "loading");
    getTitleTrivia({ mediaType, tmdbId, questionCount: 25 })
      .then((result) => {
        if (activeTriviaRequest.current !== requestId) return;
        setFeed(result);
        setLastPackCheck(new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
        if (result.generationStatus === "ready" && result.questions.length > 0) {
          setStatus("ready");
          return;
        }
        if (result.generationStatus === "failed" && result.questions.length === 0) {
          setStatus("error");
          return;
        }
        setStatus("building");
      })
      .catch(() => {
        if (activeTriviaRequest.current !== requestId) return;
        setStatus("error");
      });
    return () => {
      activeTriviaRequest.current += 1;
    };
  }

  useEffect(() => {
    return loadTriviaPack({ reset: true });
  }, [mediaType, tmdbId]);

  useEffect(() => {
    if (status !== "loading" && status !== "building") return undefined;
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.max(1, Math.round((Date.now() - loadStartedAt) / 1000)));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [loadStartedAt, status]);

  useEffect(() => {
    if (status !== "building" || pollAttempt >= TRIVIA_PACK_MAX_POLLS) return undefined;
    const timer = window.setTimeout(() => {
      setPollAttempt((attempt) => attempt + 1);
      loadTriviaPack({ poll: true });
    }, TRIVIA_PACK_POLL_MS);
    return () => window.clearTimeout(timer);
  }, [pollAttempt, status, mediaType, tmdbId]);

  useEffect(() => {
    if (status === "building" && pollAttempt >= TRIVIA_PACK_MAX_POLLS) {
      setStatus("error");
    }
  }, [pollAttempt, status]);

  useEffect(() => {
    if (showSubmitChoice || completed) {
      setSecondsRemaining(null);
      return;
    }
    const seconds = triviaModeConfig[mode].secondsPerQuestion;
    setSecondsRemaining(seconds || null);
  }, [completed, currentIndex, mode, reviewingSkipped, showSubmitChoice]);

  useEffect(() => {
    if (!secondsRemaining || completed || showSubmitChoice || status !== "ready") return undefined;
    const timer = window.setTimeout(() => {
      if (secondsRemaining <= 1) {
        skipCurrentQuestion();
        return;
      }
      setSecondsRemaining((current) => (current ? current - 1 : current));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [completed, mode, secondsRemaining, showSubmitChoice, status]);

  async function handleCreateChallenge() {
    if (!completed || !feed) return;
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

  function moveToNextQuestion() {
    if (!questions.length) return;
    if (reviewingSkipped) {
      const nextSkipped = questions.findIndex((question) => skippedQuestionIds.has(question.id) && !answers[question.id]);
      if (nextSkipped >= 0) {
        setCurrentIndex(nextSkipped);
        return;
      }
      setReviewingSkipped(false);
      setShowSubmitChoice(true);
      return;
    }
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((index) => index + 1);
      return;
    }
    setShowSubmitChoice(true);
  }

  function answerCurrentQuestion(option: string) {
    if (!currentQuestion || completed) return;
    setAnswers((current) => ({ ...current, [currentQuestion.id]: option }));
    setSkippedQuestionIds((current) => {
      const next = new Set(current);
      next.delete(currentQuestion.id);
      return next;
    });
  }

  function skipCurrentQuestion() {
    if (!currentQuestion || completed) return;
    setSkippedQuestionIds((current) => new Set(current).add(currentQuestion.id));
    moveToNextQuestion();
  }

  function reviewSkippedQuestions() {
    const firstSkipped = questions.findIndex((question) => skippedQuestionIds.has(question.id) && !answers[question.id]);
    if (firstSkipped >= 0) {
      setCurrentIndex(firstSkipped);
      setReviewingSkipped(true);
      setShowSubmitChoice(false);
    }
  }

  async function finishTrivia() {
    if (!questions.length || completed) return;
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

  if (status === "loading" || status === "building") {
    return (
      <section className="title-games-section trivia-building-pack">
        <span className="title-game-kicker">{status === "loading" ? "Checking cache" : "Building"}</span>
        <h2>{status === "loading" ? "Loading Trivia Pack" : "Building Trivia Pack"}</h2>
        <p>{feed?.notes || "Creating movie-fan questions for this title."}</p>
        <div className="trivia-pack-activity" aria-label="Trivia pack loading progress">
          <span />
          <span />
          <span />
        </div>
        <div className="trivia-building-detail">
          <span>Status</span>
          <strong>{feed?.generationStatus === "queued" ? "Queued" : feed?.generationStatus === "generating" ? "Generating" : "Checking saved pack"}</strong>
        </div>
        <div className="trivia-building-detail">
          <span>Expected</span>
          <strong>{pollAttempt > 12 ? "1-5 minutes" : "Under 1 minute"}</strong>
        </div>
        <p className="helper-text">
          {lastPackCheck ? `Last checked ${lastPackCheck}. ` : ""}
          Still working after {elapsedSeconds || 1}s. This will refresh automatically.
        </p>
        <button className="secondary-button compact" onClick={() => loadTriviaPack({ reset: true })} type="button">
          Check Now
        </button>
      </section>
    );
  }

  if (status === "error" || questions.length === 0) {
    return (
      <section className="title-games-section trivia-building-pack">
        <span className="title-game-kicker">Generation Failed</span>
        <h2>Trivia Pack Temporarily Unavailable</h2>
        <p>{safeTriviaUnavailableCopy(feed, pollAttempt)}</p>
        <div className="trivia-building-detail">
          <span>Status</span>
          <strong>{safeTriviaStatusCopy(feed, pollAttempt)}</strong>
        </div>
        <div className="trivia-building-detail">
          <span>Last check</span>
          <strong>{lastPackCheck || "No successful check"}</strong>
        </div>
        <button className="secondary-button compact" onClick={() => loadTriviaPack({ reset: true })} type="button">
          Retry
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

  if (showSubmitChoice && !completed) {
    return (
      <section className="title-games-section classic-trivia-play">
        <div className="trivia-round-summary">
          <span>Round complete</span>
          <h2>{skippedRemaining.length ? `You skipped ${skippedRemaining.length} question${skippedRemaining.length === 1 ? "" : "s"}.` : "Ready to submit?"}</h2>
          <p>{answeredCount}/{questions.length} answered. Your score appears after final submission.</p>
          <div className="share-inline-row">
            {skippedRemaining.length ? (
              <button className="secondary-button" onClick={reviewSkippedQuestions} type="button">
                Review Skipped Questions
              </button>
            ) : null}
            <button className="primary-button" onClick={finishTrivia} type="button">
              Submit Now
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="title-games-section classic-trivia-play">
      <div className="actor-section-heading">
        <h2>{gameTitle}</h2>
        <span>{questions.length} questions ready</span>
      </div>
      <div className="trivia-pack-ready-strip">
        <span>{sectionLabel}</span>
        <strong>Play Now</strong>
        <small>{triviaModeConfig[mode].label} mode</small>
      </div>
      <div className="trivia-score-strip">
        <strong>{completed ? `${score.score} points` : `Question ${currentIndex + 1} of ${questions.length}`}</strong>
        <span>
          {completed
            ? `${score.correctCount} / ${score.totalCount} correct`
            : secondsRemaining
              ? `${secondsRemaining}s left`
              : `${answeredCount} answered / ${skippedRemaining.length} skipped`}
        </span>
      </div>
      {!completed ? (
        <>
          <div className="trivia-mode-row" aria-label="Trivia mode">
            {(Object.keys(triviaModeConfig) as TriviaRoundMode[]).map((modeKey) => (
              <button
                className={mode === modeKey ? "is-selected" : ""}
                key={modeKey}
                onClick={() => setMode(modeKey)}
                type="button"
              >
                <strong>{triviaModeConfig[modeKey].label}</strong>
                <small>{triviaModeConfig[modeKey].detail}</small>
              </button>
            ))}
          </div>
          <div className="trivia-progress-track" aria-label={`Question ${currentIndex + 1} of ${questions.length}`}>
            <span style={{ width: `${progressPercent}%` }} />
          </div>
          {currentQuestion ? (
            <article className="classic-trivia-question is-active" key={currentQuestion.id}>
              <div className="trivia-question-kicker">
                <span>{reviewingSkipped ? "Skipped Review" : `Question ${currentIndex + 1} of ${questions.length}`}</span>
                <small>{inferQuestionType(currentQuestion).replace(/_/g, " ")}</small>
              </div>
              {questionArtwork ? (
                <figure className="trivia-question-art">
                  <img alt="" src={questionArtwork.src} loading="lazy" decoding="async" />
                  <figcaption>{questionArtwork.label}</figcaption>
                </figure>
              ) : null}
              <h3>{currentQuestion.question}</h3>
              <div className="classic-trivia-options">
                {currentQuestion.options.map((option) => {
                  const selected = answers[currentQuestion.id] === option;
                  return (
                    <button
                      className={selected ? "is-selected" : ""}
                      key={option}
                      onClick={() => answerCurrentQuestion(option)}
                      type="button"
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
              <div className="trivia-question-actions">
                <button className="secondary-button compact" onClick={skipCurrentQuestion} type="button">
                  Skip
                </button>
                <button className="primary-button compact" disabled={!currentAnswered} onClick={moveToNextQuestion} type="button">
                  Next
                </button>
              </div>
            </article>
          ) : null}
        </>
      ) : null}
      {!completed ? (
        <button className="primary-button" disabled={attemptedCount < questions.length} onClick={() => setShowSubmitChoice(true)} type="button">
          Finish Round
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
            <button className="secondary-button compact" onClick={() => loadTriviaPack({ reset: true })} type="button">Play Again</button>
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
  const [selectedGameId, setSelectedGameId] = useState(playableTitleGameCards[0]?.id || "classic-trivia");
  const targetPath = Number.isFinite(tmdbId) && tmdbId > 0 ? gameTargetPath(mediaType, tmdbId) : "/playlists";
  const genres = useMemo(() => title?.genres?.filter(Boolean) || [], [title]);
  const recommendationReason = genres[0] ? `Because this is ${genres[0]}` : `Because this is ${mediaType === "tv" ? "TV" : "Movies"}`;
  const recommendedGames = useMemo(() => {
    const genre = genres[0] || (mediaType === "tv" ? "TV" : "Movie");
    return [`${genre} Trivia Challenge`];
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
      <header className="title-games-header title-games-header-close-only">
        <strong>Trivia & Games</strong>
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
            </div>
          </section>

          <ClassicTriviaPanel
            mediaType={mediaType}
            tmdbId={tmdbId}
            title={title.title}
            artworkUrl={title.backdropUrl || title.posterUrl}
            gameTitle={`${title.title} Trivia Pack`}
          />

          <section className="title-games-section">
            <div className="actor-section-heading">
              <h2>Classic Trivia & Alternate Modes</h2>
              <span>{playableTitleGameCards.length} playable mode</span>
            </div>
            <div className="title-game-grid">
              {playableTitleGameCards.map((game) => (
                <GameCard
                  key={game.id}
                  game={game}
                  selected={game.id === selectedGameId}
                  onPlay={() => setSelectedGameId(game.id)}
                />
              ))}
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
