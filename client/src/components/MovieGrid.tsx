import type { PlaylistMovie, WatchStatus } from "../types";
import { PosterCard } from "./PosterCard";

interface MovieGridProps {
  movies?: PlaylistMovie[];
  playlistId?: string;
  onNavigate?: (path: string) => void;
  onRemove?: (playlistId: string, tmdbId: number) => void;
  onWatchStatusChange?: (playlistId: string, tmdbId: number, watchStatus: WatchStatus) => void;
  emptyMessage?: string;
}

export function MovieGrid({ movies, playlistId, onNavigate, onRemove, onWatchStatusChange, emptyMessage = "No movies in this playlist yet." }: MovieGridProps) {
  const displayMovies = movies || [];

  if (displayMovies.length === 0) {
    return <p className="empty-state">{emptyMessage}</p>;
  }

  return (
    <div className="movie-grid">
      {displayMovies.map((movie) => (
        <PosterCard
          key={movie.tmdbId}
          movie={movie}
          playlistId={playlistId}
          onNavigate={onNavigate}
          onRemove={onRemove}
          onWatchStatusChange={onWatchStatusChange}
        />
      ))}
    </div>
  );
}
