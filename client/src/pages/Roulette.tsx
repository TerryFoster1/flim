import { useMemo, useState } from "react";
import { BlindSpinButton } from "../components/BlindSpinButton";
import { GenreChip } from "../components/GenreChip";
import { PosterCard } from "../components/PosterCard";
import { RouletteButton } from "../components/RouletteButton";
import type { Playlist, PlaylistMovie } from "../types";

interface RouletteProps {
  playlists: Playlist[];
  onNavigate: (path: string) => void;
}

type RouletteFilter = "all" | "watched" | "not_watched";

export function Roulette({ playlists, onNavigate }: RouletteProps) {
  const [filter, setFilter] = useState<RouletteFilter>("all");
  const [selectedMovie, setSelectedMovie] = useState<PlaylistMovie | null>(null);
  const savedMovies = useMemo(() => playlists.flatMap((playlist) => playlist.movies), [playlists]);
  const pool = savedMovies.filter((movie) => (filter === "all" ? true : movie.watchStatus === filter));

  function spin() {
    if (pool.length === 0) {
      setSelectedMovie(null);
      return;
    }
    setSelectedMovie(pool[Math.floor(Math.random() * pool.length)]);
  }

  return (
    <section className="route-page">
      <div className="roulette-stage">
        <div className="roulette-copy">
          <span className="eyebrow">Movie Roulette</span>
          <h1>Spin from your saved movies</h1>
          <p>Roulette chooses randomly from movies already saved in local playlists. Provider launch and Blind Spin are Phase 2B+ placeholders.</p>
          <div className="selector-cloud">
            <GenreChip />
            <span>Provider Name</span>
            <span>Playlist Name</span>
            <label>
              <span>Watch filter</span>
              <select onChange={(event) => setFilter(event.target.value as RouletteFilter)} value={filter}>
                <option value="all">all</option>
                <option value="not_watched">not watched</option>
                <option value="watched">watched</option>
              </select>
            </label>
          </div>
          <div className="button-row">
            <RouletteButton onSpin={spin} />
            <BlindSpinButton />
          </div>
        </div>
        <div className="roulette-wheel" aria-label="Roulette animation placeholder">
          <div className="wheel-core">?</div>
          <div className="orbit one" />
          <div className="orbit two" />
          <div className="orbit three" />
        </div>
      </div>
      <div className="results-placeholder">
        <span className="eyebrow">Results area</span>
        {selectedMovie ? (
          <div className="roulette-result">
            <PosterCard movie={selectedMovie} onNavigate={onNavigate} />
            <button className="secondary-button" onClick={() => onNavigate(`/movies/${selectedMovie.tmdbId}`)} type="button">
              Open Details
            </button>
          </div>
        ) : (
          <p>{pool.length === 0 ? "Add movies to playlists to create a roulette pool." : "Press Spin to choose a saved movie."}</p>
        )}
      </div>
    </section>
  );
}
