import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { BrandMark } from "../components/BrandMark";
import { isTriviaGamesEnabled } from "../featureFlags";
import { getMovieDetails, getTvDetails } from "../services/tmdbService";
import type { MediaType, MovieDetails } from "../types";

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
    </section>
  );
}

function TitleGamesPage({ mediaType = "movie", tmdbId = 0, returnTo, onNavigate }: TriviaGamesProps) {
  const [title, setTitle] = useState<MovieDetails | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const enabled = isTriviaGamesEnabled();
  const targetPath = Number.isFinite(tmdbId) && tmdbId > 0 ? gameTargetPath(mediaType, tmdbId) : "/playlists";
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
            </div>
          </section>

          {!enabled ? (
            <section className="title-games-coming-soon">
              <h2>Trivia & Games are coming soon for this title.</h2>
              <p>Game cards, scores, and recommended challenges are feature-gated until launch.</p>
            </section>
          ) : (
            <>
              <section className="title-games-section">
                <div className="actor-section-heading">
                  <h2>Available Games & Challenges</h2>
                  <span>{titleGameCards.length}</span>
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
          )}
        </>
      ) : null}
    </section>
  );
}

export function TriviaGames(props: TriviaGamesProps) {
  if (props.tmdbId && props.mediaType) return <TitleGamesPage {...props} />;
  return <GlobalTriviaGames onNavigate={props.onNavigate} />;
}
