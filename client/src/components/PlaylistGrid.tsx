import type { Playlist } from "../types";
import { PlaylistCard } from "./PlaylistCard";

interface PlaylistGridProps {
  playlists: Playlist[];
  onNavigate?: (path: string) => void;
  emptyMessage?: string;
}

export function PlaylistGrid({ playlists, onNavigate, emptyMessage = "Create your first playlist." }: PlaylistGridProps) {
  if (playlists.length === 0) {
    return <p className="empty-state">{emptyMessage}</p>;
  }

  return (
    <div className="playlist-grid">
      {playlists.map((playlist, index) => (
        <PlaylistCard
          key={playlist.id}
          playlist={playlist}
          large={index === 0 && playlists.length > 3}
          onNavigate={onNavigate}
        />
      ))}
    </div>
  );
}
