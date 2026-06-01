import { useState, type FormEvent } from "react";
import { hasTmdbApiKey, searchMovies } from "../services/tmdbService";
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
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  const hasKey = hasTmdbApiKey();

  async function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hasKey) {
      setMessage("Movie search is not configured yet.");
      return;
    }

    setStatus("loading");
    setMessage("");
    try {
      const movies = await searchMovies(query);
      setResults(movies);
      setStatus("done");
      setMessage(movies.length ? "" : "No movies found.");
    } catch {
      setStatus("error");
      setMessage("Movie search failed. Please try again shortly.");
    }
  }

  return (
    <section className={variant === "hero" ? "search-panel hero-search-panel" : "search-panel"} id="movie-search">
      <form className="search-form" onSubmit={submitSearch}>
        <label>
          <span className="eyebrow">Movie search</span>
          <input onChange={(event) => setQuery(event.target.value)} placeholder="Search for a movie title" type="search" value={query} />
        </label>
        <div className="search-action-row">
          <button className="primary-button search-submit-button" disabled={!query.trim() || status === "loading"} type="submit">
            {status === "loading" ? "Searching..." : "Search"}
          </button>
          <button className="secondary-button" onClick={() => onNavigate("/playlists")} type="button">
            Create Playlist
          </button>
        </div>
      </form>
      {!hasKey ? <p className="empty-state">Movie search is not configured yet.</p> : null}
      {message ? <p className="empty-state">{message}</p> : null}
      {results.length > 0 ? (
        <div className="search-results-experience" aria-live="polite">
          <div className="search-results-heading">
            <span className="eyebrow">Results</span>
            <h2>Choose a movie, then add it to a playlist</h2>
          </div>
          <div className="search-results">
            {results.map((movie) => (
              <article className="search-result-card" key={movie.tmdbId}>
                <button className="poster-card-button reset-button" onClick={() => onNavigate(`/movies/${movie.tmdbId}`)} type="button">
                  {movie.posterUrl ? <img className="poster-image" src={movie.posterUrl} alt={`${movie.title} poster`} /> : <div className="poster tone-blue" />}
                </button>
                <div>
                  <h3>{movie.title}</h3>
                  <div className="card-meta">
                    <span>{movie.releaseYear || "Year"}</span>
                    <span>TMDb ID {movie.tmdbId}</span>
                  </div>
                  <p>{movie.overview}</p>
                  <div className="button-row">
                    <button className="secondary-button" onClick={() => onNavigate(`/movies/${movie.tmdbId}`)} type="button">
                      Details
                    </button>
                    {fixedPlaylistId ? (
                      <button
                        className="primary-button"
                        onClick={async () => {
                          await addToPlaylist(fixedPlaylistId, movie);
                          onMovieAdded?.();
                        }}
                        type="button"
                      >
                        Add Movie
                      </button>
                    ) : playlists.length === 0 ? (
                      <button className="primary-button" onClick={() => onNavigate("/playlists")} type="button">
                        Create Playlist
                      </button>
                    ) : (
                      <AddToPlaylistControl addToPlaylist={addToPlaylist} movie={movie} playlists={playlists} />
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
