import type { Playlist } from "../types";
import { PlaylistCard } from "./PlaylistCard";

interface PlaylistGridProps {
  playlists: Playlist[];
  onNavigate?: (path: string) => void;
  onDelete?: (playlistId: string) => void | Promise<void>;
  emptyMessage?: string;
}

export function PlaylistGrid({ playlists, onNavigate, onDelete, emptyMessage = "Create your first playlist." }: PlaylistGridProps) {
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
          onDelete={onDelete}
          onNavigate={onNavigate}
        />
      ))}
    </div>
  );
}
