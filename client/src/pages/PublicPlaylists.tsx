import { PageShell } from "../components/PageShell";
import { PlaylistGrid } from "../components/PlaylistGrid";
import type { Playlist } from "../types";

interface PublicPlaylistsProps {
  onNavigate: (path: string) => void;
  playlists: Playlist[];
  clonePlaylist: (playlistId: string) => void | Promise<void>;
}

export function PublicPlaylists({ onNavigate, playlists, clonePlaylist }: PublicPlaylistsProps) {
  const publicPlaylists = playlists.filter((playlist) => playlist.visibility === "public");
  const newest = [...publicPlaylists].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const mostSaved = [...publicPlaylists].sort((a, b) => b.movies.length - a.movies.length);

  return (
    <PageShell eyebrow="Public Playlists" title="Shared playlists">
      {publicPlaylists.length === 0 ? (
        <section className="empty-playlists-panel cinematic-empty">
          <div className="empty-poster-wall" aria-hidden="true">
            {Array.from({ length: 6 }).map((_, index) => <span key={index} />)}
          </div>
          <div className="empty-copy">
            <span className="eyebrow">Public shelf</span>
            <h2>No public lists yet.</h2>
          </div>
        </section>
      ) : null}
      {publicPlaylists.length > 0 ? <section className="section-grid">
        <div>
          <h2>Popular</h2>
          <PlaylistGrid onNavigate={onNavigate} playlists={mostSaved} />
        </div>
        <div>
          <h2>Newest</h2>
          <PlaylistGrid onNavigate={onNavigate} playlists={newest} />
        </div>
        <div>
          <h2>Trending</h2>
          <PlaylistGrid onNavigate={onNavigate} playlists={publicPlaylists} />
        </div>
        <div>
          <h2>Most Saved</h2>
          <PlaylistGrid onNavigate={onNavigate} playlists={mostSaved} />
        </div>
      </section> : null}
      <div className="clone-action-row">
        {publicPlaylists.map((playlist) => (
          <button className="secondary-button" key={playlist.id} onClick={() => clonePlaylist(playlist.id)} type="button">
            Clone {playlist.name}
          </button>
        ))}
      </div>
    </PageShell>
  );
}
