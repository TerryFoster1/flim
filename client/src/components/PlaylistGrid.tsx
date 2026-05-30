import type { Playlist } from "../types";
import { PlaylistCard } from "./PlaylistCard";

interface PlaylistGridProps {
  playlists: Playlist[];
  onNavigate?: (path: string) => void;
}

export function PlaylistGrid({ playlists, onNavigate }: PlaylistGridProps) {
  if (playlists.length === 0) {
    return <p className="empty-state">Create your first playlist to start saving movies.</p>;
  }

  return (
    <div className="playlist-grid">
      {playlists.map((playlist, index) => (
        <PlaylistCard key={playlist.id} playlist={playlist} large={index === 0 && playlists.length > 3} onNavigate={onNavigate} />
      ))}
    </div>
  );
}
