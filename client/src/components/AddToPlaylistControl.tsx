import { useState } from "react";
import type { MovieDetails, MovieSearchResult, Playlist } from "../types";

interface AddToPlaylistControlProps {
  movie: MovieSearchResult | MovieDetails;
  playlists: Playlist[];
  addToPlaylist: (playlistId: string, movie: MovieSearchResult | MovieDetails) => void | Promise<void>;
  currentPlaylistId?: string;
  collapsedLabel?: string;
}

export function AddToPlaylistControl({ movie, playlists, addToPlaylist, currentPlaylistId, collapsedLabel = "Add to other playlists" }: AddToPlaylistControlProps) {
  const addTargetPlaylists = currentPlaylistId ? playlists.filter((playlist) => playlist.id !== currentPlaylistId) : playlists;
  const existingPlaylistIds = addTargetPlaylists
    .filter((playlist) => playlist.movies.some((item) => item.tmdbId === movie.tmdbId && (item.mediaType || "movie") === (movie.mediaType || "movie")))
    .map((playlist) => playlist.id);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [locallyAddedIds, setLocallyAddedIds] = useState<string[]>([]);
  const alreadyAddedIds = [...new Set([...existingPlaylistIds, ...locallyAddedIds])];

  if (addTargetPlaylists.length === 0) {
    return <span className="helper-text">{currentPlaylistId ? "This title is already in the current playlist." : "Create a playlist first."}</span>;
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
    const playlistIds = selectedIds.filter((id) => !alreadyAddedIds.includes(id));
    if (playlistIds.length === 0) {
      setMessage("Choose at least one playlist.");
      return;
    }

    setIsSaving(true);
    setMessage("");
    try {
      await Promise.all(playlistIds.map((playlistId) => addToPlaylist(playlistId, movie)));
      setMessage(`Added to ${playlistIds.length} playlist${playlistIds.length === 1 ? "" : "s"}.`);
      setLocallyAddedIds((current) => [...new Set([...current, ...playlistIds])]);
      setSelectedIds([]);
    } catch {
      setMessage("Unable to add movie. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  async function addSinglePlaylist(playlistId: string) {
    if (alreadyAddedIds.includes(playlistId)) {
      setMessage("Already added to that playlist.");
      return;
    }

    const playlist = addTargetPlaylists.find((item) => item.id === playlistId);
    setIsSaving(true);
    setMessage("");
    try {
      await addToPlaylist(playlistId, movie);
      setMessage(`Added to ${playlist?.name || "playlist"}.`);
      setLocallyAddedIds((current) => [...new Set([...current, playlistId])]);
    } catch {
      setMessage("Unable to add movie. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  if (currentPlaylistId) {
    return (
      <div className="add-playlists-panel compact-add-panel">
        <button className="secondary-button compact-add-toggle" onClick={() => setIsExpanded((current) => !current)} type="button">
          {collapsedLabel}
        </button>
        {isExpanded ? (
          <div className="compact-playlist-menu" aria-label="Other playlists">
            {addTargetPlaylists.map((playlist) => {
              const alreadyAdded = alreadyAddedIds.includes(playlist.id);
              return (
                <button
                  className={alreadyAdded ? "compact-playlist-option already-added" : "compact-playlist-option"}
                  disabled={alreadyAdded || isSaving}
                  key={playlist.id}
                  onClick={() => addSinglePlaylist(playlist.id)}
                  type="button"
                >
                  <span>{playlist.name}</span>
                  <small>{alreadyAdded ? "Already added" : `${playlist.movies.length} titles`}</small>
                </button>
              );
            })}
          </div>
        ) : null}
        {message ? <small className={message.startsWith("Added") ? "success-text" : "error-text"}>{message}</small> : null}
      </div>
    );
  }

  return (
    <div className="add-playlists-panel">
      <div className="add-playlists-heading">
        <span>Add to Playlists</span>
        <small>{selectedIds.length} selected</small>
      </div>
      <div className="add-playlist-options">
        {addTargetPlaylists.map((playlist) => {
          const alreadyAdded = alreadyAddedIds.includes(playlist.id);
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
