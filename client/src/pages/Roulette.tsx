import { useEffect, useMemo, useRef, useState } from "react";
import { TapToSpinPoster, VintageCountdown } from "../components/RouletteAssets";
import type { Playlist, PlaylistMovie } from "../types";

interface RouletteProps {
  playlists: Playlist[];
  onNavigate: (path: string) => void;
}

type RouletteFilter = "all" | "watched" | "not_watched";
type RoulettePhase = "idle" | "spinning" | "countdown" | "revealed";

interface RouletteMovie {
  movie: PlaylistMovie;
  playlistName: string;
}

const spinTicks = [0, 120, 240, 360, 500, 650, 820, 1010, 1230, 1480, 1760, 2070];

function buildMoviePool(playlists: Playlist[], activePlaylistIds: string[]) {
  const seen = new Set<number>();
  const pool: RouletteMovie[] = [];

  playlists
    .filter((playlist) => activePlaylistIds.includes(playlist.id))
    .forEach((playlist) => {
      playlist.movies.forEach((movie) => {
        if (seen.has(movie.tmdbId)) return;
        seen.add(movie.tmdbId);
        pool.push({ movie, playlistName: playlist.name });
      });
    });

  return pool;
}

export function Roulette({ playlists, onNavigate }: RouletteProps) {
  const [filter, setFilter] = useState<RouletteFilter>("all");
  const [selectedPlaylistIds, setSelectedPlaylistIds] = useState<string[]>([]);
  const [phase, setPhase] = useState<RoulettePhase>("idle");
  const [displayedEntry, setDisplayedEntry] = useState<RouletteMovie | null>(null);
  const [winnerEntry, setWinnerEntry] = useState<RouletteMovie | null>(null);
  const [countdown, setCountdown] = useState(3);
  const timers = useRef<number[]>([]);

  const allPlaylistIds = useMemo(() => playlists.map((playlist) => playlist.id), [playlists]);
  const activePlaylistIds = selectedPlaylistIds.length > 0 ? selectedPlaylistIds : allPlaylistIds;
  const selectedPlaylistCount = selectedPlaylistIds.length > 0 ? selectedPlaylistIds.length : playlists.length;

  const moviePool = useMemo(() => buildMoviePool(playlists, activePlaylistIds), [playlists, activePlaylistIds]);
  const filteredPool = moviePool.filter(({ movie }) => (filter === "all" ? true : movie.watchStatus === filter));
  const canSpin = filteredPool.length > 0 && phase !== "spinning" && phase !== "countdown";
  const isBusy = phase === "spinning" || phase === "countdown";

  useEffect(() => {
    return () => clearTimers();
  }, []);

  function clearTimers() {
    timers.current.forEach(window.clearTimeout);
    timers.current = [];
  }

  function resetRoulette() {
    if (isBusy) return;
    clearTimers();
    setPhase("idle");
    setDisplayedEntry(null);
    setWinnerEntry(null);
    setCountdown(3);
  }

  function updateFilter(nextFilter: RouletteFilter) {
    if (isBusy) return;
    setFilter(nextFilter);
    resetRoulette();
  }

  function chooseAllPlaylists() {
    if (isBusy) return;
    setSelectedPlaylistIds([]);
    resetRoulette();
  }

  function togglePlaylist(playlistId: string) {
    if (isBusy) return;
    setSelectedPlaylistIds((current) => {
      const activeIds = current.length > 0 ? current : allPlaylistIds;
      const nextIds = activeIds.includes(playlistId) ? activeIds.filter((id) => id !== playlistId) : [...activeIds, playlistId];
      return nextIds.length === 0 || nextIds.length === allPlaylistIds.length ? [] : nextIds;
    });
    resetRoulette();
  }

  function startSpin() {
    if (!canSpin) return;

    clearTimers();
    setPhase("spinning");
    setWinnerEntry(null);

    // TODO: Add projector hum, reel clicks, countdown beeps, and a reveal sting when audio settings exist.
    const winner = filteredPool[Math.floor(Math.random() * filteredPool.length)];

    spinTicks.forEach((delay, index) => {
      const timer = window.setTimeout(() => {
        const entry = index === spinTicks.length - 1 ? winner : filteredPool[Math.floor(Math.random() * filteredPool.length)];
        setDisplayedEntry(entry);

        if (index === spinTicks.length - 1) {
          setPhase("countdown");
          [3, 2, 1].forEach((value, countdownIndex) => {
            const countdownTimer = window.setTimeout(() => {
              setCountdown(value);

              if (value === 1) {
                const revealTimer = window.setTimeout(() => {
                  setWinnerEntry(winner);
                  setDisplayedEntry(winner);
                  setPhase("revealed");
                }, 520);
                timers.current.push(revealTimer);
              }
            }, countdownIndex * 560);
            timers.current.push(countdownTimer);
          });
        }
      }, delay);
      timers.current.push(timer);
    });
  }

  const activeEntry = winnerEntry || displayedEntry;
  const activeMovie = activeEntry?.movie;
  const loadedLabel =
    filteredPool.length > 0
      ? `${filteredPool.length} movie${filteredPool.length === 1 ? "" : "s"} loaded from ${selectedPlaylistCount} playlist${selectedPlaylistCount === 1 ? "" : "s"}.`
      : "Add movies to a playlist to start Movie Night Roulette.";

  return (
    <section className="route-page roulette-page">
      <section className={`roulette-experience phase-${phase}`}>
        <div className="roulette-copy-panel">
          <span className="eyebrow">Now Playing</span>
          <h1>Movie Night Roulette</h1>
          <p>Tap the poster and let Flim choose tonight's movie.</p>
        </div>

        <button
          aria-label={canSpin ? "Tap the poster to spin Movie Night Roulette" : "Create a playlist and add movies to start roulette"}
          className="roulette-poster-button reset-button"
          disabled={!canSpin}
          onClick={startSpin}
          type="button"
        >
          <div className="roulette-marquee-sign" aria-hidden="true">
            <span>Now Playing</span>
          </div>
          <div className="roulette-poster-frame">
            <div className="roulette-sprocket-border left" aria-hidden="true" />
            <div className="roulette-sprocket-border right" aria-hidden="true" />

            {phase === "countdown" ? (
              <VintageCountdown value={countdown} />
            ) : activeMovie?.posterUrl ? (
              <img className="roulette-active-poster" alt={`${activeMovie.title} poster`} src={activeMovie.posterUrl} />
            ) : (
              <TapToSpinPoster empty={filteredPool.length === 0} />
            )}

            {phase === "spinning" ? <div className="roulette-frame-flicker" aria-hidden="true" /> : null}
          </div>
        </button>

        <aside className="roulette-result-panel" aria-live="polite">
          <span className="eyebrow">{phase === "revealed" ? "Now Playing" : "Ready"}</span>
          <h2>{activeMovie ? activeMovie.title : "Ready when you are."}</h2>
          <p>{activeMovie ? activeMovie.releaseYear || "Year to confirm" : loadedLabel}</p>
          {activeEntry ? <p className="roulette-source">From {activeEntry.playlistName}</p> : null}
          {phase === "revealed" && activeMovie ? (
            <div className="roulette-action-row">
              <button className="primary-button" onClick={() => onNavigate(`/movies/${activeMovie.tmdbId}`)} type="button">
                Watch Tonight
              </button>
              <button className="secondary-button" onClick={() => onNavigate(`/movies/${activeMovie.tmdbId}`)} type="button">
                View Details
              </button>
              <button className="secondary-button" onClick={startSpin} type="button">
                Spin Again
              </button>
            </div>
          ) : null}
        </aside>
      </section>

      <section className="roulette-selection-panel" aria-label="Roulette movie pool">
        <div className="roulette-control-header">
          <div>
            <span className="eyebrow">Movie Pool</span>
            <h2>Choose playlists</h2>
          </div>
          <div className="roulette-filter-pills" aria-label="Watch status filter">
            {(["all", "not_watched", "watched"] as RouletteFilter[]).map((filterOption) => (
              <button
                aria-pressed={filter === filterOption}
                className={filter === filterOption ? "is-active" : ""}
                disabled={isBusy}
                key={filterOption}
                onClick={() => updateFilter(filterOption)}
                type="button"
              >
                {filterOption === "all" ? "All" : filterOption === "not_watched" ? "Unwatched" : "Watched"}
              </button>
            ))}
          </div>
        </div>

        {playlists.length === 0 ? (
          <div className="roulette-empty-cinema">
            <TapToSpinPoster empty />
            <div>
              <span className="eyebrow">No Movies Loaded</span>
              <h2>Add movies to a playlist to start Movie Night Roulette.</h2>
              <button className="primary-button" onClick={() => onNavigate("/playlists")} type="button">
                Create Playlist
              </button>
            </div>
          </div>
        ) : (
          <div className="roulette-chip-grid">
            <button
              aria-pressed={selectedPlaylistIds.length === 0}
              className={`roulette-playlist-chip ${selectedPlaylistIds.length === 0 ? "is-selected" : ""}`}
              disabled={isBusy}
              onClick={chooseAllPlaylists}
              type="button"
            >
              <span className="roulette-chip-cover">
                {moviePool.slice(0, 4).map(({ movie }) =>
                  movie.posterUrl ? <img alt="" key={movie.tmdbId} src={movie.posterUrl} /> : <i key={movie.tmdbId} />,
                )}
                {moviePool.length === 0 ? <><i /><i /><i /><i /></> : null}
              </span>
              <strong>All playlists</strong>
              <small>{moviePool.length} movies</small>
            </button>

            {playlists.map((playlist) => {
              const selected = selectedPlaylistIds.length === 0 || selectedPlaylistIds.includes(playlist.id);
              return (
                <button
                  aria-pressed={selected}
                  className={`roulette-playlist-chip ${selected ? "is-selected" : ""}`}
                  disabled={isBusy}
                  key={playlist.id}
                  onClick={() => togglePlaylist(playlist.id)}
                  type="button"
                >
                  <span className="roulette-chip-cover">
                    {playlist.movies.slice(0, 4).map((movie) =>
                      movie.posterUrl ? <img alt="" key={movie.tmdbId} src={movie.posterUrl} /> : <i key={movie.tmdbId} />,
                    )}
                    {playlist.movies.length === 0 ? <><i /><i /><i /><i /></> : null}
                  </span>
                  <strong>{playlist.name}</strong>
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
