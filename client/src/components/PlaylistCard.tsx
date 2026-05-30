import type { PlaceholderPlaylist } from "../data/placeholders";
import type { AppRoute } from "../types";

interface PlaylistCardProps {
  playlist: PlaceholderPlaylist;
  large?: boolean;
  onNavigate?: (route: AppRoute) => void;
}

export function PlaylistCard({ playlist, large, onNavigate }: PlaylistCardProps) {
  return (
    <article className={`playlist-card ${large ? "large" : ""}`}>
      <button className="playlist-card-button reset-button" onClick={() => onNavigate?.("/playlists/:id")} type="button">
        <div className={`playlist-cover ${playlist.tone}`} />
        <h3>{playlist.title}</h3>
        <p>{playlist.description}</p>
        <div className="card-meta">
          <span>{playlist.creator}</span>
          <span>{playlist.movieCount}</span>
          <span>{playlist.followers}</span>
        </div>
      </button>
    </article>
  );
}
