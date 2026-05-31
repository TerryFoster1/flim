import { useState } from "react";
import { MovieGrid } from "../components/MovieGrid";
import { MovieSearchPanel } from "../components/MovieSearchPanel";
import { PlaylistHero } from "../components/PlaylistHero";
import { PosterShelf } from "../components/PosterShelf";
import { ClonePlaylistButton } from "../components/ClonePlaylistButton";
import { SharePlaylistButton } from "../components/SharePlaylistButton";
import type { MovieSearchResult, Playlist, WatchStatus } from "../types";

interface PlaylistDetailsProps {
  playlist: Playlist;
  onNavigate: (path: string) => void;
  addToPlaylist: (playlistId: string, movie: MovieSearchResult) => void | Promise<void>;
  clonePlaylist: (playlistId: string) => void | Promise<void>;
  deletePlaylist: (playlistId: string) => void | Promise<void>;
  removeMovie: (playlistId: string, tmdbId: number) => void | Promise<void>;
  updateWatchStatus: (playlistId: string, tmdbId: number, watchStatus: WatchStatus) => void | Promise<void>;
}

export function PlaylistDetails({ playlist, onNavigate, addToPlaylist, clonePlaylist, deletePlaylist, removeMovie, updateWatchStatus }: PlaylistDetailsProps) {
  const [showAddMovie, setShowAddMovie] = useState(playlist.movies.length === 0);
  const [showPlaylistMenu, setShowPlaylistMenu] = useState(false);
  const [notice, setNotice] = useState("");

  async function confirmDelete() {
    if (window.confirm("Delete this playlist? This cannot be undone.")) {
      await deletePlaylist(playlist.id);
    }
  }

  return (
    <section className="route-page">
      <PlaylistHero playlist={playlist} />
      <div className="playlist-management-bar">
        <button className="primary-button" onClick={() => setShowAddMovie((current) => !current)} type="button">
          Add Movie
        </button>
        <div className="playlist-overflow">
          <button className="playlist-menu-button" aria-expanded={showPlaylistMenu} aria-label="Playlist options" onClick={() => setShowPlaylistMenu((current) => !current)} type="button">
            ...
          </button>
          {showPlaylistMenu ? (
            <div className="playlist-menu-panel">
              <button disabled type="button">Edit Playlist</button>
              <button disabled type="button">Rename Playlist</button>
              <button disabled type="button">Change Visibility</button>
              <SharePlaylistButton playlist={playlist} />
              <button disabled type="button">Generate QR Code</button>
              <ClonePlaylistButton onClone={() => clonePlaylist(playlist.id)} />
              <button disabled type="button">Remove Movies</button>
              <button disabled type="button">Manage Playlist</button>
              <button className="danger-menu-item" onClick={confirmDelete} type="button">Delete Playlist</button>
            </div>
          ) : null}
        </div>
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
