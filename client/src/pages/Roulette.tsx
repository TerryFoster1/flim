import { useMemo, useState } from "react";
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
  const [selectedPlaylistIds, setSelectedPlaylistIds] = useState<string[]>([]);
  const [selectedMovie, setSelectedMovie] = useState<PlaylistMovie | null>(null);
  const activePlaylistIds = selectedPlaylistIds.length > 0 ? selectedPlaylistIds : playlists.map((playlist) => playlist.id);
  const savedMovies = useMemo(
    () => playlists.filter((playlist) => activePlaylistIds.includes(playlist.id)).flatMap((playlist) => playlist.movies),
    [playlists, activePlaylistIds],
  );
  const pool = savedMovies.filter((movie) => (filter === "all" ? true : movie.watchStatus === filter));

  function togglePlaylist(playlistId: string) {
    setSelectedPlaylistIds((current) =>
      current.includes(playlistId) ? current.filter((id) => id !== playlistId) : [...current, playlistId],
    );
  }

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
          <h1>Movie night, one spin away.</h1>
          <div className="selector-cloud">
            {playlists.length === 0 ? <p className="empty-state">Add movies to a collection before spinning.</p> : null}
            {playlists.map((playlist) => (
              <label className="checkbox-pill" key={playlist.id}>
                <input
                  checked={selectedPlaylistIds.length === 0 || selectedPlaylistIds.includes(playlist.id)}
                  onChange={() => togglePlaylist(playlist.id)}
                  type="checkbox"
                />
                {playlist.name}
              </label>
            ))}
            <label>
              <span>Mood</span>
              <select onChange={(event) => setFilter(event.target.value as RouletteFilter)} value={filter}>
                <option value="all">all</option>
                <option value="not_watched">not watched</option>
                <option value="watched">watched</option>
              </select>
            </label>
          </div>
          <div className="button-row">
            <RouletteButton onSpin={spin} />
          </div>
        </div>
        <div className="roulette-wheel" aria-label="Roulette wheel">
          <div className="wheel-core">?</div>
          <div className="orbit one" />
          <div className="orbit two" />
          <div className="orbit three" />
        </div>
      </div>
      <div className="roulette-results">
        <span className="eyebrow">Tonight's pick</span>
        {selectedMovie ? (
          <div className="roulette-result">
            <PosterCard movie={selectedMovie} onNavigate={onNavigate} />
            <button className="secondary-button" onClick={() => onNavigate(`/movies/${selectedMovie.tmdbId}`)} type="button">
              Open Details
            </button>
          </div>
        ) : (
          <p>{pool.length === 0 ? "Your poster pool is empty." : "Press Spin."}</p>
        )}
      </div>
    </section>
  );
}
