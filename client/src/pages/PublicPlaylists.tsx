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

function byLikeCount(playlists: Playlist[]) {
  return [...playlists].sort((a, b) => {
    const likeDelta = (b.likeCount || 0) - (a.likeCount || 0);
    if (likeDelta !== 0) return likeDelta;
    const followerDelta = (b.followerCount || 0) - (a.followerCount || 0);
    if (followerDelta !== 0) return followerDelta;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}

const discoveryGenres = [
  { title: "Action", keywords: ["action"] },
  { title: "Comedy", keywords: ["comedy"] },
  { title: "Drama", keywords: ["drama"] },
  { title: "Sci-Fi", keywords: ["sci-fi", "science fiction", "sci fi"] },
  { title: "Horror", keywords: ["horror"] },
  { title: "Disaster Movies", keywords: ["disaster", "apocalypse"] },
  { title: "Family", keywords: ["family", "kids"] },
];

function matchesPlaylistKeywords(playlist: Playlist, keywords: string[]) {
  const searchable = [
    playlist.name,
    playlist.description,
    playlist.creatorDisplayName || "",
    playlist.creatorHandle || "",
    ...playlist.movies.flatMap((movie) => [movie.title, ...movie.genres]),
  ].join(" ").toLowerCase();
  return keywords.some((keyword) => searchable.includes(keyword));
}

function isTemporaryVerificationPlaylist(playlist: Playlist) {
  const name = playlist.name.toLowerCase();
  return (
    name.includes("codex vercel curl add test") ||
    name.includes("temporary production verification") ||
    name.includes("production verification playlist")
  );
}

function uniqueCuratorPlaylists(playlists: Playlist[]) {
  const seen = new Set<string>();
  return byFollowerCount(playlists).filter((playlist) => {
    const key = playlist.creatorHandle || playlist.creatorDisplayName || playlist.ownerUserId || playlist.id;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function DiscoveryShelf({ title, playlists, onNavigate }: { title: string; playlists: Playlist[]; onNavigate: (path: string) => void }) {
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
  const featuredCurators = uniqueCuratorPlaylists(communityPlaylists.filter((playlist) => playlist.creatorDisplayName || playlist.creatorHandle));
  const favorites = byFollowerCount(communityPlaylists);
  const mostLiked = byLikeCount(communityPlaylists);
  const recentlyUpdated = byUpdated(communityPlaylists);

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
        <DiscoveryShelf title="Flim Picks" playlists={flimPicks} onNavigate={onNavigate} />
        <DiscoveryShelf title="Featured Curators" playlists={featuredCurators} onNavigate={onNavigate} />
        <DiscoveryShelf title="Community Favorites" playlists={favorites} onNavigate={onNavigate} />
        <DiscoveryShelf title="Most Liked Playlists" playlists={mostLiked} onNavigate={onNavigate} />
        {discoveryGenres.map((genre) => (
          <DiscoveryShelf
            key={genre.title}
            title={genre.title}
            playlists={byFollowerCount(publicPlaylists.filter((playlist) => matchesPlaylistKeywords(playlist, genre.keywords)))}
            onNavigate={onNavigate}
          />
        ))}
        <DiscoveryShelf title="Recently Updated" playlists={recentlyUpdated} onNavigate={onNavigate} />
      </div>

    </PageShell>
  );
}
