import { PageShell } from "../components/PageShell";
import { PlaylistGrid } from "../components/PlaylistGrid";
import type { Playlist } from "../types";

interface ProfilePlaylistsProps {
  onNavigate: (path: string) => void;
  playlists: Playlist[];
}

export function ProfilePlaylists({ onNavigate, playlists }: ProfilePlaylistsProps) {
  return (
    <PageShell eyebrow="Profile" title="My Playlists" description="Your movie playlists live here.">
      <PlaylistGrid onNavigate={onNavigate} playlists={playlists} />
    </PageShell>
  );
}
