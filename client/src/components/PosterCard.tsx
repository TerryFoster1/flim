import type { PlaceholderMovie } from "../data/placeholders";
import { ProviderBadge } from "./ProviderBadge";
import { WatchStatusBadge } from "./WatchStatusBadge";

interface PosterCardProps {
  movie: PlaceholderMovie;
}

export function PosterCard({ movie }: PosterCardProps) {
  return (
    <article className="poster-card" tabIndex={0} aria-label="Movie Title placeholder">
      <div className={`poster tone-${movie.tone}`} />
      <div className="card-title">{movie.title}</div>
      <div className="card-meta">
        <span>{movie.year}</span>
        <span>{movie.runtime}</span>
        <span>{movie.genre}</span>
      </div>
      <div className="provider-dots" aria-label="Provider icon placeholders">
        <ProviderBadge />
        <ProviderBadge />
        <ProviderBadge />
      </div>
      <WatchStatusBadge label={movie.status} />
    </article>
  );
}
