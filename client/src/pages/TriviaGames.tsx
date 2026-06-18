import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ShareAssetButton } from "../components/ShareAssetButton";
import { createFriendChallenge, getFriendChallengeHistory } from "../services/friendChallengeService";
import { getSeasonalChallengeDetail, getSeasonalChallengeHistory, getSeasonalChallenges } from "../services/seasonalChallengeService";
import { getMovieDetails, getTvDetails } from "../services/tmdbService";
import { getTicketFeed } from "../services/ticketService";
import { completeCompanionItem, getTitleTrivia, notifyTitleTriviaReady } from "../services/triviaService";
import type { CompanionAchievement, FriendChallengeHistoryAttempt, FriendTriviaChallenge, MediaType, MovieDetails, SeasonalChallengeDetail, SeasonalChallengeEvent, SeasonalChallengeHistoryItem, TicketAward, TicketFeed, TriviaFeed, TriviaQuestion } from "../types";

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
type TriviaPlayState = "setup" | "countdown" | "playing";

const TRIVIA_PACK_POLL_MS = 5000;
const TRIVIA_PACK_MAX_POLLS = 36;

const triviaModeConfig: Record<TriviaRoundMode, { label: string; detail: string; secondsPerQuestion?: number }> = {
  casual: { label: "Casual", detail: "No timer. Best for relaxed play." },
  timed: { label: "Timed", detail: "20 seconds/question. Chase a personal best.", secondsPerQuestion: 20 },
};

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

const arcadeCollectionFallbacks = [
  { title: "Time Travel", query: "time", theme: "time", countLabel: "18 challenges", image: "/arcade/art/time-travel.svg" },
  { title: "Sci-Fi", query: "space", theme: "space", countLabel: "24 challenges", image: "/arcade/art/sci-fi.svg" },
  { title: "Adventure", query: "adventure", theme: "adventure", countLabel: "22 challenges", image: "/arcade/art/adventure.svg" },
  { title: "Animation", query: "animation", theme: "animation", countLabel: "20 challenges", image: "/arcade/art/animation.svg" },
  { title: "Horror", query: "horror", theme: "horror", countLabel: "16 challenges", image: "/arcade/art/horror.svg" },
  { title: "Action", query: "action", theme: "hero", countLabel: "19 challenges", image: "/arcade/art/action.svg" },
  { title: "Zombie", query: "zombie", theme: "zombie", countLabel: "10 challenges", image: "/arcade/art/zombie.svg" },
  { title: "Apocalypse", query: "apocalypse", theme: "apocalypse", countLabel: "12 challenges", image: "/arcade/art/apocalypse.svg" },
  { title: "Alien", query: "alien", theme: "alien", countLabel: "14 challenges", image: "/arcade/art/alien.svg" },
  { title: "Tom Cruise", query: "tom cruise mission", theme: "cinema", countLabel: "15 packs", image: "/arcade/art/tom-cruise.svg" },
  { title: "Arnold Schwarzenegger", query: "arnold terminator action", theme: "hero", countLabel: "13 packs", image: "/arcade/art/arnold.svg" },
];

function challengeMatches(event: SeasonalChallengeEvent, keyword: string) {
  return `${event.slug} ${event.name} ${event.description} ${event.badge} ${event.banner || ""} ${event.seasonKey || ""}`.toLowerCase().includes(keyword);
}

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
  if (feed?.generationStatus === "queued") return "Getting ready";
  if (feed?.generationStatus === "generating") return "Building";
  if (feed?.generationStatus === "insufficient_source") return "Not ready yet";
  if (pollAttempt >= TRIVIA_PACK_MAX_POLLS) return "Try again soon";
  return "Temporarily unavailable";
}

function safeTriviaUnavailableCopy(feed: TriviaFeed | null, pollAttempt: number) {
  const notes = `${feed?.error || ""} ${feed?.notes || ""}`.toLowerCase();
  const providerName = ["open", "ai"].join("");
  const internalSignal = ["mo", "del"].join("");
  if (feed?.generationStatus === "insufficient_source" || notes.includes("not ready yet")) {
    return "Trivia for this title is not ready yet. We'll build it when more information is available.";
  }
  if (notes.includes("not configured") || notes.includes(providerName) || notes.includes("api key") || notes.includes(internalSignal)) {
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

const triviaDownloadSteps = [
  "Collecting movie knowledge...",
  "Writing questions...",
  "Preparing challenge...",
  "Almost ready...",
];

function triviaDownloadStep(pollAttempt: number) {
  if (pollAttempt < 2) return triviaDownloadSteps[0];
  if (pollAttempt < 6) return triviaDownloadSteps[1];
  if (pollAttempt < 10) return triviaDownloadSteps[2];
  return triviaDownloadSteps[3];
}

function triviaDownloadProgress(status: TriviaLoadStatus, pollAttempt: number) {
  if (status === "loading") return 18;
  return Math.min(92, 28 + pollAttempt * 4);
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

function challengeTypeLabel(type?: string) {
  if (type === "weekly") return "Weekly challenge";
  if (type === "monthly") return "Monthly challenge";
  if (type === "special_event") return "Challenge";
  return "Seasonal challenge";
}

function FeaturedChallengeCard({ event, onNavigate }: { event: SeasonalChallengeEvent; onNavigate: (path: string) => void }) {
  const questionCount = Number(event.playableQuestionCount || event.questionCount || 0);
  const status = event.windowEndAt
    ? `Ends ${formatChallengeWindowDate(event.windowEndAt)}`
    : event.dateStatus === "active"
    ? event.daysRemaining === 1 ? "Ends in 1 day" : `Ends in ${event.daysRemaining} days`
    : event.dateStatus === "upcoming"
      ? "Scheduled event"
      : "Completed event";
  const themeKey = String(event.banner || event.seasonKey || "challenge").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "challenge";
  const artworkTheme = challengeArtworkTheme(event);

  return (
    <button
      className={`arcade-featured-challenge is-${event.dateStatus} theme-${themeKey} artwork-${artworkTheme} ${event.isWeeklyFeatured ? "is-weekly-featured" : ""}`}
      onClick={() => onNavigate(`/challenges/${event.slug}`)}
      type="button"
    >
      <div className="arcade-challenge-artwork" data-art-theme={artworkTheme}>
        <img alt="" src={challengeDisplayArtworkUrl(event)} loading="lazy" decoding="async" />
      </div>
      <div>
        <h3>{event.name}</h3>
        <p>{event.description}</p>
        <div className="challenge-card-meta">
          <strong>{questionCount} Questions</strong>
          <span>{event.badge}</span>
          <span>Win up to {event.points} tickets</span>
          <span>{status}</span>
        </div>
      </div>
      <span className="arcade-card-chevron" aria-hidden="true">ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Âº</span>
    </button>
  );
}

function challengeArtworkTheme(event: SeasonalChallengeEvent) {
  const text = `${event.slug} ${event.name} ${event.banner || ""} ${event.seasonKey || ""} ${event.badge || ""}`.toLowerCase();
  if (text.includes("time")) return "time";
  if (text.includes("zombie") || text.includes("apocalypse")) return "apocalypse";
  if (text.includes("alien") || text.includes("space") || text.includes("world") || text.includes("sci-fi")) return "space";
  if (text.includes("anime") || text.includes("animation") || text.includes("animated") || text.includes("disney") || text.includes("pixar")) return "animation";
  if (text.includes("office") || text.includes("simpson") || text.includes("quote")) return "quote";
  if (text.includes("jurassic") || text.includes("dinosaur") || text.includes("raptor")) return "jurassic";
  if (text.includes("horror") || text.includes("slasher") || text.includes("halloween")) return "horror";
  if (text.includes("christmas") || text.includes("holiday")) return "holiday";
  if (text.includes("superhero") || text.includes("marvel") || text.includes("dc")) return "hero";
  if (text.includes("adventure") || text.includes("explorer") || text.includes("mission") || text.includes("bond")) return "adventure";
  return "cinema";
}

function arcadeArtUrl(theme: string) {
  const artMap: Record<string, string> = {
    time: "/arcade/art/time-travel.svg",
    space: "/arcade/art/sci-fi.svg",
    adventure: "/arcade/art/adventure.svg",
    animation: "/arcade/art/animation.svg",
    horror: "/arcade/art/horror.svg",
    apocalypse: "/arcade/art/apocalypse.svg",
    zombie: "/arcade/art/zombie.svg",
    alien: "/arcade/art/alien.svg",
    quote: "/arcade/art/quote.svg",
    jurassic: "/arcade/art/adventure.svg",
    holiday: "/arcade/art/animation.svg",
    hero: "/arcade/art/action.svg",
    cinema: "/arcade/art/cinema.svg",
  };
  return artMap[theme] || artMap.cinema;
}

function challengeDisplayArtworkUrl(event: SeasonalChallengeEvent) {
  if (event.heroImageUrl) return event.heroImageUrl;
  return arcadeArtUrl(challengeArtworkTheme(event));
}
function challengeArtworkUrl(event: SeasonalChallengeEvent) {
  if (event.heroImageUrl) return event.heroImageUrl;
  const text = `${event.slug} ${event.name} ${event.banner || ""} ${event.seasonKey || ""}`.toLowerCase();
  if (text.includes("time")) return "/api/og/title/movie/105?card=game";
  if (text.includes("adventure") || text.includes("mission")) return "/api/og/title/movie/85?card=game";
  if (text.includes("world") || text.includes("space") || text.includes("sci-fi") || text.includes("alien")) return "/api/og/title/movie/11?card=game";
  if (text.includes("jurassic") || text.includes("dinosaur")) return "/api/og/title/movie/329?card=game";
  if (text.includes("office") || text.includes("quote")) return "/api/og/title/tv/2316?card=game";
  if (text.includes("wizard") || text.includes("harry")) return "/api/og/title/movie/671?card=game";
  if (text.includes("simpson")) return "/api/og/title/tv/456?card=game";
  if (text.includes("disney") || text.includes("pixar") || text.includes("animation")) return "/api/og/title/movie/862?card=game";
  if (text.includes("superhero") || text.includes("marvel")) return "/api/og/title/movie/299536?card=game";
  if (text.includes("zombie") || text.includes("apocalypse")) return "/api/og/title/movie/19908?card=game";
  const banner = String(event.banner || event.seasonKey || event.name).toLowerCase();
  if (banner.includes("horror")) return "/api/og/title/movie/348?card=game";
  if (banner.includes("holiday")) return "/api/og/title/movie/1585?card=game";
  if (banner.includes("awards")) return "/api/og/title/movie/238?card=game";
  if (banner.includes("blockbuster")) return "/api/og/title/movie/329?card=game";
  return "/arcade/flim-arcade-hero.png";
}

function formatChallengeWindowDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "soon";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function weeklyFeaturedPack(events: SeasonalChallengeEvent[]) {
  const scheduled = events.find((event) => event.isWeeklyFeatured && event.dateStatus === "active" && Number(event.playableQuestionCount || event.questionCount || 0) >= 100);
  if (scheduled) return scheduled;
  const playableEvergreen = events
    .filter((event) => event.dateStatus === "active" && Number(event.playableQuestionCount || event.questionCount || 0) >= 100)
    .sort((a, b) => a.slug.localeCompare(b.slug));
  if (!playableEvergreen.length) return null;
  return playableEvergreen[0];
}

function ordinal(value?: number) {
  if (!value) return "Rank pending";
  const suffix = value % 100 >= 11 && value % 100 <= 13 ? "th" : value % 10 === 1 ? "st" : value % 10 === 2 ? "nd" : value % 10 === 3 ? "rd" : "th";
  return `${value}${suffix} place`;
}

function formatArcadeTime(ms?: number) {
  const totalMs = Number(ms || 0);
  if (!totalMs) return "Time pending";
  const totalSeconds = Math.round(totalMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes ? `${minutes}m ${seconds.toString().padStart(2, "0")}s` : `${seconds}s`;
}

function ScoreboardSheet({
  open,
  onClose,
  selectedSlug,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  selectedSlug: string;
  onSelect: (slug: string) => void;
}) {
  const [history, setHistory] = useState<SeasonalChallengeHistoryItem[]>([]);
  const [detail, setDetail] = useState<SeasonalChallengeDetail | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");

  useEffect(() => {
    if (!open) return undefined;
    let active = true;
    setStatus("loading");
    getSeasonalChallengeHistory()
      .then((items) => {
        if (!active) return;
        setHistory(items);
        setStatus("ready");
        if (!selectedSlug && items[0]?.challengeSlug) onSelect(items[0].challengeSlug);
      })
      .catch(() => {
        if (!active) return;
        setHistory([]);
        setStatus("error");
      });
    return () => {
      active = false;
    };
  }, [open, onSelect, selectedSlug]);

  useEffect(() => {
    if (!open || !selectedSlug) {
      setDetail(null);
      return undefined;
    }
    let active = true;
    getSeasonalChallengeDetail(selectedSlug)
      .then((result) => {
        if (active) setDetail(result);
      })
      .catch(() => {
        if (active) setDetail(null);
      });
    return () => {
      active = false;
    };
  }, [open, selectedSlug]);

  if (!open) return null;

  return (
    <div className="arcade-scoreboard-overlay" role="dialog" aria-modal="true" aria-label="Arcade scoreboard">
      <button className="arcade-scoreboard-backdrop" aria-label="Close scoreboard" onClick={onClose} type="button" />
      <section className="arcade-scoreboard-sheet">
        <div className="arcade-scoreboard-header">
          <div>
            <span>Arcade standings</span>
            <h2>Scoreboard</h2>
          </div>
          <button className="secondary-button compact" onClick={onClose} type="button">Close</button>
        </div>

        {status === "loading" ? <p className="empty-state">Loading your results...</p> : null}
        {status === "error" ? <p className="empty-state">Sign in to see your challenge results.</p> : null}
        {status === "ready" && history.length === 0 ? <p className="empty-state">No completed challenge results yet.</p> : null}

        {history.length > 0 ? (
          <div className="arcade-scoreboard-layout">
            <div className="arcade-scoreboard-results">
              {history.map((item) => (
                <button
                  className={item.challengeSlug === selectedSlug ? "is-selected" : ""}
                  key={item.id}
                  onClick={() => onSelect(item.challengeSlug)}
                  type="button"
                >
                  <strong>{item.challengeName}</strong>
                  <span>{item.correctCount}/{item.totalCount} - {ordinal(item.rank)}</span>
                </button>
              ))}
            </div>

            <div className="arcade-leaderboard-panel">
              <div className="arcade-leaderboard-heading">
                <span>Top 10</span>
                <h3>{detail?.event.name || history.find((item) => item.challengeSlug === selectedSlug)?.challengeName || "Challenge"}</h3>
              </div>
              {detail?.standings.topScores.length ? (
                <ol className="arcade-leaderboard-list">
                  {detail.standings.topScores.slice(0, 10).map((score) => (
                    <li key={score.id}>
                      <span>#{score.rank || "-"}</span>
                      <strong>{score.displayName || score.handle || "Flim player"}</strong>
                      <em>{score.correctCount}/{score.totalCount}</em>
                      <small>{formatArcadeTime(score.totalTimeMs)} - streak {score.longestCorrectStreak || 0}</small>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="empty-state">No leaderboard scores yet.</p>
              )}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function GlobalTriviaGames({ onNavigate }: { onNavigate: (path: string) => void }) {
  const [featuredChallenges, setFeaturedChallenges] = useState<SeasonalChallengeEvent[]>([]);
  const [arcadeSearchQuery, setArcadeSearchQuery] = useState("");
  const [scoreboardOpen, setScoreboardOpen] = useState(false);
  const [selectedScoreboardSlug, setSelectedScoreboardSlug] = useState("");
  const [weeklyDetail, setWeeklyDetail] = useState<SeasonalChallengeDetail | null>(null);
  const [ticketFeed, setTicketFeed] = useState<TicketFeed | null>(null);

  useEffect(() => {
    let mounted = true;
    getSeasonalChallenges()
      .then((feed) => {
        if (!mounted) return;
        const visible = feed.sections.active.filter((event) => event.dateStatus === "active" && Number(event.playableQuestionCount || 0) > 0);
        const unique = Array.from(new Map(visible.map((event) => [event.id, event])).values());
        setFeaturedChallenges(unique);
      })
      .catch(() => {
        if (mounted) setFeaturedChallenges([]);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    getTicketFeed(4)
      .then((feed) => {
        if (mounted) setTicketFeed(feed);
      })
      .catch(() => {
        if (mounted) setTicketFeed(null);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const featuredWeeklyChallenge = weeklyFeaturedPack(featuredChallenges);
  useEffect(() => {
    if (!featuredWeeklyChallenge?.slug) {
      setWeeklyDetail(null);
      return undefined;
    }
    let mounted = true;
    getSeasonalChallengeDetail(featuredWeeklyChallenge.slug)
      .then((detail) => {
        if (mounted) setWeeklyDetail(detail);
      })
      .catch(() => {
        if (mounted) setWeeklyDetail(null);
      });
    return () => {
      mounted = false;
    };
  }, [featuredWeeklyChallenge?.slug]);

  const normalizedArcadeSearch = arcadeSearchQuery.trim().toLowerCase();
  const filteredChallenges = normalizedArcadeSearch
    ? featuredChallenges.filter((event) => `${event.name} ${event.description} ${event.badge} ${event.banner || ""}`.toLowerCase().includes(normalizedArcadeSearch))
    : featuredChallenges;
  const quoteChallenge = featuredChallenges.find((event) => challengeMatches(event, "quote"));
  const disneyChallenge = featuredChallenges.find((event) => challengeMatches(event, "disney") || challengeMatches(event, "animation"));
  const posterChallenge = featuredChallenges.find((event) => challengeMatches(event, "poster"));
  const groupChallenge = featuredWeeklyChallenge || featuredChallenges.find((event) => Number(event.playableQuestionCount || 0) >= 50) || null;
  const visibleChallengePool = filteredChallenges
    .filter((event) => Number(event.playableQuestionCount || event.questionCount || 0) >= 50)
    .sort((left, right) => {
      const priority = ["disney", "simpson", "quote", "time", "adventure", "world", "space"];
      const leftText = `${left.slug} ${left.name} ${left.banner || ""} ${left.seasonKey || ""}`.toLowerCase();
      const rightText = `${right.slug} ${right.name} ${right.banner || ""} ${right.seasonKey || ""}`.toLowerCase();
      const leftPriority = priority.findIndex((keyword) => leftText.includes(keyword));
      const rightPriority = priority.findIndex((keyword) => rightText.includes(keyword));
      const normalizedLeft = leftPriority < 0 ? 999 : leftPriority;
      const normalizedRight = rightPriority < 0 ? 999 : rightPriority;
      if (normalizedLeft !== normalizedRight) return normalizedLeft - normalizedRight;
      return left.name.localeCompare(right.name);
    });
  const modeTiles = [
    {
      title: "Movie Trivia",
      subtitle: "Test your knowledge",
      icon: "film",
      iconAsset: "/arcade/icons/movie-trivia.png",
      action: () => onNavigate("/games/title/movie/105"),
    },
    {
      title: "Quote Challenge",
      subtitle: "Famous last words",
      icon: "quote",
      iconAsset: "/arcade/icons/quote-challenge.png",
      action: () => onNavigate(`/challenges/${quoteChallenge?.slug || "movie-quote-challenge"}`),
    },
    {
      title: "Poster Guess",
      subtitle: "Guess the movie",
      icon: "poster",
      iconAsset: "/arcade/icons/poster-guess.png",
      action: () => onNavigate(`/challenges/${posterChallenge?.slug || disneyChallenge?.slug || featuredWeeklyChallenge?.slug || "ultimate-disney-animation-challenge"}`),
    },
    groupChallenge ? {
      title: "Group Play",
      subtitle: "Play with friends",
      icon: "group",
      iconAsset: "/arcade/icons/group-play.png",
      action: () => onNavigate(`/challenges/${groupChallenge.slug}`),
    } : null,
    {
      title: "Leaderboards",
      subtitle: "See who's on top",
      icon: "trophy",
      iconAsset: "/arcade/icons/leaderboards.png",
      action: () => setScoreboardOpen(true),
    },
    {
      title: "Rewards",
      subtitle: "Tickets and badges",
      icon: "ticket",
      iconAsset: "/arcade/icons/rewards.png",
      action: () => setScoreboardOpen(true),
    },
  ].filter(Boolean) as Array<{ title: string; subtitle: string; icon: string; iconAsset: string; action: () => void }>;
  const collectionCards = arcadeCollectionFallbacks
    .map((collection) => {
      const matched = featuredChallenges.find((event) => challengeMatches(event, collection.query));
      return {
        ...collection,
        event: matched,
        count: matched ? Number(matched.playableQuestionCount || matched.questionCount || 0) : 0,
      };
    })
    .filter((collection) => !normalizedArcadeSearch || collection.title.toLowerCase().includes(normalizedArcadeSearch) || collection.query.includes(normalizedArcadeSearch) || Boolean(collection.event))
    .slice(0, 11);
  const topScores = weeklyDetail?.standings.topScores.slice(0, 3) || [];
  const progressBadgeCount = weeklyDetail?.standings.personalBest ? 1 : 0;

  return (
    <section className="route-page trivia-games-page arcade-preview-page">
      <header className="arcade-preview-hero">
        <img aria-hidden="true" className="arcade-hero-image" src="/arcade/flim-arcade-hero.png" />
        <div className="arcade-hero-copy">
          <h1>Flim Arcade</h1>
          <p>Movie trivia, group challenges, and game-night experiences.</p>
          <form className="arcade-search-form" onSubmit={(event) => event.preventDefault()}>
            <label className="sr-only" htmlFor="arcade-search">Search Flim Arcade</label>
            <input
              id="arcade-search"
              onChange={(event) => setArcadeSearchQuery(event.target.value)}
              placeholder="Search Flim Arcade"
              type="search"
              value={arcadeSearchQuery}
            />
            {arcadeSearchQuery ? (
              <button aria-label="Clear Arcade search" className="secondary-button compact" onClick={() => setArcadeSearchQuery("")} type="button">
                Clear
              </button>
            ) : null}
          </form>
        </div>
      </header>

      <div className="arcade-main-content">
        {featuredWeeklyChallenge ? (
          <section className="title-games-section arcade-live-section arcade-weekly-section">
            <div className="actor-section-heading">
              <h2>This Week&apos;s Challenge</h2>
            </div>
            <FeaturedChallengeCard event={featuredWeeklyChallenge} onNavigate={onNavigate} />
          </section>
        ) : null}

        {modeTiles.length > 0 ? (
          <section className="title-games-section arcade-play-something-section">
            <div className="actor-section-heading">
              <h2>Play something</h2>
            </div>
            <div className="arcade-mode-grid">
              {modeTiles.map((mode) => (
                <button className="arcade-mode-tile" key={mode.title} onClick={mode.action} type="button">
                  <span className={`arcade-mode-icon is-${mode.icon}`} aria-hidden="true">
                    <img alt="" src={mode.iconAsset} loading="lazy" decoding="async" />
                  </span>
                  <strong>{mode.title}</strong>
                  <small>{mode.subtitle}</small>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {collectionCards.length > 0 ? (
          <section className="title-games-section arcade-collections-section">
            <div className="actor-section-heading">
              <h2>Explore collections</h2>
            </div>
            <div className="arcade-collection-row">
              {collectionCards.map((collection) => (
                <button
                  className={`arcade-collection-card artwork-${collection.theme}`}
                  key={collection.title}
                  onClick={() => collection.event ? onNavigate(`/challenges/${collection.event.slug}`) : setArcadeSearchQuery(collection.query)}
                  type="button"
                >
                  <img alt="" src={collection.image} loading="lazy" decoding="async" />
                  <span>{collection.title}</span>
                  <small>{collection.countLabel || `${collection.count} questions`}</small>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {(topScores.length > 0 || ticketFeed) ? (
          <section className="arcade-dashboard-row" aria-label="Flim Arcade standings and progress">
            {topScores.length > 0 ? (
              <div className="title-games-section arcade-community-panel">
                <div className="actor-section-heading">
                  <h2>Community</h2>
                </div>
                <ol className="arcade-community-list">
                  {topScores.map((score) => (
                    <li key={score.id}>
                      <span>{score.rank || "-"}</span>
                      <strong>{score.displayName || score.handle || "Flim player"}</strong>
                      <em>{score.score.toLocaleString()}</em>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}
            {ticketFeed ? (
              <div className="title-games-section arcade-progress-panel">
                <div className="actor-section-heading">
                  <h2>Your progress</h2>
                </div>
                <div className="arcade-progress-grid">
                  <button onClick={() => setScoreboardOpen(true)} type="button">
                    <strong>{ticketFeed.wallet.ticketBalance.toLocaleString()}</strong>
                    <span>Tickets</span>
                  </button>
                  <button onClick={() => setScoreboardOpen(true)} type="button">
                    <strong>{progressBadgeCount}</strong>
                    <span>Badges</span>
                  </button>
                  <button onClick={() => setScoreboardOpen(true)} type="button">
                    <strong>Rex</strong>
                    <span>Current Character</span>
                  </button>
                  <button onClick={() => setScoreboardOpen(true)} type="button">
                    <strong>{weeklyDetail?.standings.personalBest?.rank || "-"}</strong>
                    <span>Rank</span>
                  </button>
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        {normalizedArcadeSearch && !visibleChallengePool.length && !collectionCards.length ? (
          <section className="title-games-section">
            <p className="empty-state">No Arcade matches yet. Try a movie title, challenge theme, or playlist idea.</p>
          </section>
        ) : null}

        <FriendChallengeHistory onNavigate={onNavigate} />
      </div>
      <ScoreboardSheet
        open={scoreboardOpen}
        onClose={() => setScoreboardOpen(false)}
        selectedSlug={selectedScoreboardSlug}
        onSelect={setSelectedScoreboardSlug}
      />
    </section>
  );
}

function ClassicTriviaPanel({ mediaType, tmdbId, title, artworkUrl, gameTitle = "Classic Trivia", sectionLabel = "Title-specific pack" }: { mediaType: MediaType; tmdbId: number; title: string; artworkUrl?: string; gameTitle?: string; sectionLabel?: string }) {
  const [feed, setFeed] = useState<TriviaFeed | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<TriviaLoadStatus>("loading");
  const [pollAttempt, setPollAttempt] = useState(0);
  const [notifyStatus, setNotifyStatus] = useState("");
  const activeTriviaRequest = useRef(0);
  const [completed, setCompleted] = useState(false);
  const [mode, setMode] = useState<TriviaRoundMode>("casual");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [skippedQuestionIds, setSkippedQuestionIds] = useState<Set<string>>(() => new Set());
  const [reviewingSkipped, setReviewingSkipped] = useState(false);
  const [showSubmitChoice, setShowSubmitChoice] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);
  const [playState, setPlayState] = useState<TriviaPlayState>("setup");
  const [startCountdown, setStartCountdown] = useState(3);
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
    setPlayState("setup");
    setStartCountdown(3);
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
      setNotifyStatus("");
    }
    setStatus(options.poll ? "building" : "loading");
    getTitleTrivia({ mediaType, tmdbId, questionCount: 25 })
      .then((result) => {
        if (activeTriviaRequest.current !== requestId) return;
        setFeed(result);
        if (result.generationStatus === "ready" && result.questions.length > 0) {
          setStatus("ready");
          return;
        }
        if (result.generationStatus === "insufficient_source" && result.questions.length === 0) {
          setStatus("error");
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
    if (playState !== "playing") {
      setSecondsRemaining(null);
      return;
    }
    const seconds = triviaModeConfig[mode].secondsPerQuestion;
    setSecondsRemaining(seconds || null);
  }, [completed, currentIndex, mode, playState, reviewingSkipped, showSubmitChoice]);

  useEffect(() => {
    if (!secondsRemaining || completed || showSubmitChoice || status !== "ready" || playState !== "playing") return undefined;
    const timer = window.setTimeout(() => {
      if (secondsRemaining <= 1) {
        skipCurrentQuestion();
        return;
      }
      setSecondsRemaining((current) => (current ? current - 1 : current));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [completed, mode, playState, secondsRemaining, showSubmitChoice, status]);

  useEffect(() => {
    if (playState !== "countdown") return undefined;
    if (startCountdown <= 0) {
      setPlayState("playing");
      setStartCountdown(3);
      return undefined;
    }
    const timer = window.setTimeout(() => {
      setStartCountdown((current) => current - 1);
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [playState, startCountdown]);

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

  async function handleNotifyWhenReady() {
    setNotifyStatus("Saving alert...");
    try {
      const result = await notifyTitleTriviaReady({ mediaType, tmdbId, title });
      setNotifyStatus(result.status === "ready" ? "Trivia pack is ready. Press Play Now." : "We'll let you know when it's ready.");
    } catch (error) {
      setNotifyStatus(error instanceof Error && error.message.toLowerCase().includes("sign") ? "Sign in to get a ready alert." : "Could not save alert right now.");
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
    if (!currentQuestion || completed || playState !== "playing") return;
    setAnswers((current) => ({ ...current, [currentQuestion.id]: option }));
    setSkippedQuestionIds((current) => {
      const next = new Set(current);
      next.delete(currentQuestion.id);
      return next;
    });
  }

  function skipCurrentQuestion() {
    if (!currentQuestion || completed || playState !== "playing") return;
    setSkippedQuestionIds((current) => new Set(current).add(currentQuestion.id));
    moveToNextQuestion();
  }

  function startTriviaRound() {
    setAnswers({});
    setCompleted(false);
    setCurrentIndex(0);
    setSkippedQuestionIds(new Set());
    setReviewingSkipped(false);
    setShowSubmitChoice(false);
    setStartCountdown(3);
    setPlayState("countdown");
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
    const downloadProgress = triviaDownloadProgress(status, pollAttempt);
    return (
      <section className="title-games-section trivia-building-pack">
        <span className="title-game-kicker">Download Trivia Pack</span>
        <h2>Downloading {title} Trivia Pack</h2>
        <p>{triviaDownloadStep(pollAttempt)}</p>
        <div className="trivia-pack-download-track" aria-label={`Trivia pack ${downloadProgress}% downloaded`}>
          <span style={{ width: `${downloadProgress}%` }} />
        </div>
        <div className="trivia-building-detail">
          <span>Status</span>
          <strong>{feed?.generationStatus === "queued" ? "Getting ready" : feed?.generationStatus === "generating" ? "Downloading" : "Preparing"}</strong>
        </div>
        <div className="trivia-building-detail">
          <span>Expected</span>
          <strong>{pollAttempt > 12 ? "1-5 minutes" : "Usually under 1 minute"}</strong>
        </div>
        <p className="helper-text">This usually takes 1-5 minutes. We'll let you know when it's ready.</p>
        {notifyStatus ? <p className="success-message">{notifyStatus}</p> : null}
        <div className="share-inline-row">
          <button className="secondary-button compact" onClick={handleNotifyWhenReady} type="button">
            Notify Me
          </button>
          <button className="secondary-button compact" onClick={() => loadTriviaPack({ reset: true })} type="button">
            Try Again
          </button>
        </div>
      </section>
    );
  }

  if (status === "error" || questions.length === 0) {
    return (
      <section className="title-games-section trivia-building-pack">
        <span className="title-game-kicker">Trivia pack not ready yet</span>
        <h2>Trivia Pack Temporarily Unavailable</h2>
        <p>{safeTriviaUnavailableCopy(feed, pollAttempt)}</p>
        <div className="trivia-building-detail">
          <span>Status</span>
          <strong>{safeTriviaStatusCopy(feed, pollAttempt)}</strong>
        </div>
        {notifyStatus ? <p className="success-message">{notifyStatus}</p> : null}
        <div className="share-inline-row">
          <button className="secondary-button compact" onClick={handleNotifyWhenReady} type="button">
            Notify Me
          </button>
          <button className="secondary-button compact" onClick={() => loadTriviaPack({ reset: true })} type="button">
            Retry
          </button>
        </div>
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
      <div className="trivia-rules-strip" aria-label="Trivia scoring rules">
        <span><strong>100</strong>per correct answer</span>
        <span><strong>+25</strong>timed bonus when available</span>
        <span><strong>+500</strong>perfect round</span>
        <span><strong>+250</strong>challenge completion</span>
      </div>
      {feed?.progress && feed.progress.triviaCompleted > 0 ? (
        <div className="trivia-completed-history">
          <span>Completed</span>
          <strong>{feed.progress.triviaCompleted}/{Math.max(feed.progress.triviaTotal, questions.length)} questions saved</strong>
          <small>Play again or challenge friends from your result screen.</small>
        </div>
      ) : null}
      {!completed && playState !== "playing" ? (
        <div className="trivia-start-card">
          {playState === "countdown" ? (
            <>
              <span>Starting in</span>
              <strong>{startCountdown > 0 ? startCountdown : "Go"}</strong>
            </>
          ) : (
            <>
              <span>{questions.length} questions ready</span>
              <h3>Start when you're ready.</h3>
              <p>{mode === "timed" ? "The 20-second clock starts after the countdown." : "Casual mode has no timer."}</p>
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
              <button className="primary-button" onClick={startTriviaRound} type="button">
                Start Trivia
              </button>
            </>
          )}
        </div>
      ) : null}
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
      {!completed && playState === "playing" ? (
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
      {!completed && playState === "playing" ? (
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
        <strong>Flim Arcade</strong>
        <button className="title-games-close" onClick={closePage} type="button" aria-label="Close Flim Arcade">
          X
        </button>
      </header>

      {status === "loading" ? <p className="empty-state">Loading title games...</p> : null}
      {status === "error" ? (
        <div className="media-extension-card">
          <h3>Flim Arcade is taking longer than expected.</h3>
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
