import { PageShell } from "../components/PageShell";
import { PlaylistGrid } from "../components/PlaylistGrid";
import type { Playlist } from "../types";

interface ProfileSavedProps {
  playlists: Playlist[];
}

export function ProfileSaved({ playlists }: ProfileSavedProps) {
  const saved = playlists.filter((playlist) => playlist.saved || playlist.clonedFromId);

  return (
    <PageShell eyebrow="Profile" title="Saved Lists" description="Saved and cloned playlists appear here.">
      <PlaylistGrid playlists={saved} />
    </PageShell>
  );
}
