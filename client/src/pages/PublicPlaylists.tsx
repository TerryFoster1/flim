import { PageShell } from "../components/PageShell";
import { DiscoveryRecommendationShelf } from "../components/DiscoveryRecommendationShelf";
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

function playlistSignalScore(playlist: Playlist) {
  return (playlist.followerCount || 0) * 4 + (playlist.likeCount || 0) * 3 + playlist.movies.length;
}

function byTrending(playlists: Playlist[]) {
  return [...playlists].sort((a, b) => {
    const scoreDelta = playlistSignalScore(b) - playlistSignalScore(a);
    if (scoreDelta !== 0) return scoreDelta;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}

function recommendationReasonForPlaylist(playlist: Playlist) {
  if (playlist.recommendationReason) return playlist.recommendationReason;
  if (playlist.isFollowing) return "Because you follow this playlist.";
  if (isDirectorPlaylist(playlist)) return "Because The Director recommends it.";
  if ((playlist.followerCount || 0) > 0) return "Because Flim users are following this playlist.";
  if ((playlist.likeCount || 0) > 0) return "Because Flim users liked this playlist.";
  return playlist.movies[0]?.genres[0] ? `Because it curates ${playlist.movies[0].genres[0]} titles.` : "A public playlist discovery pick.";
}

function withRecommendationReasons(playlists: Playlist[]) {
  return playlists.map((playlist) => ({
    ...playlist,
    recommendationReason: recommendationReasonForPlaylist(playlist),
  }));
}

function excludePlaylists(playlists: Playlist[], excludedIds: Set<string>) {
  return playlists.filter((playlist) => !excludedIds.has(playlist.id));
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
      <PlaylistGrid onNavigate={onNavigate} playlists={playlists.slice(0, 6)} emptyMessage="Public playlists will appear here." />
    </section>
  );
}

export function PublicPlaylists({ onNavigate, playlists }: PublicPlaylistsProps) {
  const publicPlaylists = playlists.filter((playlist) => playlist.visibility === "public" && !playlist.isSystem && !isTemporaryVerificationPlaylist(playlist));
  const flimPicks = publicPlaylists.filter(isDirectorPlaylist);
  const communityPlaylists = publicPlaylists.filter((playlist) => !isDirectorPlaylist(playlist));
  const followedPlaylists = byUpdated(publicPlaylists.filter((playlist) => playlist.isFollowing));
  const recommendedPlaylists = withRecommendationReasons(byTrending(publicPlaylists));
  const trendingPlaylists = byTrending(communityPlaylists);
  const trendingPreviewIds = new Set(trendingPlaylists.slice(0, 6).map((playlist) => playlist.id));
  const featuredPlaylists = byUpdated(excludePlaylists(communityPlaylists, trendingPreviewIds));
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
        <DiscoveryRecommendationShelf fallbackPlaylists={recommendedPlaylists} includeCurators={false} onNavigate={onNavigate} />
        <DiscoveryShelf title="Trending Playlists" playlists={trendingPlaylists} onNavigate={onNavigate} />
        <DiscoveryShelf title="Director's Cut" playlists={flimPicks} onNavigate={onNavigate} />
        <DiscoveryShelf title="Featured Playlists" playlists={featuredPlaylists} onNavigate={onNavigate} />
        <DiscoveryShelf title="Followed Playlists" playlists={followedPlaylists} onNavigate={onNavigate} />
        <DiscoveryShelf title="Public Playlists" playlists={discoveryPlaylists} onNavigate={onNavigate} />
      </div>

    </PageShell>
  );
}
