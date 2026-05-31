import { useEffect, useMemo, useRef, useState } from "react";
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
  const [shuffleMovie, setShuffleMovie] = useState<PlaylistMovie | null>(null);
  const [isSpinning, setIsSpinning] = useState(false);
  const spinTimers = useRef<number[]>([]);

  const activePlaylistIds = selectedPlaylistIds.length > 0 ? selectedPlaylistIds : playlists.map((playlist) => playlist.id);
  const selectedPlaylistCount = selectedPlaylistIds.length > 0 ? selectedPlaylistIds.length : playlists.length;
  const savedMovies = useMemo(
    () => playlists.filter((playlist) => activePlaylistIds.includes(playlist.id)).flatMap((playlist) => playlist.movies),
    [playlists, activePlaylistIds],
  );
  const pool = savedMovies.filter((movie) => (filter === "all" ? true : movie.watchStatus === filter));
  const previewMovies = (pool.length > 0 ? pool : savedMovies).slice(0, 10);

  useEffect(() => {
    return () => {
      spinTimers.current.forEach(window.clearTimeout);
    };
  }, []);

  function togglePlaylist(playlistId: string) {
    setSelectedMovie(null);
    setSelectedPlaylistIds((current) => {
      const playlistIds = playlists.map((playlist) => playlist.id);
      const activeIds = current.length > 0 ? current : playlistIds;
      const nextIds = activeIds.includes(playlistId) ? activeIds.filter((id) => id !== playlistId) : [...activeIds, playlistId];
      return nextIds.length === 0 || nextIds.length === playlistIds.length ? [] : nextIds;
    });
  }

  function spin() {
    if (pool.length === 0 || isSpinning) {
      setSelectedMovie(null);
      return;
    }

    spinTimers.current.forEach(window.clearTimeout);
    spinTimers.current = [];
    setIsSpinning(true);
    setSelectedMovie(null);

    const winner = pool[Math.floor(Math.random() * pool.length)];
    const delays = [0, 80, 150, 220, 300, 390, 500, 640, 820, 1040, 1300, 1600, 1960];

    delays.forEach((delay, index) => {
      const timer = window.setTimeout(() => {
        const movie = index === delays.length - 1 ? winner : pool[Math.floor(Math.random() * pool.length)];
        setShuffleMovie(movie);

        if (index === delays.length - 1) {
          setSelectedMovie(winner);
          setIsSpinning(false);
        }
      }, delay);
      spinTimers.current.push(timer);
    });
  }

  return (
    <section className="route-page roulette-page">
      <div className="roulette-cinema-stage">
        <div className="roulette-marquee">
          <span className="eyebrow">Poster Shuffle Roulette</span>
          <h1>Press spin. Let the posters decide.</h1>
          <p>Choose the collections in tonight's lineup, then watch the posters shuffle into a movie night reveal.</p>
        </div>

        <div className={`poster-shuffle-machine ${isSpinning ? "is-spinning" : ""} ${selectedMovie ? "has-winner" : ""}`}>
          <div className="shuffle-reel" aria-hidden="true">
            {previewMovies.length > 0
              ? previewMovies.map((movie, index) =>
                  movie.posterUrl ? (
                    <img alt="" key={`${movie.tmdbId}-${index}`} src={movie.posterUrl} />
                  ) : (
                    <span className="reel-placeholder" key={`${movie.tmdbId}-${index}`} />
                  ),
                )
              : Array.from({ length: 8 }).map((_, index) => <span className="reel-placeholder" key={index} />)}
          </div>

          <div className="winner-frame">
            {shuffleMovie?.posterUrl ? (
              <img alt={`${shuffleMovie.title} poster`} src={shuffleMovie.posterUrl} />
            ) : (
              <div className="winner-placeholder" aria-hidden="true" />
            )}
            <div className="winner-glow" />
          </div>

          <div className="roulette-reveal-copy">
            <span className="eyebrow">{selectedMovie ? "Tonight's movie" : isSpinning ? "Shuffling posters" : "Ready when you are"}</span>
            <h2>{selectedMovie ? selectedMovie.title : isSpinning && shuffleMovie ? shuffleMovie.title : "Movie night reveal"}</h2>
            <p>
              {selectedMovie
                ? `${selectedMovie.releaseYear || "Year to confirm"} from your selected Flim collection.`
                : pool.length === 0
                  ? "Add movies to a playlist, then come back for the reveal."
                  : `${pool.length} movies loaded from ${selectedPlaylistCount} playlist${selectedPlaylistCount === 1 ? "" : "s"}.`}
            </p>
            <div className="roulette-action-row">
              <RouletteButton disabled={pool.length === 0 || isSpinning} onSpin={spin} />
              {selectedMovie ? (
                <button className="secondary-button" onClick={() => onNavigate(`/movies/${selectedMovie.tmdbId}`)} type="button">
                  Open Movie
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <section className="roulette-control-deck" aria-label="Roulette movie pool">
        <div className="split-heading page-heading">
          <div>
            <span className="eyebrow">Tonight's lineup</span>
            <h2>Select playlists</h2>
          </div>
          <div className="roulette-filter-pills" aria-label="Watch status filter">
            {(["all", "not_watched", "watched"] as RouletteFilter[]).map((filterOption) => (
              <button
                aria-pressed={filter === filterOption}
                className={filter === filterOption ? "is-active" : ""}
                key={filterOption}
                onClick={() => {
                  setFilter(filterOption);
                  setSelectedMovie(null);
                }}
                type="button"
              >
                {filterOption === "all" ? "All" : filterOption === "not_watched" ? "Unwatched" : "Watched"}
              </button>
            ))}
          </div>
        </div>

        {playlists.length === 0 ? (
          <div className="roulette-empty-cinema">
            <div className="empty-poster-wall" aria-hidden="true">
              {Array.from({ length: 6 }).map((_, index) => <span key={index} />)}
            </div>
            <div>
              <span className="eyebrow">No posters loaded</span>
              <h2>Build a collection before the spin.</h2>
              <button className="primary-button" onClick={() => onNavigate("/playlists")} type="button">
                Create Playlist
              </button>
            </div>
          </div>
        ) : (
          <div className="roulette-playlist-grid">
            {playlists.map((playlist) => {
              const selected = selectedPlaylistIds.length === 0 || selectedPlaylistIds.includes(playlist.id);
              return (
                <button
                  aria-pressed={selected}
                  className={`roulette-playlist-card ${selected ? "is-selected" : ""}`}
                  key={playlist.id}
                  onClick={() => togglePlaylist(playlist.id)}
                  type="button"
                >
                  <div className="roulette-playlist-cover">
                    {playlist.movies.slice(0, 4).length > 0 ? (
                      playlist.movies.slice(0, 4).map((movie) =>
                        movie.posterUrl ? <img alt="" key={movie.tmdbId} src={movie.posterUrl} /> : <span key={movie.tmdbId} />,
                      )
                    ) : (
                      <>
                        <span />
                        <span />
                        <span />
                        <span />
                      </>
                    )}
                  </div>
                  <span>{playlist.name}</span>
                  <small>{playlist.movies.length} movies</small>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </section>
  );
}
