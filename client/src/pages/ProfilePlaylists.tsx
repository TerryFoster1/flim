import { PageShell } from "../components/PageShell";
import { PlaylistGrid } from "../components/PlaylistGrid";
import { PosterShelf } from "../components/PosterShelf";
import type { AppRoute } from "../types";

interface ProfilePlaylistsProps {
  onNavigate: (route: AppRoute) => void;
}

export function ProfilePlaylists({ onNavigate }: ProfilePlaylistsProps) {
  return (
    <PageShell eyebrow="Profile" title="My Playlists" description="Placeholder route for owned and collaborative playlists.">
      <PosterShelf title="My Playlists" />
      <PlaylistGrid count={2} onNavigate={onNavigate} />
    </PageShell>
  );
}
