import { useState } from "react";
import type { MovieDetails, MovieSearchResult, Playlist } from "../types";

interface AddToPlaylistControlProps {
  movie: MovieSearchResult | MovieDetails;
  playlists: Playlist[];
  addToPlaylist: (playlistId: string, movie: MovieSearchResult | MovieDetails) => void | Promise<void>;
}

export function AddToPlaylistControl({ movie, playlists, addToPlaylist }: AddToPlaylistControlProps) {
  const existingPlaylistIds = playlists
    .filter((playlist) => playlist.movies.some((item) => item.tmdbId === movie.tmdbId && (item.mediaType || "movie") === (movie.mediaType || "movie")))
    .map((playlist) => playlist.id);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  if (playlists.length === 0) {
    return <span className="helper-text">Create a playlist first.</span>;
  }

  function togglePlaylist(playlistId: string) {
    setMessage("");
    setSelectedIds((current) =>
      current.includes(playlistId)
        ? current.filter((id) => id !== playlistId)
        : [...current, playlistId],
    );
  }

  async function addSelectedPlaylists() {
    const playlistIds = selectedIds.filter((id) => !existingPlaylistIds.includes(id));
    if (playlistIds.length === 0) {
      setMessage("Choose at least one playlist.");
      return;
    }

    setIsSaving(true);
    setMessage("");
    try {
      await Promise.all(playlistIds.map((playlistId) => addToPlaylist(playlistId, movie)));
      setMessage(`Added to ${playlistIds.length} playlist${playlistIds.length === 1 ? "" : "s"}.`);
      setSelectedIds([]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not add this title. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="add-playlists-panel">
      <div className="add-playlists-heading">
        <span>Add to Playlists</span>
        <small>{selectedIds.length} selected</small>
      </div>
      <div className="add-playlist-options">
        {playlists.map((playlist) => {
          const alreadyAdded = existingPlaylistIds.includes(playlist.id);
          const checked = alreadyAdded || selectedIds.includes(playlist.id);
          return (
            <label className={alreadyAdded ? "add-playlist-option already-added" : "add-playlist-option"} key={playlist.id}>
              <input
                checked={checked}
                disabled={alreadyAdded || isSaving}
                onChange={() => togglePlaylist(playlist.id)}
                type="checkbox"
              />
              <span>{playlist.name}</span>
              <small>{alreadyAdded ? "Already added" : `${playlist.movies.length} titles`}</small>
            </label>
          );
        })}
      </div>
      <div className="add-playlists-actions">
        <button className="secondary-button" disabled={isSaving || selectedIds.length === 0} onClick={() => setSelectedIds([])} type="button">
          Cancel
        </button>
        <button className="primary-button" disabled={isSaving || selectedIds.length === 0} onClick={addSelectedPlaylists} type="button">
          {isSaving ? "Adding..." : "Add to Selected Playlists"}
        </button>
      </div>
      {message ? <small className={message.startsWith("Added") ? "success-text" : "error-text"}>{message}</small> : null}
    </div>
  );
}
