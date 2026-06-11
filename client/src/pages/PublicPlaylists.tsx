import { PageShell } from "../components/PageShell";
import { PlaylistGrid } from "../components/PlaylistGrid";
import type { Playlist } from "../types";

interface PublicPlaylistsProps {
  onNavigate: (path: string) => void;
  playlists: Playlist[];
}

function isDirectorPlaylist(playlist: Playlist) {
  return playlist.creatorHandle === "the-director" || playlist.creatorDisplayName === "The Director";
}

function byUpdated(playlists: Playlist[]) {
  return [...playlists].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

function byFollowerCount(playlists: Playlist[]) {
  return [...playlists].sort((a, b) => {
    const followerDelta = (b.followerCount || 0) - (a.followerCount || 0);
    if (followerDelta !== 0) return followerDelta;
    const likeDelta = (b.likeCount || 0) - (a.likeCount || 0);
    if (likeDelta !== 0) return likeDelta;
    const titleDelta = b.movies.length - a.movies.length;
    if (titleDelta !== 0) return titleDelta;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}

function isTemporaryVerificationPlaylist(playlist: Playlist) {
  const name = playlist.name.toLowerCase();
  return (
    name.includes("codex vercel curl add test") ||
    name.includes("temporary production verification") ||
    name.includes("production verification playlist")
  );
}

function DiscoveryShelf({ title, playlists, onNavigate }: { title: string; playlists: Playlist[]; onNavigate: (path: string) => void }) {
  if (playlists.length === 0) return null;
  return (
    <section className="discovery-section">
      <div className="discovery-section-heading">
        <h2>{title}</h2>
      </div>
      <PlaylistGrid onNavigate={onNavigate} playlists={playlists.slice(0, 8)} emptyMessage="Public playlists will appear here." />
    </section>
  );
}

export function PublicPlaylists({ onNavigate, playlists }: PublicPlaylistsProps) {
  const publicPlaylists = playlists.filter((playlist) => playlist.visibility === "public" && !playlist.isSystem && !isTemporaryVerificationPlaylist(playlist));
  const flimPicks = publicPlaylists.filter(isDirectorPlaylist);
  const communityPlaylists = publicPlaylists.filter((playlist) => !isDirectorPlaylist(playlist));
  const followedPlaylists = byUpdated(publicPlaylists.filter((playlist) => playlist.isFollowing));
  const discoveryPlaylists = byFollowerCount(communityPlaylists);

  return (
    <PageShell title="Public Playlists">
      {publicPlaylists.length === 0 ? (
        <section className="empty-playlists-panel cinematic-empty">
          <div className="empty-poster-wall" aria-hidden="true">
            {Array.from({ length: 6 }).map((_, index) => <span key={index} />)}
          </div>
          <div className="empty-copy">
            <h2>Public playlists will appear here.</h2>
          </div>
        </section>
      ) : null}

      <div className="discovery-grid">
        <DiscoveryShelf title="Followed Playlists" playlists={followedPlaylists} onNavigate={onNavigate} />
        <DiscoveryShelf title="Director's Cut" playlists={flimPicks} onNavigate={onNavigate} />
        <DiscoveryShelf title="Public Playlists" playlists={discoveryPlaylists} onNavigate={onNavigate} />
      </div>

    </PageShell>
  );
}
