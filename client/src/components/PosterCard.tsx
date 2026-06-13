import type { PlaylistMovie, WatchStatus } from "../types";
import { WatchStatusBadge } from "./WatchStatusBadge";

interface PosterCardProps {
  movie: PlaylistMovie;
  playlistId?: string;
  onNavigate?: (path: string) => void;
  onRemove?: (playlistId: string, tmdbId: number, mediaType?: string) => void | Promise<void>;
  onWatchStatusChange?: (playlistId: string, tmdbId: number, watchStatus: WatchStatus, mediaType?: string) => void | Promise<void>;
}

export function PosterCard({ movie, playlistId, onNavigate, onRemove, onWatchStatusChange }: PosterCardProps) {
  const watched = movie.watchStatus === "watched";
  const mediaType = movie.mediaType === "tv" ? "tv" : "movie";
  const genres = Array.isArray(movie.genres) ? movie.genres : [];
  const detailPath = `${mediaType === "tv" ? "/tv" : "/movies"}/${movie.tmdbId}${playlistId ? `?playlist=${encodeURIComponent(playlistId)}` : ""}`;

  return (
    <article className="poster-card" tabIndex={0} aria-label={`${movie.title} poster card`}>
      <button className="poster-card-button reset-button" onClick={() => onNavigate?.(detailPath)} type="button">
        {movie.posterUrl ? <img className="poster-image" src={movie.posterUrl} alt={`${movie.title} poster`} loading="lazy" decoding="async" /> : <div className="poster tone-blue" />}
      </button>
      <div className="card-title">{movie.title}</div>
      <div className="card-meta">
        <span>{movie.releaseYear || "Year"}</span>
        {movie.runtimeMinutes ? <span>{movie.runtimeMinutes} min</span> : null}
        {movie.seasonCount ? <span>{movie.seasonCount} season{movie.seasonCount === 1 ? "" : "s"}</span> : null}
        {genres.slice(0, 2).map((genre) => (
          <span key={genre}>{genre}</span>
        ))}
      </div>
      {movie.recommendationReason ? <p className="recommendation-reason">{movie.recommendationReason}</p> : null}
      <WatchStatusBadge label={watched ? "Watched" : "Not watched"} />
      {playlistId ? (
        <div className="card-actions">
          <button
            className={watched ? "watched-toggle is-watched" : "watched-toggle"}
            onClick={() => onWatchStatusChange?.(playlistId, movie.tmdbId, watched ? "not_watched" : "watched", mediaType)}
            type="button"
          >
            {watched ? "✓ Watched" : "Mark Watched"}
          </button>
          <button className="text-button" onClick={() => onRemove?.(playlistId, movie.tmdbId, mediaType)} type="button">
            Remove
          </button>
        </div>
      ) : null}
    </article>
  );
}
