import { placeholderMovies } from "../data/placeholders";
import type { PlaylistMovie, WatchStatus } from "../types";
import { PosterCard } from "./PosterCard";

interface MovieGridProps {
  movies?: PlaylistMovie[];
  playlistId?: string;
  onNavigate?: (path: string) => void;
  onRemove?: (playlistId: string, tmdbId: number) => void;
  onWatchStatusChange?: (playlistId: string, tmdbId: number, watchStatus: WatchStatus) => void;
  showPlaceholderWhenEmpty?: boolean;
}

export function MovieGrid({ movies, playlistId, onNavigate, onRemove, onWatchStatusChange, showPlaceholderWhenEmpty = true }: MovieGridProps) {
  const displayMovies = movies && movies.length > 0 ? movies : showPlaceholderWhenEmpty ? placeholderMovies.slice(0, 12) : [];

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
