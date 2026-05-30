import { placeholderMovies } from "../data/placeholders";
import type { PlaylistMovie, WatchStatus } from "../types";
import { PosterCard } from "./PosterCard";

interface PosterShelfProps {
  title: string;
  eyebrow?: string;
  movies?: PlaylistMovie[];
  playlistId?: string;
  onNavigate?: (path: string) => void;
  onRemove?: (playlistId: string, tmdbId: number) => void;
  onWatchStatusChange?: (playlistId: string, tmdbId: number, watchStatus: WatchStatus) => void;
}

export function PosterShelf({ title, eyebrow = "Poster shelf", movies, playlistId, onNavigate, onRemove, onWatchStatusChange }: PosterShelfProps) {
  const displayMovies = movies && movies.length > 0 ? movies : placeholderMovies.slice(0, 8);

  return (
    <section className="shelf" aria-label={title}>
      <div className="shelf-header">
        <div className="shelf-title">{title}</div>
        <span className="eyebrow">{eyebrow}</span>
      </div>
      <div className="poster-row">
        {displayMovies.map((movie) => (
          <PosterCard
            key={`${title}-${movie.tmdbId}`}
            movie={movie}
            playlistId={playlistId}
            onNavigate={onNavigate}
            onRemove={onRemove}
            onWatchStatusChange={onWatchStatusChange}
          />
        ))}
      </div>
    </section>
  );
}
