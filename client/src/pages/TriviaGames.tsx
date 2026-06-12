import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { BrandMark } from "../components/BrandMark";
import { ShareAssetButton } from "../components/ShareAssetButton";
import { isTriviaGamesEnabled } from "../featureFlags";
import { createFriendChallenge, getFriendChallengeHistory } from "../services/friendChallengeService";
import { getMovieDetails, getTvDetails } from "../services/tmdbService";
import { getTitleTrivia } from "../services/triviaService";
import type { FriendChallengeHistoryAttempt, FriendTriviaChallenge, MediaType, MovieDetails, TriviaFeed, TriviaQuestion } from "../types";

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

const futureSurfaces = [
  "Title trivia",
  "Playlist trivia",
  "Genre challenges",
  "Director's Cut challenges",
  "Seasonal challenges",
  "Sponsored challenges",
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

function GlobalTriviaGames({ onNavigate }: { onNavigate: (path: string) => void }) {
  return (
    <section className="route-page trivia-games-page">
      <div className="detail-copy">
        <h1>Trivia & Games</h1>
        <p>
          Movie trivia, title challenges, and playlist games will live here once the feature flag is enabled.
        </p>
      </div>

      <div className="media-extension-card">
        <h3>Coming Soon</h3>
        <p>
          This page is reserved for Flim's future game and challenge experiences. Nothing here is promoted on the
          homepage, and no public challenges are launched by this route.
        </p>
        <div className="challenge-requirement-row" aria-label="Prepared game types">
          {futureSurfaces.map((surface) => (
            <span key={surface}>{surface}</span>
          ))}
        </div>
        <button className="secondary-button" onClick={() => onNavigate("/playlists")} type="button">
          Back to Playlists
        </button>
      </div>
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
  const questions = feed?.questions || [];
  const score = useMemo(() => scoreTrivia(questions, answers), [questions, answers]);
  const allAnswered = questions.length > 0 && questions.every((question) => answers[question.id]);

  useEffect(() => {
    let mounted = true;
    setStatus("loading");
    setFeed(null);
    setAnswers({});
    setCompleted(false);
    setChallengeUrl("");
    setChallengeToken("");
    setChallengeStatus("");
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
        <p className="empty-state">Trivia is still being prepared for this title. Try again soon.</p>
      </section>
    );
  }

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
        <button className="primary-button" disabled={!allAnswered} onClick={() => setCompleted(true)} type="button">
          Finish Trivia
        </button>
      ) : (
        <div className="friend-challenge-card">
          <span>Friend Challenge</span>
          <h3>Beat my score of {score.score}</h3>
          <p>Share this exact question set. Friends will play the same questions in the same order.</p>
          <div className="share-inline-row">
            <button className="primary-button compact" onClick={handleCreateChallenge} type="button">
              {challengeUrl ? "Challenge Created" : "Create Challenge"}
            </button>
            {challengeUrl ? <button className="secondary-button compact" onClick={shareChallenge} type="button">Share</button> : null}
            {challengeUrl ? <button className="secondary-button compact" onClick={copyChallengeLink} type="button">Copy Link</button> : null}
            {challengeToken ? (
              <ShareAssetButton
                className="secondary-button compact"
                label="Share Card"
                title={`${title} Trivia Challenge`}
                text={`Share your ${title} trivia score challenge.`}
                url={`/challenge/${challengeToken}`}
                cardUrl={`/api/og/challenge/${challengeToken}`}
                downloadName={`${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "trivia"}-challenge-card.png`}
              />
            ) : null}
          </div>
          {challengeStatus ? <small>{challengeStatus}</small> : null}
        </div>
      )}
    </section>
  );
}

function TitleGamesPage({ mediaType = "movie", tmdbId = 0, returnTo, onNavigate }: TriviaGamesProps) {
  const [title, setTitle] = useState<MovieDetails | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const enabled = isTriviaGamesEnabled();
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
              <span>{enabled ? titleGameCards.length : "More modes soon"}</span>
            </div>
            <div className="title-game-grid">
              {titleGameCards.map((game) => <GameCard key={game.id} game={game} disabled />)}
            </div>
          </section>

          {enabled ? (
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
          ) : null}
        </>
      ) : null}
    </section>
  );
}

export function TriviaGames(props: TriviaGamesProps) {
  if (props.tmdbId && props.mediaType) return <TitleGamesPage {...props} />;
  return <GlobalTriviaGames onNavigate={props.onNavigate} />;
}
