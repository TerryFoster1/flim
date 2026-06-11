import { useEffect, useMemo, useRef, useState } from "react";
import { TapToSpinPoster, VintageCountdown } from "../components/RouletteAssets";
import { getRoulettePlaylistPreferences, saveRoulettePlaylistPreferences } from "../services/roulettePreferencesService";
import type { Playlist, PlaylistMovie } from "../types";

interface RouletteProps {
  playlists: Playlist[];
  onNavigate: (path: string) => void;
}

type MediaFilter = "both" | "movie" | "tv";
type WatchFilter = "both" | "not_watched" | "watched";
type RoulettePhase = "idle" | "spinning" | "countdown" | "revealed";

interface RouletteMovie {
  movie: PlaylistMovie;
  playlistName: string;
}

const spinTicks = [0, 120, 240, 360, 500, 650, 820, 1010, 1230, 1480, 1760, 2070];
const genreFilters = ["Action", "Comedy", "Drama", "Horror", "Sci-Fi", "Family", "Romance", "Thriller", "Animation"];
const rouletteStorageKey = "flim.roulette.excludedPlaylistIds.v1";

function buildMoviePool(playlists: Playlist[], activePlaylistIds: string[]) {
  const seen = new Set<string>();
  const pool: RouletteMovie[] = [];

  playlists
    .filter((playlist) => activePlaylistIds.includes(playlist.id))
    .forEach((playlist) => {
      playlist.movies.forEach((movie) => {
        const key = `${movie.mediaType || "movie"}-${movie.tmdbId}`;
        if (seen.has(key)) return;
        seen.add(key);
        pool.push({ movie, playlistName: playlist.name });
      });
    });

  return pool;
}

function normalizeGenreValue(value: unknown): string[] {
  if (!value) return [];
  if (typeof value === "string") {
    try {
      return normalizeGenreValue(JSON.parse(value));
    } catch {
      return value.split(",").map((genre) => genre.trim()).filter(Boolean);
    }
  }
  if (!Array.isArray(value)) return [];
  return value
    .flatMap((genre) => {
      if (typeof genre === "string") return [genre];
      if (genre && typeof genre === "object") {
        const record = genre as { name?: unknown; label?: unknown; title?: unknown };
        return [String(record.name || record.label || record.title || "")];
      }
      return [];
    })
    .map((genre) => genre.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim())
    .filter(Boolean);
}

function genreAliases(genre: string) {
  const normalized = genre.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim();
  if (normalized === "sci fi" || normalized === "science fiction") return ["sci fi", "science fiction", "sci-fi"];
  return [normalized];
}

export function Roulette({ playlists, onNavigate }: RouletteProps) {
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>("both");
  const [watchFilter, setWatchFilter] = useState<WatchFilter>("both");
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [excludedPlaylistIds, setExcludedPlaylistIds] = useState<string[]>([]);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [phase, setPhase] = useState<RoulettePhase>("idle");
  const [displayedEntry, setDisplayedEntry] = useState<RouletteMovie | null>(null);
  const [revealedEntry, setRevealedEntry] = useState<RouletteMovie | null>(null);
  const [countdown, setCountdown] = useState(3);
  const timers = useRef<number[]>([]);
  const selectedEntryRef = useRef<RouletteMovie | null>(null);

  const allPlaylistIds = useMemo(() => playlists.map((playlist) => playlist.id), [playlists]);
  const activePlaylistIds = useMemo(() => allPlaylistIds.filter((playlistId) => !excludedPlaylistIds.includes(playlistId)), [allPlaylistIds, excludedPlaylistIds]);
  const selectedPlaylistCount = activePlaylistIds.length;

  const moviePool = useMemo(() => buildMoviePool(playlists, activePlaylistIds), [playlists, activePlaylistIds]);
  const filteredPool = moviePool.filter(({ movie }) => {
    if (mediaFilter !== "both" && (movie.mediaType || "movie") !== mediaFilter) return false;
    if (watchFilter !== "both" && movie.watchStatus !== watchFilter) return false;
    if (selectedGenres.length === 0) return true;

    const movieGenres = normalizeGenreValue(movie.genres);
    return selectedGenres.some((genre) => {
      const acceptedGenres = genreAliases(genre);
      return acceptedGenres.some((acceptedGenre) => movieGenres.includes(acceptedGenre));
    });
  });
  const canSpin = filteredPool.length > 0 && phase !== "spinning" && phase !== "countdown";
  const isBusy = phase === "spinning" || phase === "countdown";

  useEffect(() => {
    return () => clearTimers();
  }, []);

  useEffect(() => {
    const savedLocal = readLocalExcludedPlaylistIds();
    if (savedLocal.length > 0) setExcludedPlaylistIds(savedLocal);

    getRoulettePlaylistPreferences()
      .then((preferences) => {
        setExcludedPlaylistIds(filterKnownPlaylistIds(preferences.excludedPlaylistIds, allPlaylistIds));
      })
      .catch(() => {
        // Signed-out users keep a local preference fallback.
      });
  }, []);

  useEffect(() => {
    setExcludedPlaylistIds((current) => {
      const clean = filterKnownPlaylistIds(current, allPlaylistIds);
      if (clean.length === current.length && clean.every((id, index) => id === current[index])) return current;
      persistExcludedPlaylistIds(clean);
      return clean;
    });
  }, [allPlaylistIds]);

  function clearTimers() {
    timers.current.forEach(window.clearTimeout);
    timers.current = [];
  }

  function resetRoulette() {
    if (isBusy) return;
    clearTimers();
    setPhase("idle");
    setDisplayedEntry(null);
    selectedEntryRef.current = null;
    setRevealedEntry(null);
    setCountdown(3);
  }

  function updateMediaFilter(nextFilter: MediaFilter) {
    if (isBusy) return;
    setMediaFilter(nextFilter);
    resetRoulette();
  }

  function updateWatchFilter(nextFilter: WatchFilter) {
    if (isBusy) return;
    setWatchFilter(nextFilter);
    resetRoulette();
  }

  function toggleGenreFilter(genre: string) {
    if (isBusy) return;
    setSelectedGenres((current) => (current.includes(genre) ? current.filter((value) => value !== genre) : [...current, genre]));
    resetRoulette();
  }

  function chooseAllPlaylists() {
    if (isBusy) return;
    persistExcludedPlaylistIds([]);
    setExcludedPlaylistIds([]);
    resetRoulette();
  }

  function togglePlaylist(playlistId: string) {
    if (isBusy) return;
    setExcludedPlaylistIds((current) => {
      const nextIds = current.includes(playlistId)
        ? current.filter((id) => id !== playlistId)
        : [...current, playlistId];
      const clean = filterKnownPlaylistIds(nextIds, allPlaylistIds);
      persistExcludedPlaylistIds(clean);
      return clean;
    });
    resetRoulette();
  }

  function readLocalExcludedPlaylistIds() {
    try {
      const raw = window.localStorage.getItem(rouletteStorageKey);
      const parsed = raw ? JSON.parse(raw) : [];
      return filterKnownPlaylistIds(Array.isArray(parsed) ? parsed.map(String) : [], allPlaylistIds);
    } catch {
      return [];
    }
  }

  function filterKnownPlaylistIds(values: string[], knownPlaylistIds: string[]) {
    const known = new Set(knownPlaylistIds);
    return [...new Set(values)].filter((playlistId) => known.has(playlistId));
  }

  function persistExcludedPlaylistIds(nextIds: string[]) {
    try {
      window.localStorage.setItem(rouletteStorageKey, JSON.stringify(nextIds));
    } catch {
      // localStorage can fail in private browsing; the DB save below is still attempted.
    }

    saveRoulettePlaylistPreferences(nextIds).catch(() => {
      // Signed-out users intentionally fall back to localStorage.
    });
  }

  function startSpin() {
    if (!canSpin) return;

    clearTimers();
    setPhase("spinning");
    selectedEntryRef.current = null;
    setRevealedEntry(null);

    // TODO: Add projector hum, reel clicks, countdown beeps, and a reveal sting when audio settings exist.
    const winner = filteredPool[Math.floor(Math.random() * filteredPool.length)];
    selectedEntryRef.current = winner;

    spinTicks.forEach((delay, index) => {
      const timer = window.setTimeout(() => {
        const entry = filteredPool[Math.floor(Math.random() * filteredPool.length)];
        setDisplayedEntry(entry);

        if (index === spinTicks.length - 1) {
          setPhase("countdown");
          [3, 2, 1].forEach((value, countdownIndex) => {
            const countdownTimer = window.setTimeout(() => {
              setCountdown(value);

              if (value === 1) {
                const revealTimer = window.setTimeout(() => {
                  setRevealedEntry(selectedEntryRef.current || winner);
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

  const posterEntry = phase === "revealed" ? revealedEntry : displayedEntry;
  const posterMovie = posterEntry?.movie;
  const resultEntry = phase === "revealed" ? revealedEntry : null;
  const resultMovie = resultEntry?.movie;
  const loadedLabel =
    filteredPool.length > 0
      ? `${filteredPool.length} title${filteredPool.length === 1 ? "" : "s"} loaded from ${selectedPlaylistCount} playlist${selectedPlaylistCount === 1 ? "" : "s"}.`
      : "Add titles to a playlist to start Now Playing.";
  const suspenseCopy = phase === "spinning" || phase === "countdown"
    ? "The reel is spinning..."
    : loadedLabel;

  return (
    <section className="route-page roulette-page">
      <section className={`roulette-experience phase-${phase}`}>
        <div className="roulette-copy-panel">
          <h1>NOW PLAYING</h1>
          <p>Tap the poster and let Flim choose tonight's movie.</p>
        </div>

        <button
          aria-label={canSpin ? "Tap the poster to choose tonight's movie" : "Create a playlist and add movies to start Now Playing"}
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
            ) : posterMovie?.posterUrl ? (
              <img className="roulette-active-poster" alt={`${posterMovie.title} poster`} src={posterMovie.posterUrl} />
            ) : (
              <TapToSpinPoster empty={filteredPool.length === 0} />
            )}

            {phase === "spinning" ? <div className="roulette-frame-flicker" aria-hidden="true" /> : null}
          </div>
        </button>

        <aside className="roulette-result-panel" aria-live="polite">
          <h2>{resultMovie ? resultMovie.title : phase === "spinning" || phase === "countdown" ? "Choosing tonight's title..." : "Ready when you are."}</h2>
          <p>{resultMovie ? resultMovie.releaseYear || "Year to confirm" : suspenseCopy}</p>
          {resultEntry ? <p className="roulette-source">From {resultEntry.playlistName}</p> : null}
          {phase === "revealed" && resultMovie ? (
            <div className="roulette-action-row">
              <button className="primary-button" onClick={() => onNavigate((resultMovie.mediaType || "movie") === "tv" ? `/tv/${resultMovie.tmdbId}` : `/movies/${resultMovie.tmdbId}`)} type="button">
                Watch Tonight
              </button>
              <button className="secondary-button" onClick={() => onNavigate((resultMovie.mediaType || "movie") === "tv" ? `/tv/${resultMovie.tmdbId}` : `/movies/${resultMovie.tmdbId}`)} type="button">
                View Details
              </button>
              <button className="secondary-button" onClick={startSpin} type="button">
                Choose Again
              </button>
            </div>
          ) : null}
        </aside>
      </section>

      <section className="roulette-selection-panel" aria-label="Now Playing movie pool">
        <div className="roulette-control-header">
          <div>
            <h2>Choose Playlists</h2>
            <p>{loadedLabel}</p>
          </div>
          <div className="roulette-header-actions">
            {excludedPlaylistIds.length > 0 ? (
              <button className="secondary-button roulette-reset-selection" disabled={isBusy} onClick={chooseAllPlaylists} type="button">
                Reset to all playlists
              </button>
            ) : null}
            <button className="secondary-button roulette-advanced-toggle" disabled={isBusy} onClick={() => setShowAdvancedFilters((current) => !current)} type="button">
              {showAdvancedFilters ? "Hide Filters" : "Refine Results"}
            </button>
          </div>
        </div>

        {playlists.length === 0 ? (
          <div className="roulette-empty-cinema">
            <TapToSpinPoster empty />
            <div>
              <h2>Add titles to a playlist to start Now Playing.</h2>
              <button className="primary-button" onClick={() => onNavigate("/playlists")} type="button">
                Create Playlist
              </button>
            </div>
          </div>
        ) : (
          <>
            {showAdvancedFilters ? (
              <div className="roulette-advanced-filters">
                <div>
                  <h3>Type</h3>
                  <div className="roulette-filter-pills" aria-label="Title type filter">
                    {(["both", "movie", "tv"] as MediaFilter[]).map((filterOption) => (
                      <button
                        aria-pressed={mediaFilter === filterOption}
                        className={mediaFilter === filterOption ? "is-active" : ""}
                        disabled={isBusy}
                        key={filterOption}
                        onClick={() => updateMediaFilter(filterOption)}
                        type="button"
                      >
                        {filterOption === "both" ? "Both" : filterOption === "movie" ? "Movies" : "TV Shows"}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <h3>Watch Status</h3>
                  <div className="roulette-filter-pills" aria-label="Watch status filter">
                    {(["both", "not_watched", "watched"] as WatchFilter[]).map((filterOption) => (
                      <button
                        aria-pressed={watchFilter === filterOption}
                        className={watchFilter === filterOption ? "is-active" : ""}
                        disabled={isBusy}
                        key={filterOption}
                        onClick={() => updateWatchFilter(filterOption)}
                        type="button"
                      >
                        {filterOption === "both" ? "Both" : filterOption === "not_watched" ? "Unwatched" : "Watched"}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <h3>Genre</h3>
                  <div className="roulette-filter-pills" aria-label="Genre filter">
                    {genreFilters.map((genre) => (
                      <button
                        aria-pressed={selectedGenres.includes(genre)}
                        className={selectedGenres.includes(genre) ? "is-active" : ""}
                        disabled={isBusy}
                        key={genre}
                        onClick={() => toggleGenreFilter(genre)}
                        type="button"
                      >
                        {genre}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}

            <div className="roulette-chip-grid">
              <button
                aria-pressed={excludedPlaylistIds.length === 0}
                className={`roulette-playlist-chip all-playlists-chip ${excludedPlaylistIds.length === 0 ? "is-selected" : ""}`}
                disabled={isBusy}
                onClick={chooseAllPlaylists}
                type="button"
              >
                <span className="roulette-selection-mark" aria-hidden="true">{excludedPlaylistIds.length === 0 ? "In" : ""}</span>
                <span className="roulette-chip-cover">
                  {moviePool.slice(0, 4).map(({ movie }) =>
                    movie.posterUrl ? <img alt="" key={`${movie.mediaType || "movie"}-${movie.tmdbId}`} src={movie.posterUrl} /> : <i key={`${movie.mediaType || "movie"}-${movie.tmdbId}`} />,
                  )}
                  {moviePool.length === 0 ? <><i /><i /><i /><i /></> : null}
                </span>
                <strong>All Playlists</strong>
                <small>{moviePool.length} titles included</small>
              </button>

              {playlists.map((playlist) => {
                const selected = !excludedPlaylistIds.includes(playlist.id);
                return (
                  <button
                    aria-pressed={selected}
                    className={`roulette-playlist-chip ${selected ? "is-selected" : "is-excluded"}`}
                    disabled={isBusy}
                    key={playlist.id}
                    onClick={() => togglePlaylist(playlist.id)}
                    type="button"
                  >
                    <span className="roulette-selection-mark" aria-hidden="true">{selected ? "In" : ""}</span>
                    <span className="roulette-chip-cover">
                      {playlist.movies.slice(0, 4).map((movie) =>
                        movie.posterUrl ? <img alt="" key={`${movie.mediaType || "movie"}-${movie.tmdbId}`} src={movie.posterUrl} /> : <i key={`${movie.mediaType || "movie"}-${movie.tmdbId}`} />,
                      )}
                      {playlist.movies.length === 0 ? <><i /><i /><i /><i /></> : null}
                    </span>
                    <strong>{playlist.name}</strong>
                    <small>{selected ? "Included" : "Excluded"} · {playlist.movies.length} titles</small>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </section>
    </section>
  );
}
