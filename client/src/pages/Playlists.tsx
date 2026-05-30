import { PageShell } from "../components/PageShell";
import { PlaylistGrid } from "../components/PlaylistGrid";
import { PosterShelf } from "../components/PosterShelf";
import type { AppRoute } from "../types";

interface PlaylistsProps {
  onNavigate: (route: AppRoute) => void;
}

export function Playlists({ onNavigate }: PlaylistsProps) {
  return (
    <PageShell
      eyebrow="Playlists"
      title="Your movie shelves"
      description="Owned, saved, public, and future collaborative lists."
      action={<button className="primary-button" onClick={() => onNavigate("/playlists/:id")} type="button">Create Playlist</button>}
    >
      <PlaylistGrid onNavigate={onNavigate} />
      <PosterShelf title="Playlist Name" />
    </PageShell>
  );
}
