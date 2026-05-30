import { PageShell } from "../components/PageShell";
import { PlaylistGrid } from "../components/PlaylistGrid";
import { PosterShelf } from "../components/PosterShelf";
import type { AppRoute } from "../types";

interface PublicPlaylistsProps {
  onNavigate: (route: AppRoute) => void;
}

export function PublicPlaylists({ onNavigate }: PublicPlaylistsProps) {
  return (
    <PageShell eyebrow="Public" title="Community movie playlists" description="Popular, trending, recently shared, and most followed lists.">
      <PlaylistGrid onNavigate={onNavigate} />
      <PosterShelf title="Most Followed" />
    </PageShell>
  );
}
