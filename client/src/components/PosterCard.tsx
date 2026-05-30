import type { PlaylistMovie, WatchStatus } from "../types";
import { WatchStatusBadge } from "./WatchStatusBadge";

interface PosterCardProps {
  movie: PlaylistMovie;
  playlistId?: string;
  onNavigate?: (path: string) => void;
  onRemove?: (playlistId: string, tmdbId: number) => void | Promise<void>;
  onWatchStatusChange?: (playlistId: string, tmdbId: number, watchStatus: WatchStatus) => void | Promise<void>;
}

export function PosterCard({ movie, playlistId, onNavigate, onRemove, onWatchStatusChange }: PosterCardProps) {
  const watched = movie.watchStatus === "watched";

  return (
    <article className="poster-card" tabIndex={0} aria-label={`${movie.title} poster card`}>
      <button className="poster-card-button reset-button" onClick={() => onNavigate?.(`/movies/${movie.tmdbId}`)} type="button">
        {movie.posterUrl ? <img className="poster-image" src={movie.posterUrl} alt={`${movie.title} poster`} /> : <div className="poster tone-blue" />}
      </button>
      <div className="card-title">{movie.title}</div>
      <div className="card-meta">
        <span>{movie.releaseYear || "Year"}</span>
        {movie.genres.slice(0, 2).map((genre) => (
          <span key={genre}>{genre}</span>
        ))}
      </div>
      <WatchStatusBadge label={watched ? "Watched" : "Not watched"} />
      {playlistId ? (
        <div className="card-actions">
          <label className="watched-toggle">
            <input
              checked={watched}
              onChange={(event) => onWatchStatusChange?.(playlistId, movie.tmdbId, event.target.checked ? "watched" : "not_watched")}
              type="checkbox"
            />
            Watched
          </label>
          <button className="text-button" onClick={() => onRemove?.(playlistId, movie.tmdbId)} type="button">
            Remove
          </button>
        </div>
      ) : null}
    </article>
  );
}
