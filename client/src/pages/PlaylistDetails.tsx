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
      {showAddMovie ? (
        <MovieSearchPanel
          addToPlaylist={addToPlaylist}
          fixedPlaylistId={playlist.id}
          onNavigate={onNavigate}
          playlists={[playlist]}
        />
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
        onNavigate={onNavigate}
        onRemove={removeMovie}
        onWatchStatusChange={updateWatchStatus}
        playlistId={playlist.id}
      />
    </section>
  );
}
