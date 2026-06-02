import type { PlaylistMovie, WatchStatus } from "../types";
import { PosterCard } from "./PosterCard";

interface MovieGridProps {
  movies?: PlaylistMovie[];
  playlistId?: string;
  onNavigate?: (path: string) => void;
  onRemove?: (playlistId: string, tmdbId: number, mediaType?: string) => void | Promise<void>;
  onReorder?: (index: number, direction: -1 | 1) => void | Promise<void>;
  onWatchStatusChange?: (playlistId: string, tmdbId: number, watchStatus: WatchStatus, mediaType?: string) => void | Promise<void>;
  emptyMessage?: string;
}

export function MovieGrid({ movies, playlistId, onNavigate, onRemove, onReorder, onWatchStatusChange, emptyMessage = "No movies in this playlist yet." }: MovieGridProps) {
  const displayMovies = movies || [];

  if (displayMovies.length === 0) {
    return <p className="empty-state">{emptyMessage}</p>;
  }

  return (
    <div className="movie-grid">
      {displayMovies.map((movie, index) => (
        <PosterCard
          key={`${movie.mediaType || "movie"}-${movie.tmdbId}`}
          index={index}
          itemCount={displayMovies.length}
          movie={movie}
          playlistId={playlistId}
          onNavigate={onNavigate}
          onRemove={onRemove}
          onReorder={onReorder}
          onWatchStatusChange={onWatchStatusChange}
        />
      ))}
    </div>
  );
}
