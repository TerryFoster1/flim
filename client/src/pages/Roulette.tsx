import { useEffect, useMemo, useRef, useState } from "react";
import { RouletteButton } from "../components/RouletteButton";
import type { Playlist, PlaylistMovie } from "../types";

interface RouletteProps {
  playlists: Playlist[];
  onNavigate: (path: string) => void;
}

type RouletteFilter = "all" | "watched" | "not_watched";

function FilmReelSvg() {
  return (
    <svg className="film-reel-svg" viewBox="0 0 240 240" aria-hidden="true">
      <defs>
        <linearGradient id="flimReelGradient" x1="34" y1="32" x2="210" y2="208" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ff4f6d" />
          <stop offset="0.48" stopColor="#ffb84d" />
          <stop offset="1" stopColor="#ffe760" />
        </linearGradient>
      </defs>
      <circle cx="120" cy="120" r="96" fill="url(#flimReelGradient)" />
      <circle cx="120" cy="120" r="64" fill="#0a0b10" opacity="0.9" />
      {[0, 60, 120, 180, 240, 300].map((angle) => (
        <circle
          cx={120 + Math.cos((angle * Math.PI) / 180) * 46}
          cy={120 + Math.sin((angle * Math.PI) / 180) * 46}
          fill="#08090d"
          key={angle}
          r="16"
        />
      ))}
      <circle cx="120" cy="120" r="14" fill="#fff7df" />
      <path d="M164 166 C190 172 207 166 224 146 L224 192 C196 212 166 208 142 188 Z" fill="#120b09" opacity="0.7" />
    </svg>
  );
}

function ProjectorSvg() {
  return (
    <svg className="projector-svg" viewBox="0 0 320 180" aria-hidden="true">
      <defs>
        <linearGradient id="flimProjectorGradient" x1="34" y1="28" x2="250" y2="164" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ff4f6d" />
          <stop offset="0.55" stopColor="#ffb84d" />
          <stop offset="1" stopColor="#ffe760" />
        </linearGradient>
      </defs>
      <path d="M170 74 L306 26 L306 154 L170 110 Z" fill="#ffb84d" opacity="0.16" />
      <rect x="76" y="70" width="126" height="62" rx="22" fill="url(#flimProjectorGradient)" />
      <circle cx="94" cy="54" r="36" fill="#181018" stroke="#ffb84d" strokeWidth="6" />
      <circle cx="156" cy="46" r="30" fill="#181018" stroke="#ff7a45" strokeWidth="6" />
      <circle cx="94" cy="54" r="9" fill="#ffb84d" />
      <circle cx="156" cy="46" r="8" fill="#ffb84d" />
      <rect x="188" y="85" width="48" height="30" rx="12" fill="#fff7df" />
      <path d="M96 132 L70 164 M178 132 L210 164" stroke="#ffb84d" strokeWidth="8" strokeLinecap="round" />
      <path d="M54 164 H230" stroke="#2a2021" strokeWidth="10" strokeLinecap="round" />
    </svg>
  );
}

function SpotlightSvg() {
  return (
    <svg className="spotlight-svg" viewBox="0 0 320 420" aria-hidden="true">
      <defs>
        <radialGradient id="spotlightGlow" cx="50%" cy="14%" r="80%">
          <stop stopColor="#ffe760" stopOpacity="0.72" />
          <stop offset="0.38" stopColor="#ffb84d" stopOpacity="0.2" />
          <stop offset="1" stopColor="#ff4f6d" stopOpacity="0" />
        </radialGradient>
      </defs>
      <path d="M132 0 H188 L300 420 H20 Z" fill="url(#spotlightGlow)" />
    </svg>
  );
}

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
  const previewMovies = (pool.length > 0 ? pool : savedMovies).slice(0, 12);

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

  function startProjector() {
    if (pool.length === 0 || isSpinning) {
      setSelectedMovie(null);
      return;
    }

    spinTimers.current.forEach(window.clearTimeout);
    spinTimers.current = [];
    setIsSpinning(true);
    setSelectedMovie(null);

    // Future audio hooks: projector start, reel acceleration, mechanical clicks, winning reveal.
    const winner = pool[Math.floor(Math.random() * pool.length)];
    const delays = [0, 70, 130, 190, 260, 340, 440, 570, 730, 930, 1180, 1480, 1840, 2260];

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
      <div className={`projector-roulette-stage ${isSpinning ? "is-spinning" : ""} ${selectedMovie ? "has-winner" : ""}`}>
        <div className="projector-copy">
          <span className="eyebrow">Flim Roulette</span>
          <h1>Movie Night Roulette</h1>
          <p>{pool.length === 0 ? "Add movies to a collection before starting the projector." : `${pool.length} movies loaded from ${selectedPlaylistCount} collection${selectedPlaylistCount === 1 ? "" : "s"}.`}</p>
        </div>

        <div className="projector-machine" aria-label="Film reel roulette projector">
          <SpotlightSvg />
          <div className="projector-art">
            <FilmReelSvg />
            <ProjectorSvg />
          </div>

          <div className="film-strip-track" aria-hidden="true">
            <div className="film-strip">
              {previewMovies.length > 0
                ? previewMovies.map((movie, index) => (
                    <span className="film-frame" key={`${movie.tmdbId}-${index}`}>
                      {movie.posterUrl ? <img alt="" src={movie.posterUrl} /> : <span className="film-frame-placeholder" />}
                    </span>
                  ))
                : Array.from({ length: 10 }).map((_, index) => (
                    <span className="film-frame empty" key={index}>
                      <span className="film-frame-placeholder" />
                    </span>
                  ))}
            </div>
          </div>

          <div className="winner-screen">
            {shuffleMovie?.posterUrl ? <img alt={`${shuffleMovie.title} poster`} src={shuffleMovie.posterUrl} /> : <div className="winner-placeholder" />}
            <div className="winner-screen-glow" />
          </div>
        </div>

        <div className="winner-reveal-panel">
          <span className="eyebrow">{selectedMovie ? "Selected For Movie Night" : isSpinning ? "Projector running" : "Ready"}</span>
          <h2>{selectedMovie ? selectedMovie.title : isSpinning && shuffleMovie ? shuffleMovie.title : "Tonight's Movie"}</h2>
          <p>{selectedMovie ? selectedMovie.releaseYear || "Year to confirm" : "Start the projector and let the film reel choose."}</p>
          <div className="roulette-action-row">
            <RouletteButton disabled={pool.length === 0 || isSpinning} label={isSpinning ? "Projector Running" : "Start Projector"} onSpin={startProjector} />
            {selectedMovie ? (
              <>
                <button className="primary-button" onClick={() => onNavigate(`/movies/${selectedMovie.tmdbId}`)} type="button">
                  Watch Tonight
                </button>
                <button className="secondary-button" onClick={() => onNavigate(`/movies/${selectedMovie.tmdbId}`)} type="button">
                  View Details
                </button>
                <button className="secondary-button" type="button">
                  Share Movie Night
                </button>
              </>
            ) : null}
          </div>
        </div>
      </div>

      <section className="roulette-control-deck" aria-label="Roulette movie pool">
        <div className="roulette-lineup-heading">
          <span className="eyebrow">Collections</span>
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
                {filterOption === "all" ? "All Movies" : filterOption === "not_watched" ? "Unwatched" : "Watched"}
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
              <h2>Build a collection before the projector starts.</h2>
              <button className="primary-button" onClick={() => onNavigate("/playlists")} type="button">
                Create Collection
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
