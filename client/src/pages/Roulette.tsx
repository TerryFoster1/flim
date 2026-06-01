import { useEffect, useMemo, useRef, useState } from "react";
import type { Playlist, PlaylistMovie } from "../types";

interface RouletteProps {
  playlists: Playlist[];
  onNavigate: (path: string) => void;
}

type RouletteFilter = "all" | "watched" | "not_watched";
type RoulettePhase = "idle" | "cycling" | "countdown" | "revealed";

const spinDelays = [0, 70, 125, 180, 245, 320, 410, 520, 650, 800, 970, 1160, 1380, 1640, 1940];

function uniqueMovies(movies: PlaylistMovie[]) {
  const seen = new Set<number>();
  return movies.filter((movie) => {
    if (seen.has(movie.tmdbId)) return false;
    seen.add(movie.tmdbId);
    return true;
  });
}

export function Roulette({ playlists, onNavigate }: RouletteProps) {
  const [filter, setFilter] = useState<RouletteFilter>("all");
  const [selectedPlaylistIds, setSelectedPlaylistIds] = useState<string[]>([]);
  const [phase, setPhase] = useState<RoulettePhase>("idle");
  const [displayMovie, setDisplayMovie] = useState<PlaylistMovie | null>(null);
  const [selectedMovie, setSelectedMovie] = useState<PlaylistMovie | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const spinTimers = useRef<number[]>([]);

  const allPlaylistIds = useMemo(() => playlists.map((playlist) => playlist.id), [playlists]);
  const activePlaylistIds = selectedPlaylistIds.length > 0 ? selectedPlaylistIds : allPlaylistIds;
  const selectedPlaylistCount = selectedPlaylistIds.length > 0 ? selectedPlaylistIds.length : playlists.length;

  const savedMovies = useMemo(
    () => uniqueMovies(playlists.filter((playlist) => activePlaylistIds.includes(playlist.id)).flatMap((playlist) => playlist.movies)),
    [playlists, activePlaylistIds],
  );

  const pool = savedMovies.filter((movie) => (filter === "all" ? true : movie.watchStatus === filter));
  const previewMovies = (pool.length > 0 ? pool : savedMovies).slice(0, 14);
  const canSpin = pool.length > 0 && phase !== "cycling" && phase !== "countdown";
  const isRunning = phase === "cycling" || phase === "countdown";

  useEffect(() => {
    return () => {
      spinTimers.current.forEach(window.clearTimeout);
    };
  }, []);

  function clearSpinTimers() {
    spinTimers.current.forEach(window.clearTimeout);
    spinTimers.current = [];
  }

  function togglePlaylist(playlistId: string) {
    if (isRunning) return;
    setSelectedMovie(null);
    setDisplayMovie(null);
    setPhase("idle");
    setCountdown(null);
    setSelectedPlaylistIds((current) => {
      const activeIds = current.length > 0 ? current : allPlaylistIds;
      const nextIds = activeIds.includes(playlistId) ? activeIds.filter((id) => id !== playlistId) : [...activeIds, playlistId];
      return nextIds.length === 0 || nextIds.length === allPlaylistIds.length ? [] : nextIds;
    });
  }

  function chooseAllPlaylists() {
    if (isRunning) return;
    setSelectedPlaylistIds([]);
    setSelectedMovie(null);
    setDisplayMovie(null);
    setCountdown(null);
    setPhase("idle");
  }

  function changeFilter(nextFilter: RouletteFilter) {
    if (isRunning) return;
    setFilter(nextFilter);
    setSelectedMovie(null);
    setDisplayMovie(null);
    setCountdown(null);
    setPhase("idle");
  }

  function startSpin() {
    if (!canSpin) {
      setSelectedMovie(null);
      return;
    }

    clearSpinTimers();
    setPhase("cycling");
    setSelectedMovie(null);
    setCountdown(null);

    // TODO: Layer in projector sound, film reel sound, countdown beeps, and reveal audio once audio settings exist.
    const winner = pool[Math.floor(Math.random() * pool.length)];

    spinDelays.forEach((delay, index) => {
      const timer = window.setTimeout(() => {
        const movie = index === spinDelays.length - 1 ? winner : pool[Math.floor(Math.random() * pool.length)];
        setDisplayMovie(movie);

        if (index === spinDelays.length - 1) {
          setPhase("countdown");
          [3, 2, 1].forEach((number, countdownIndex) => {
            const countdownTimer = window.setTimeout(() => {
              setCountdown(number);

              if (number === 1) {
                const revealTimer = window.setTimeout(() => {
                  setSelectedMovie(winner);
                  setDisplayMovie(winner);
                  setCountdown(null);
                  setPhase("revealed");
                }, 520);
                spinTimers.current.push(revealTimer);
              }
            }, countdownIndex * 560);
            spinTimers.current.push(countdownTimer);
          });
        }
      }, delay);
      spinTimers.current.push(timer);
    });
  }

  const frameMovie = displayMovie || selectedMovie;
  const marqueeLabel =
    phase === "revealed" && selectedMovie
      ? "Selected For Movie Night"
      : phase === "countdown"
        ? "Countdown"
        : phase === "cycling"
          ? "Film Strip Spinning"
          : "Now Playing";

  return (
    <section className="route-page roulette-page">
      <section className={`now-playing-roulette ${isRunning ? "is-running" : ""} ${phase === "revealed" ? "has-winner" : ""}`}>
        <div className="roulette-theater-copy">
          <span className="eyebrow">Now Playing</span>
          <h1>Movie Night Roulette</h1>
          <p>Tap the reel and let Flim choose tonight's movie.</p>
        </div>

        <button
          aria-label={canSpin ? "Tap to spin Movie Night Roulette" : "Add movies to a playlist to start roulette"}
          className="now-playing-marquee reset-button"
          disabled={!canSpin}
          onClick={startSpin}
          type="button"
        >
          <div className="marquee-sign" aria-hidden="true">
            <span />
            <strong>Now Playing</strong>
            <span />
          </div>

          <div className="marquee-poster-frame">
            <div className="film-sprocket film-sprocket-left" aria-hidden="true" />
            <div className="film-sprocket film-sprocket-right" aria-hidden="true" />

            {phase === "countdown" && countdown ? (
              <div className="vintage-countdown" aria-live="polite">
                <span>{countdown}</span>
              </div>
            ) : frameMovie?.posterUrl ? (
              <img alt={`${frameMovie.title} poster`} className="roulette-feature-poster" src={frameMovie.posterUrl} />
            ) : (
              <div className="flim-spin-poster">
                <span className="flim-ticket-icon">Flim</span>
                <strong>{pool.length > 0 ? "Tap To Spin" : "Add Movies"}</strong>
                <small>{pool.length > 0 ? "Movie Night Roulette" : "Create a playlist and add movies to start roulette."}</small>
              </div>
            )}

            {phase === "cycling" ? (
              <div className="marquee-film-strip" aria-hidden="true">
                {[...previewMovies, ...previewMovies].slice(0, 18).map((movie, index) => (
                  <span className="marquee-film-frame" key={`${movie.tmdbId}-${index}`}>
                    {movie.posterUrl ? <img alt="" src={movie.posterUrl} /> : <span />}
                  </span>
                ))}
              </div>
            ) : null}

            <div className="poster-glass" aria-hidden="true" />
          </div>
        </button>

        <div className="roulette-reveal-copy" aria-live="polite">
          <span className="eyebrow">{marqueeLabel}</span>
          <h2>{selectedMovie ? selectedMovie.title : phase === "cycling" && displayMovie ? displayMovie.title : "Tap To Spin"}</h2>
          <p>
            {selectedMovie
              ? selectedMovie.releaseYear || "Year to confirm"
              : pool.length > 0
                ? `${pool.length} movies loaded from ${selectedPlaylistCount} playlist${selectedPlaylistCount === 1 ? "" : "s"}.`
                : "Create a playlist and add movies to start roulette."}
          </p>
          {selectedMovie ? (
            <div className="roulette-action-row">
              <button className="primary-button" onClick={() => onNavigate(`/movies/${selectedMovie.tmdbId}`)} type="button">
                View Details
              </button>
              <button className="secondary-button" onClick={startSpin} type="button">
                Spin Again
              </button>
            </div>
          ) : null}
        </div>
      </section>

      <section className="roulette-control-deck" aria-label="Roulette movie pool">
        <div className="roulette-lineup-heading">
          <span className="eyebrow">Playlists</span>
          <div className="roulette-filter-pills" aria-label="Watch status filter">
            {(["all", "not_watched", "watched"] as RouletteFilter[]).map((filterOption) => (
              <button
                aria-pressed={filter === filterOption}
                className={filter === filterOption ? "is-active" : ""}
                disabled={isRunning}
                key={filterOption}
                onClick={() => changeFilter(filterOption)}
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
              <h2>Create a playlist and add movies to start roulette.</h2>
              <button className="primary-button" onClick={() => onNavigate("/playlists")} type="button">
                Create Playlist
              </button>
            </div>
          </div>
        ) : (
          <div className="roulette-playlist-grid">
            <button
              aria-pressed={selectedPlaylistIds.length === 0}
              className={`roulette-playlist-card roulette-all-card ${selectedPlaylistIds.length === 0 ? "is-selected" : ""}`}
              disabled={isRunning}
              onClick={chooseAllPlaylists}
              type="button"
            >
              <div className="roulette-playlist-cover all-playlists-cover">
                {previewMovies.slice(0, 4).map((movie) =>
                  movie.posterUrl ? <img alt="" key={movie.tmdbId} src={movie.posterUrl} /> : <span key={movie.tmdbId} />,
                )}
                {previewMovies.length === 0 ? (
                  <>
                    <span />
                    <span />
                    <span />
                    <span />
                  </>
                ) : null}
              </div>
              <span>All Playlists</span>
              <small>{savedMovies.length} movies</small>
            </button>

            {playlists.map((playlist) => {
              const selected = selectedPlaylistIds.length === 0 || selectedPlaylistIds.includes(playlist.id);
              return (
                <button
                  aria-pressed={selected}
                  className={`roulette-playlist-card ${selected ? "is-selected" : ""}`}
                  disabled={isRunning}
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
