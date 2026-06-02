import type { PlaylistMovie, WatchStatus } from "../types";
import { WhereToWatch } from "./WhereToWatch";
import { WatchStatusBadge } from "./WatchStatusBadge";

interface PosterCardProps {
  movie: PlaylistMovie;
  index?: number;
  itemCount?: number;
  playlistId?: string;
  onNavigate?: (path: string) => void;
  onRemove?: (playlistId: string, tmdbId: number, mediaType?: string) => void | Promise<void>;
  onReorder?: (index: number, direction: -1 | 1) => void | Promise<void>;
  onWatchStatusChange?: (playlistId: string, tmdbId: number, watchStatus: WatchStatus, mediaType?: string) => void | Promise<void>;
}

export function PosterCard({ movie, index, itemCount, playlistId, onNavigate, onRemove, onReorder, onWatchStatusChange }: PosterCardProps) {
  const watched = movie.watchStatus === "watched";
  const canReorder = typeof index === "number" && typeof itemCount === "number" && Boolean(onReorder);

  return (
    <article className="poster-card" tabIndex={0} aria-label={`${movie.title} poster card`}>
      <button className="poster-card-button reset-button" onClick={() => onNavigate?.(movie.mediaType === "tv" ? `/tv/${movie.tmdbId}` : `/movies/${movie.tmdbId}`)} type="button">
        {movie.posterUrl ? <img className="poster-image" src={movie.posterUrl} alt={`${movie.title} poster`} /> : <div className="poster tone-blue" />}
      </button>
      <div className="card-title">{movie.title}</div>
      <div className="card-meta">
        <span>{movie.releaseYear || "Year"}</span>
        <span className="media-type-badge">{movie.mediaType === "tv" ? "TV Show" : "Movie"}</span>
        {movie.runtimeMinutes ? <span>{movie.runtimeMinutes} min</span> : null}
        {movie.seasonCount ? <span>{movie.seasonCount} season{movie.seasonCount === 1 ? "" : "s"}</span> : null}
        {movie.genres.slice(0, 2).map((genre) => (
          <span key={genre}>{genre}</span>
        ))}
      </div>
      {movie.recommendationReason ? <p className="recommendation-reason">{movie.recommendationReason}</p> : null}
      <WatchStatusBadge label={watched ? "Watched" : "Not watched"} />
      <WhereToWatch compact movie={movie} />
      {playlistId ? (
        <div className="card-actions">
          {canReorder ? (
            <div className="reorder-actions" aria-label={`Reorder ${movie.title}`}>
              <button disabled={index === 0} onClick={() => onReorder?.(index, -1)} type="button">
                Up
              </button>
              <button disabled={index === itemCount - 1} onClick={() => onReorder?.(index, 1)} type="button">
                Down
              </button>
            </div>
          ) : null}
          <label className="watched-toggle">
            <input
              checked={watched}
              onChange={(event) => onWatchStatusChange?.(playlistId, movie.tmdbId, event.target.checked ? "watched" : "not_watched", movie.mediaType || "movie")}
              type="checkbox"
            />
            Watched
          </label>
          <button className="text-button" onClick={() => onRemove?.(playlistId, movie.tmdbId, movie.mediaType || "movie")} type="button">
            Remove
          </button>
        </div>
      ) : null}
    </article>
  );
}
