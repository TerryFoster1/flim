import { PageShell } from "../components/PageShell";
import { PosterShelf } from "../components/PosterShelf";

export function ProfileSaved() {
  return (
    <PageShell eyebrow="Profile" title="Saved Lists" description="Placeholder route for playlists saved from other users.">
      <PosterShelf title="Saved Playlist Name" />
    </PageShell>
  );
}
