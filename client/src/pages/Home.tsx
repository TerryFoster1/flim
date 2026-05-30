import { PageShell } from "../components/PageShell";
import { PlaylistGrid } from "../components/PlaylistGrid";
import { PosterShelf } from "../components/PosterShelf";
import type { Playlist } from "../types";

interface HomeProps {
  onNavigate: (path: string) => void;
  playlists: Playlist[];
  notice?: string;
  onDelete?: (playlistId: string) => void | Promise<void>;
}

const curatedPosterUrls = [
  "https://image.tmdb.org/t/p/w500/9gk7adHYeDvHkCSEqAvQNLV5Uge.jpg",
  "https://image.tmdb.org/t/p/w500/qJ2tW6WMUDux911r6m7haRef0WH.jpg",
  "https://image.tmdb.org/t/p/w500/6FfCtAuVAW8XJjZ7eWeLibRLWTw.jpg",
  "https://image.tmdb.org/t/p/w500/8UlWHLMpgZm9bx6QYh0NFoq67TZ.jpg",
  "https://image.tmdb.org/t/p/w500/rCzpDGLbOoPwLjy3OAm5NUPOTrC.jpg",
  "https://image.tmdb.org/t/p/w500/5KCVkau1HEl7ZzfPsKAPM0sMiKc.jpg",
];

function getHeroPosters(playlists: Playlist[]) {
  const savedPosters = playlists.flatMap((playlist) => playlist.movies).map((movie) => movie.posterUrl).filter(Boolean) as string[];
  return [...savedPosters, ...curatedPosterUrls].slice(0, 8);
}

export function Home({ onNavigate, playlists, notice, onDelete }: HomeProps) {
  const heroPosters = getHeroPosters(playlists);
  const recentlyUpdated = [...playlists].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 4);
  const watchedMovies = playlists
    .flatMap((playlist) => playlist.movies)
    .filter((movie) => movie.watchStatus === "watched")
    .slice(0, 12);

  return (
    <section className="route-page">
      <section className="cinema-hero" aria-label="Flim movie poster hero">
        <div className="cinema-poster-wall">
          {heroPosters.map((posterUrl, index) => (
            <img alt="" className={`cinema-poster poster-${index + 1}`} key={`${posterUrl}-${index}`} src={posterUrl} />
          ))}
        </div>
        <div className="cinema-hero-overlay">
          <span className="eyebrow">Flim</span>
          <h1>Your Movie Collections</h1>
          <p>Create, share, and discover movie playlists.</p>
          <div className="button-row">
            <button className="primary-button" onClick={() => onNavigate("/playlists")} type="button">Create Playlist</button>
            <button className="secondary-button" onClick={() => onNavigate("/public")} type="button">Browse Public Lists</button>
          </div>
        </div>
      </section>
      {notice ? <p className="success-message">{notice}</p> : null}

      <PageShell
        eyebrow="My Playlists"
        title="Collections"
        action={<button className="primary-button" onClick={() => onNavigate("/playlists")} type="button">Create Playlist</button>}
      >
      {playlists.length === 0 ? (
        <section className="empty-playlists-panel cinematic-empty">
          <div className="empty-poster-wall" aria-hidden="true">
            {Array.from({ length: 6 }).map((_, index) => <span key={index} />)}
          </div>
          <div className="empty-copy">
            <span className="eyebrow">No playlists yet</span>
            <h2>Create your first collection.</h2>
            <button className="primary-button" onClick={() => onNavigate("/playlists")} type="button">Create Playlist</button>
          </div>
        </section>
      ) : (
        <PlaylistGrid onDelete={onDelete} onNavigate={onNavigate} playlists={playlists} />
      )}
      </PageShell>

      <section className="section-grid two-col">
        <div className="feature-panel">
          <div className="shelf-header">
            <div>
              <span className="eyebrow">Recently viewed</span>
              <h2>Recently updated playlists</h2>
            </div>
          </div>
          {recentlyUpdated.length === 0 ? <p className="empty-state">Create your first playlist.</p> : null}
          {recentlyUpdated.map((playlist) => (
            <button className="playlist-row-button reset-button" key={playlist.id} onClick={() => onNavigate(`/playlists/${playlist.id}`)} type="button">
              <span>{playlist.name}</span>
              <small>{playlist.movies.length} movies</small>
            </button>
          ))}
        </div>
        <div className="feature-panel">
          <PosterShelf movies={watchedMovies} onNavigate={onNavigate} title="Recently watched movies" eyebrow="Watched" />
        </div>
      </section>
    </section>
  );
}
