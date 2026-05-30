import { placeholderPlaylists } from "../data/placeholders";
import type { AppRoute } from "../types";
import { PlaylistCard } from "./PlaylistCard";

interface PlaylistGridProps {
  onNavigate?: (route: AppRoute) => void;
  count?: number;
}

export function PlaylistGrid({ onNavigate, count = 4 }: PlaylistGridProps) {
  return (
    <div className="playlist-grid">
      {placeholderPlaylists.slice(0, count).map((playlist, index) => (
        <PlaylistCard key={playlist.id} playlist={playlist} large={index === 0 && count > 3} onNavigate={onNavigate} />
      ))}
    </div>
  );
}
