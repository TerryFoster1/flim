import { PageShell } from "../components/PageShell";
import { PlaylistGrid } from "../components/PlaylistGrid";
import { PosterShelf } from "../components/PosterShelf";
import type { Playlist } from "../types";

interface HomeProps {
  onNavigate: (path: string) => void;
  playlists: Playlist[];
  notice?: string;
  onDelete?: (playlistId: string) => void;
}

const playlistExamples = ["Movies With Anthony", "Date Night", "80s Action", "Movies To Watch", "Family Movie Night"];

export function Home({ onNavigate, playlists, notice, onDelete }: HomeProps) {
  const recentlyUpdated = [...playlists].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 4);
  const watchedMovies = playlists
    .flatMap((playlist) => playlist.movies)
    .filter((movie) => movie.watchStatus === "watched")
    .slice(0, 12);

  return (
    <PageShell
      eyebrow="My Playlists"
      title="Your movie collections"
      description="Build poster-first playlists for the movies you want to remember, watch, and share."
      action={<button className="primary-button" onClick={() => onNavigate("/playlists")} type="button">Create Playlist</button>}
    >
      {notice ? <p className="success-message">{notice}</p> : null}
      {playlists.length === 0 ? (
        <section className="empty-playlists-panel">
          <div>
            <span className="eyebrow">Start with a list</span>
            <h2>Create Your First Playlist</h2>
            <p>Give the list a name, choose visibility, then add movies from inside the playlist.</p>
            <button className="primary-button" onClick={() => onNavigate("/playlists")} type="button">Create Playlist</button>
          </div>
          <div className="example-list" aria-label="Playlist examples">
            {playlistExamples.map((example) => (
              <span key={example}>{example}</span>
            ))}
          </div>
        </section>
      ) : (
        <PlaylistGrid onDelete={onDelete} onNavigate={onNavigate} playlists={playlists} />
      )}

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
    </PageShell>
  );
}
