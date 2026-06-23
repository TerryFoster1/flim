import { useEffect, useMemo, useState } from "react";

import { getMovieDetails } from "../services/tmdbService";
import type { AppRoute, MovieDetails } from "../types";

type MovieRevealProps = {
  onNavigate: (route: AppRoute) => void;
};

type RevealRound = {
  tmdbId: number;
  title: string;
  year: number;
  genre: string;
  difficulty: "Easy" | "Medium" | "Hard";
  decoys: string[];
};

type GameState = "start" | "loading" | "playing" | "result";

const TILE_COUNT = 25;
const START_SCORE = 1000;
const REVEAL_PENALTY = 50;
const WRONG_GUESS_PENALTY = 100;

const REVEAL_ROUNDS: RevealRound[] = [
  { tmdbId: 105, title: "Back to the Future", year: 1985, genre: "Time Travel", difficulty: "Easy", decoys: ["Ghostbusters", "The Goonies", "Bill & Ted's Excellent Adventure"] },
  { tmdbId: 329, title: "Jurassic Park", year: 1993, genre: "Adventure", difficulty: "Easy", decoys: ["King Kong", "The Lost World: Jurassic Park", "Independence Day"] },
  { tmdbId: 664, title: "Twister", year: 1996, genre: "Disaster", difficulty: "Medium", decoys: ["Dante's Peak", "Volcano", "Deep Impact"] },
  { tmdbId: 348, title: "Alien", year: 1979, genre: "Sci-Fi Horror", difficulty: "Medium", decoys: ["The Thing", "Predator", "Event Horizon"] },
  { tmdbId: 578, title: "Jaws", year: 1975, genre: "Creature Feature", difficulty: "Easy", decoys: ["Deep Blue Sea", "The Meg", "Piranha"] },
  { tmdbId: 218, title: "The Terminator", year: 1984, genre: "Sci-Fi Action", difficulty: "Medium", decoys: ["RoboCop", "Total Recall", "Predator"] },
  { tmdbId: 85, title: "Raiders of the Lost Ark", year: 1981, genre: "Adventure", difficulty: "Medium", decoys: ["The Mummy", "National Treasure", "Romancing the Stone"] },
  { tmdbId: 862, title: "Toy Story", year: 1995, genre: "Animation", difficulty: "Easy", decoys: ["Monsters, Inc.", "Finding Nemo", "Shrek"] },
  { tmdbId: 603, title: "The Matrix", year: 1999, genre: "Sci-Fi", difficulty: "Medium", decoys: ["Dark City", "Minority Report", "Inception"] },
  { tmdbId: 4232, title: "Scream", year: 1996, genre: "Horror", difficulty: "Hard", decoys: ["I Know What You Did Last Summer", "Halloween", "Urban Legend"] },
];

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function pickRound(previousTmdbId?: number): RevealRound {
  const eligibleRounds = REVEAL_ROUNDS.length > 1 ? REVEAL_ROUNDS.filter((round) => round.tmdbId !== previousTmdbId) : REVEAL_ROUNDS;
  return eligibleRounds[Math.floor(Math.random() * eligibleRounds.length)] ?? REVEAL_ROUNDS[0];
}

function calculateScore(revealCount: number, wrongGuesses: number): number {
  return Math.max(100, START_SCORE - revealCount * REVEAL_PENALTY - wrongGuesses * WRONG_GUESS_PENALTY);
}

function fallbackImage(round: RevealRound): string {
  return `/api/og/title/movie/${round.tmdbId}?card=game`;
}

function getArtwork(round: RevealRound, details: MovieDetails | null): string {
  return details?.backdropUrl || details?.posterUrl || fallbackImage(round);
}

export default function MovieReveal({ onNavigate }: MovieRevealProps) {
  const [gameState, setGameState] = useState<GameState>("start");
  const [round, setRound] = useState<RevealRound>(() => pickRound());
  const [details, setDetails] = useState<MovieDetails | null>(null);
  const [revealedTiles, setRevealedTiles] = useState<Set<number>>(() => new Set());
  const [wrongGuesses, setWrongGuesses] = useState(0);
  const [feedback, setFeedback] = useState("");

  const options = useMemo(() => shuffle([round.title, ...round.decoys.slice(0, 3)]), [round]);
  const artwork = getArtwork(round, details);
  const revealCount = revealedTiles.size;
  const coveredCount = TILE_COUNT - revealCount;
  const score = calculateScore(revealCount, wrongGuesses);
  const ticketsEarned = Math.max(10, Math.round(score / 20));

  useEffect(() => {
    if (gameState !== "loading" && gameState !== "playing" && gameState !== "result") return;

    let cancelled = false;
    setDetails(null);
    getMovieDetails(round.tmdbId, { timeoutMs: 12000 })
      .then((movieDetails) => {
        if (!cancelled) setDetails(movieDetails);
      })
      .catch(() => {
        if (!cancelled) setDetails(null);
      })
      .finally(() => {
        if (!cancelled && gameState === "loading") setGameState("playing");
      });

    return () => {
      cancelled = true;
    };
  }, [gameState, round.tmdbId]);

  function startGame(nextRound = round) {
    setRound(nextRound);
    setRevealedTiles(new Set());
    setWrongGuesses(0);
    setFeedback("");
    setGameState("loading");
  }

  function revealTile() {
    if (gameState !== "playing" || revealedTiles.size >= TILE_COUNT) return;
    const hiddenTiles = Array.from({ length: TILE_COUNT }, (_, index) => index).filter((tileIndex) => !revealedTiles.has(tileIndex));
    const tileToReveal = hiddenTiles[Math.floor(Math.random() * hiddenTiles.length)];
    setRevealedTiles((current) => {
      const next = new Set(current);
      next.add(tileToReveal);
      return next;
    });
    setFeedback("");
  }

  function handleGuess(option: string) {
    if (gameState !== "playing") return;
    if (option === round.title) {
      setFeedback("You got it.");
      setRevealedTiles(new Set(Array.from({ length: TILE_COUNT }, (_, index) => index)));
      setGameState("result");
      return;
    }
    setWrongGuesses((count) => count + 1);
    setFeedback("Not quite. Reveal another tile or try again.");
  }

  function playAgain() {
    startGame(pickRound(round.tmdbId));
  }

  async function shareResult() {
    const shareText = `I scored ${score} on Movie Reveal with ${round.title}. Can you guess it faster?`;
    if (navigator.share) {
      await navigator.share({ title: "Flim Movie Reveal", text: shareText, url: window.location.href });
      return;
    }
    await navigator.clipboard?.writeText(`${shareText} ${window.location.href}`);
    setFeedback("Share link copied.");
  }

  return (
    <main className="movie-reveal-page">
      <button className="movie-reveal-back" type="button" onClick={() => onNavigate("/games")}>
        <span aria-hidden="true">Back</span>
        Flim Arcade
      </button>

      {gameState === "start" ? (
        <section className="movie-reveal-start">
          <div className="movie-reveal-start-copy">
            <p>Poster Guess</p>
            <h1>Movie Reveal</h1>
            <span>Reveal the poster. Guess the movie.</span>
          </div>
          <div className="movie-reveal-start-card">
            <div className="movie-reveal-start-art">
              <span aria-hidden="true">?</span>
            </div>
            <button className="movie-reveal-primary" type="button" onClick={() => startGame()}>
              Start Game
            </button>
          </div>
        </section>
      ) : null}

      {gameState === "loading" ? (
        <section className="movie-reveal-loading" aria-live="polite">
          <span aria-hidden="true">?</span>
          <h1>Loading Movie Reveal</h1>
          <p>Choosing a poster and hiding the clues...</p>
        </section>
      ) : null}

      {gameState === "playing" || gameState === "result" ? (
        <section className="movie-reveal-stage">
          <header className="movie-reveal-hud">
            <div>
              <p>Movie Reveal</p>
              <h1>{gameState === "result" ? round.title : "Guess the movie"}</h1>
            </div>
            <div className="movie-reveal-score">
              <span>{score}</span>
              <small>score</small>
            </div>
          </header>

          <div className="movie-reveal-meta">
            <span>{round.genre}</span>
            <span>{round.year}</span>
            <span>{round.difficulty}</span>
            <span>{coveredCount} tiles hidden</span>
          </div>

          <div className="movie-reveal-board" aria-label="Covered movie artwork">
            <img className="movie-reveal-image" src={artwork} alt={gameState === "result" ? `${round.title} artwork` : ""} draggable="false" />
            <div className="movie-reveal-grid" aria-hidden={gameState === "result"}>
              {Array.from({ length: TILE_COUNT }, (_, index) => (
                <button
                  key={index}
                  className={`movie-reveal-tile${revealedTiles.has(index) ? " is-revealed" : ""}`}
                  type="button"
                  disabled={revealedTiles.has(index) || gameState === "result"}
                  onClick={revealTile}
                  aria-label="Reveal a tile"
                />
              ))}
            </div>
          </div>

          {gameState === "playing" ? (
            <>
              <div className="movie-reveal-controls">
                <button className="movie-reveal-secondary" type="button" onClick={revealTile}>
                  <span aria-hidden="true">?</span>
                  Reveal Tile
                </button>
                <span>-{REVEAL_PENALTY} points per reveal</span>
              </div>

              <div className="movie-reveal-options" aria-label="Guess options">
                {options.map((option) => (
                  <button key={option} type="button" onClick={() => handleGuess(option)}>
                    {option}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="movie-reveal-result">
              <span aria-hidden="true" className="movie-reveal-success-mark">OK</span>
              <h2>{score >= 800 ? "Big screen instincts." : "Mystery solved."}</h2>
              <p>
                You earned {ticketsEarned} tickets and guessed {round.title} with {revealCount} tiles revealed.
              </p>
              <div className="movie-reveal-result-actions">
                <button type="button" onClick={playAgain}>
                  <span aria-hidden="true">Again</span>
                  Play Again
                </button>
                <button type="button" onClick={() => void shareResult()}>
                  <span aria-hidden="true">Share</span>
                  Share Result
                </button>
              </div>
            </div>
          )}

          {feedback ? <p className="movie-reveal-feedback">{feedback}</p> : null}
        </section>
      ) : null}
    </main>
  );
}
