import { useState } from "react";
import { MovieGrid } from "../components/MovieGrid";
import { MovieSearchPanel } from "../components/MovieSearchPanel";
import { PlaylistHero } from "../components/PlaylistHero";
import { PosterShelf } from "../components/PosterShelf";
import type { MovieSearchResult, Playlist, WatchStatus } from "../types";

interface PlaylistDetailsProps {
  playlist: Playlist;
  onNavigate: (path: string) => void;
  addToPlaylist: (playlistId: string, movie: MovieSearchResult) => void;
  clonePlaylist: (playlistId: string) => void;
  deletePlaylist: (playlistId: string) => void;
  removeMovie: (playlistId: string, tmdbId: number) => void;
  updateWatchStatus: (playlistId: string, tmdbId: number, watchStatus: WatchStatus) => void;
}

export function PlaylistDetails({ playlist, onNavigate, addToPlaylist, clonePlaylist, deletePlaylist, removeMovie, updateWatchStatus }: PlaylistDetailsProps) {
  const [showAddMovie, setShowAddMovie] = useState(playlist.movies.length === 0);
  const [notice, setNotice] = useState("");

  function confirmDelete() {
    if (window.confirm("Delete this playlist? This cannot be undone.")) {
      deletePlaylist(playlist.id);
    }
  }

  return (
    <section className="route-page">
      <PlaylistHero clonePlaylist={clonePlaylist} playlist={playlist} />
      <div className="playlist-management-bar">
        <button className="primary-button" onClick={() => setShowAddMovie((current) => !current)} type="button">
          Add Movie
        </button>
        <button className="danger-button" onClick={confirmDelete} type="button">
          Delete Playlist
        </button>
      </div>
      {notice ? <p className="success-message">{notice}</p> : null}
      {showAddMovie ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Add movie to playlist">
          <div className="search-modal">
            <div className="modal-header">
              <div>
                <span className="eyebrow">Add Movie</span>
                <h2>Search for a movie to add</h2>
              </div>
              <button className="ghost-button" onClick={() => setShowAddMovie(false)} type="button">Close</button>
            </div>
            <MovieSearchPanel
              addToPlaylist={addToPlaylist}
              fixedPlaylistId={playlist.id}
              onMovieAdded={() => {
                setNotice("Movie added to playlist.");
                setShowAddMovie(false);
              }}
              onNavigate={onNavigate}
              playlists={[playlist]}
            />
          </div>
        </div>
      ) : null}
      <PosterShelf
        movies={playlist.movies}
        onNavigate={onNavigate}
        onRemove={removeMovie}
        onWatchStatusChange={updateWatchStatus}
        playlistId={playlist.id}
        title="Movies in this playlist"
      />
      <MovieGrid
        movies={playlist.movies}
        emptyMessage="No movies in this playlist yet. Add a movie to begin."
        onNavigate={onNavigate}
        onRemove={removeMovie}
        onWatchStatusChange={updateWatchStatus}
        playlistId={playlist.id}
      />
    </section>
  );
}
