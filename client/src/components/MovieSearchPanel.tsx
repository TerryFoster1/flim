import { useEffect, useState, type FormEvent } from "react";
import { hasTmdbApiKey, searchMovies, type MediaSearchMode } from "../services/tmdbService";
import { getCurrentProfile } from "../services/profileService";
import { getProviderAvailabilityForTitle, normalizeStreamingRegion } from "../services/watchProviderService";
import type { MovieSearchResult, Playlist } from "../types";
import { AddToPlaylistControl } from "./AddToPlaylistControl";

interface MovieSearchPanelProps {
  playlists: Playlist[];
  addToPlaylist: (playlistId: string, movie: MovieSearchResult) => void | Promise<void>;
  onNavigate: (path: string) => void;
  variant?: "standard" | "hero";
  fixedPlaylistId?: string;
  onMovieAdded?: () => void;
}

export function MovieSearchPanel({ playlists, addToPlaylist, onNavigate, variant = "standard", fixedPlaylistId, onMovieAdded }: MovieSearchPanelProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MovieSearchResult[]>([]);
  const [mediaType, setMediaType] = useState<MediaSearchMode>("both");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  const [addingKey, setAddingKey] = useState<string | null>(null);
  const [addedKeys, setAddedKeys] = useState<Set<string>>(() => new Set());
  const [availableOnMyServices, setAvailableOnMyServices] = useState(false);
  const [availabilityMatches, setAvailabilityMatches] = useState<Record<string, string[]>>({});
  const [availabilityStatus, setAvailabilityStatus] = useState("");
  const [profilePreferences, setProfilePreferences] = useState<{ providers: string[]; region: string }>({ providers: [], region: "CA" });
  const hasKey = hasTmdbApiKey();
  const targetPlaylists = fixedPlaylistId ? playlists.filter((playlist) => playlist.id === fixedPlaylistId) : playlists;
  const fixedPlaylist = fixedPlaylistId ? targetPlaylists[0] : null;

  function resultKey(movie: MovieSearchResult) {
    return `${movie.mediaType || "movie"}-${movie.tmdbId}`;
  }

  function alreadyInFixedPlaylist(movie: MovieSearchResult) {
    return Boolean(
      fixedPlaylist?.movies.some((item) => item.tmdbId === movie.tmdbId && (item.mediaType || "movie") === (movie.mediaType || "movie")) ||
      addedKeys.has(resultKey(movie)),
    );
  }

  useEffect(() => {
    let active = true;
    getCurrentProfile()
      .then((profile) => {
        if (!active) return;
        setProfilePreferences({
          providers: profile.preferredProviders || [],
          region: normalizeStreamingRegion(profile.streamingRegion || profile.countryCode || "CA"),
        });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  async function prioritizeAvailableResults(movies: MovieSearchResult[]) {
    if (!availableOnMyServices) {
      setAvailabilityMatches({});
      return movies;
    }

    if (profilePreferences.providers.length === 0) {
      setAvailabilityStatus("Choose your services in Settings to prioritize watchable results.");
      return movies;
    }

    setAvailabilityStatus("Checking cached availability on your services...");
    const limited = movies.slice(0, 20);
    const checked = await Promise.allSettled(
      limited.map(async (movie) => {
        const availability = await getProviderAvailabilityForTitle(movie, profilePreferences.region);
        const matches = availability.links
          .filter((link) => link.availabilityKnown && profilePreferences.providers.includes(link.provider.id))
          .map((link) => link.provider.name);
        return { key: resultKey(movie), matches };
      }),
    );
    const matchMap: Record<string, string[]> = {};
    checked.forEach((result) => {
      if (result.status === "fulfilled" && result.value.matches.length > 0) {
        matchMap[result.value.key] = result.value.matches;
      }
    });
    setAvailabilityMatches(matchMap);
    setAvailabilityStatus(Object.keys(matchMap).length ? "Titles on your services are shown first." : "No cached matches found on your selected services yet. Showing all results.");
    return [...movies].sort((a, b) => Number(Boolean(matchMap[resultKey(b)])) - Number(Boolean(matchMap[resultKey(a)])));
  }

  async function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hasKey) {
      setMessage("Movie search is not configured yet.");
      return;
    }

    setStatus("loading");
    setMessage("");
    try {
      const movies = await searchMovies(query, mediaType);
      const prioritized = await prioritizeAvailableResults(movies);
      setResults(prioritized);
      setStatus("done");
      setMessage(movies.length ? "" : "No titles found.");
    } catch {
      setStatus("error");
      setMessage("Movie search failed. Please try again shortly.");
    }
  }

  async function addToCurrentPlaylist(movie: MovieSearchResult) {
    if (!fixedPlaylistId) return;

    const key = resultKey(movie);
    if (alreadyInFixedPlaylist(movie)) {
      setMessage(`${movie.title} is already in this playlist.`);
      return;
    }

    setAddingKey(key);
    setMessage("");
    try {
      await addToPlaylist(fixedPlaylistId, movie);
      setAddedKeys((current) => new Set(current).add(key));
      setMessage(`${movie.title} added.`);
      onMovieAdded?.();
    } catch {
      setMessage("Unable to add. Try again.");
    } finally {
      setAddingKey(null);
    }
  }

  return (
    <section className={variant === "hero" ? "search-panel hero-search-panel" : "search-panel"} id="movie-search">
      <form className="search-form" onSubmit={submitSearch}>
        <label>
          <input onChange={(event) => setQuery(event.target.value)} placeholder="Search movies or TV shows" type="search" value={query} />
        </label>
        <div className="search-type-toggle" aria-label="Search media type">
          {(["both", "movie", "tv"] as MediaSearchMode[]).map((option) => (
            <button className={mediaType === option ? "is-active" : ""} key={option} onClick={() => setMediaType(option)} type="button">
              {option === "both" ? "Both" : option === "movie" ? "Movies" : "TV Shows"}
            </button>
          ))}
        </div>
        <div className="search-action-row">
          <button className="primary-button search-submit-button" disabled={!query.trim() || status === "loading"} type="submit">
            {status === "loading" ? "Searching..." : "Search"}
          </button>
          {!fixedPlaylistId ? (
            <button className="secondary-button" onClick={() => onNavigate("/playlists")} type="button">
              Create Playlist
            </button>
          ) : null}
        </div>
        <label className="checkbox-row search-provider-filter">
          <input
            checked={availableOnMyServices}
            onChange={(event) => setAvailableOnMyServices(event.target.checked)}
            type="checkbox"
          />
          Available on my services
        </label>
      </form>
      {!hasKey ? <p className="empty-state">Movie search is not configured yet.</p> : null}
      {message ? <p className="empty-state">{message}</p> : null}
      {availabilityStatus ? <p className="helper-text">{availabilityStatus}</p> : null}
      {results.length > 0 ? (
        <div className="search-results-experience" aria-live="polite">
          <div className="search-results-heading">
            <h2>{fixedPlaylistId ? "Choose a title to add it to this playlist" : "Choose a title, then add it to a playlist"}</h2>
          </div>
          <div className="search-results">
            {results.map((movie) => (
              <article className="search-result-card" key={resultKey(movie)}>
                <button className="poster-card-button reset-button" onClick={() => onNavigate(movie.mediaType === "tv" ? `/tv/${movie.tmdbId}` : `/movies/${movie.tmdbId}`)} type="button">
                  {movie.posterUrl ? <img className="poster-image" src={movie.posterUrl} alt={`${movie.title} poster`} loading="lazy" decoding="async" /> : <div className="poster tone-blue" />}
                </button>
                <div>
                  <h3>{movie.title}</h3>
                  <div className="card-meta">
                    <span>{movie.releaseYear || "Year"}</span>
                    <span>{movie.mediaType === "tv" ? "TV Show" : "Movie"}</span>
                    {availabilityMatches[resultKey(movie)]?.length ? <span>On {availabilityMatches[resultKey(movie)].slice(0, 2).join(", ")}</span> : null}
                  </div>
                  <p>{movie.overview}</p>
                  <div className="button-row">
                    <button className="secondary-button" onClick={() => onNavigate(movie.mediaType === "tv" ? `/tv/${movie.tmdbId}` : `/movies/${movie.tmdbId}`)} type="button">
                      Details
                    </button>
                    {fixedPlaylistId ? (
                      <button
                        className="primary-button"
                        disabled={addingKey === resultKey(movie) || alreadyInFixedPlaylist(movie)}
                        onClick={() => addToCurrentPlaylist(movie)}
                        type="button"
                      >
                        {alreadyInFixedPlaylist(movie)
                          ? fixedPlaylist?.movies.some((item) => item.tmdbId === movie.tmdbId && (item.mediaType || "movie") === (movie.mediaType || "movie"))
                            ? "✓ Already Added"
                            : "✓ Added"
                          : addingKey === resultKey(movie)
                            ? "Adding..."
                            : "Add Title"}
                      </button>
                    ) : targetPlaylists.length === 0 ? (
                      <button className="primary-button" onClick={() => onNavigate("/playlists")} type="button">
                        Create Playlist
                      </button>
                    ) : (
                      <AddToPlaylistControl
                        addToPlaylist={async (playlistId, selectedMovie) => {
                          await addToPlaylist(playlistId, selectedMovie);
                          onMovieAdded?.();
                        }}
                        movie={movie}
                        playlists={targetPlaylists}
                      />
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
