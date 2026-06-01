import { PageShell } from "../components/PageShell";
import { PlaylistGrid } from "../components/PlaylistGrid";
import type { Playlist, PlaylistMovie } from "../types";

interface PublicPlaylistsProps {
  onNavigate: (path: string) => void;
  playlists: Playlist[];
  clonePlaylist: (playlistId: string) => void | Promise<void>;
}

function byMovieCount(playlists: Playlist[]) {
  return [...playlists].sort((a, b) => b.movies.length - a.movies.length);
}

function byUpdated(playlists: Playlist[]) {
  return [...playlists].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function byCreated(playlists: Playlist[]) {
  return [...playlists].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function topSavedMovies(playlists: Playlist[]) {
  const movies = new Map<number, PlaylistMovie & { saves: number }>();
  playlists.flatMap((playlist) => playlist.movies).forEach((movie) => {
    const existing = movies.get(movie.tmdbId);
    if (existing) {
      existing.saves += 1;
      return;
    }
    movies.set(movie.tmdbId, { ...movie, saves: 1 });
  });
  return [...movies.values()].sort((a, b) => b.saves - a.saves || a.title.localeCompare(b.title)).slice(0, 100);
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

export function PublicPlaylists({ onNavigate, playlists, clonePlaylist }: PublicPlaylistsProps) {
  const publicPlaylists = playlists.filter((playlist) => playlist.visibility === "public" && !playlist.isSystem);
  const popular = byMovieCount(publicPlaylists);
  const trending = byUpdated(publicPlaylists);
  const newest = byCreated(publicPlaylists);
  const topMovies = topSavedMovies(publicPlaylists);

  return (
    <PageShell eyebrow="Public Playlists" title="Discover movie playlists">
      {publicPlaylists.length === 0 ? (
        <section className="empty-playlists-panel cinematic-empty">
          <div className="empty-poster-wall" aria-hidden="true">
            {Array.from({ length: 6 }).map((_, index) => <span key={index} />)}
          </div>
          <div className="empty-copy">
            <span className="eyebrow">Public shelf</span>
            <h2>Public playlists will appear here.</h2>
          </div>
        </section>
      ) : null}

      <section className="discovery-section">
        <div className="discovery-section-heading">
          <h2>Top 100 Most Saved Movies</h2>
        </div>
        {topMovies.length > 0 ? (
          <div className="top-movie-strip">
            {topMovies.slice(0, 12).map((movie, index) => (
              <button className="top-movie-card reset-button" key={movie.tmdbId} onClick={() => onNavigate(`/movies/${movie.tmdbId}`)} type="button">
                <span>{index + 1}</span>
                {movie.posterUrl ? <img alt={`${movie.title} poster`} src={movie.posterUrl} /> : <i />}
                <strong>{movie.title}</strong>
                <small>{movie.saves} saves</small>
              </button>
            ))}
          </div>
        ) : (
          <p className="empty-state">Top movies will appear as public playlists grow.</p>
        )}
      </section>

      <div className="discovery-grid">
        <DiscoveryShelf title="Top Public Playlists" playlists={popular} onNavigate={onNavigate} />
        <DiscoveryShelf title="Trending Public Playlists" playlists={trending} onNavigate={onNavigate} />
        <DiscoveryShelf title="Most Shared Playlists" playlists={popular} onNavigate={onNavigate} />
        <DiscoveryShelf title="Most Viewed Playlists" playlists={trending} onNavigate={onNavigate} />
        <DiscoveryShelf title="Recently Created Public Playlists" playlists={newest} onNavigate={onNavigate} />
        <DiscoveryShelf title="Recommended For You" playlists={popular} onNavigate={onNavigate} />
      </div>

      {publicPlaylists.length > 0 ? (
        <div className="clone-action-row">
          {publicPlaylists.slice(0, 6).map((playlist) => (
            <button className="secondary-button" key={playlist.id} onClick={() => clonePlaylist(playlist.id)} type="button">
              Clone {playlist.name}
            </button>
          ))}
        </div>
      ) : null}
    </PageShell>
  );
}
