import { useState } from "react";
import type { MovieDetails, MovieSearchResult, Playlist } from "../types";
import { enqueueTitleTrivia } from "../services/triviaService";

interface AddToPlaylistControlProps {
  movie: MovieSearchResult | MovieDetails;
  playlists: Playlist[];
  addToPlaylist: (playlistId: string, movie: MovieSearchResult | MovieDetails) => void | Promise<void>;
  currentPlaylistId?: string;
  collapsedLabel?: string;
  openLabel?: string;
  onCreatePlaylist?: (input: Pick<Playlist, "name" | "description" | "visibility">) => Promise<Playlist>;
}

export function AddToPlaylistControl({ movie, playlists, addToPlaylist, currentPlaylistId, collapsedLabel = "Add to other playlists", openLabel, onCreatePlaylist }: AddToPlaylistControlProps) {
  const addTargetPlaylists = currentPlaylistId ? playlists.filter((playlist) => playlist.id !== currentPlaylistId) : playlists;
  const existingPlaylistIds = addTargetPlaylists
    .filter((playlist) => playlist.movies.some((item) => item.tmdbId === movie.tmdbId && (item.mediaType || "movie") === (movie.mediaType || "movie")))
    .map((playlist) => playlist.id);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [isCreatingPlaylist, setIsCreatingPlaylist] = useState(false);
  const [locallyAddedIds, setLocallyAddedIds] = useState<string[]>([]);
  const alreadyAddedIds = [...new Set([...existingPlaylistIds, ...locallyAddedIds])];
  const cleanQuery = query.trim().toLowerCase();
  const visiblePlaylists = addTargetPlaylists.filter((playlist) => playlist.name.toLowerCase().includes(cleanQuery));
  const recentPlaylists = [...visiblePlaylists]
    .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime())
    .slice(0, 3);
  const recentIds = new Set(recentPlaylists.map((playlist) => playlist.id));
  const remainingPlaylists = cleanQuery ? visiblePlaylists : visiblePlaylists.filter((playlist) => !recentIds.has(playlist.id));

  async function createPlaylistAndAdd() {
    if (!onCreatePlaylist) return;
    const cleanName = newPlaylistName.trim();
    if (!cleanName) {
      setMessage("Name the playlist first.");
      return;
    }
    setIsCreatingPlaylist(true);
    setMessage("");
    try {
      const created = await onCreatePlaylist({ name: cleanName, description: `Saved from ${movie.title}.`, visibility: "private" });
      await addToPlaylist(created.id, movie);
      enqueueTitleTrivia({ mediaType: movie.mediaType || "movie", tmdbId: movie.tmdbId, source: "playlist_add" });
      setNewPlaylistName("");
      setLocallyAddedIds((current) => [...new Set([...current, created.id])]);
      setMessage(`Created ${created.name} and added ${movie.title}.`);
    } catch {
      setMessage("Unable to create that playlist. Please try again.");
    } finally {
      setIsCreatingPlaylist(false);
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
      enqueueTitleTrivia({ mediaType: movie.mediaType || "movie", tmdbId: movie.tmdbId, source: "playlist_add" });
      setMessage(`Added to ${playlist?.name || "playlist"}.`);
      setLocallyAddedIds((current) => [...new Set([...current, playlistId])]);
    } catch {
      setMessage("Unable to add this title. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  function PlaylistOption({ playlist }: { playlist: Playlist }) {
    const alreadyAdded = alreadyAddedIds.includes(playlist.id);

    return (
      <button
        className={alreadyAdded ? "playlist-sheet-option already-added" : "playlist-sheet-option"}
        disabled={alreadyAdded || isSaving}
        onClick={() => addSinglePlaylist(playlist.id)}
        type="button"
      >
        <span>
          <strong>{playlist.name}</strong>
          <small>{alreadyAdded ? "Already added" : `${playlist.movies.length} title${playlist.movies.length === 1 ? "" : "s"}`}</small>
        </span>
        <em>{alreadyAdded ? "Added" : "Add"}</em>
      </button>
    );
  }

  return (
    <div className={currentPlaylistId ? "add-playlists-panel compact-add-panel" : "add-playlists-panel"}>
      <button className="primary-button add-playlist-open" onClick={() => setIsOpen(true)} type="button">
        {openLabel || (currentPlaylistId ? collapsedLabel : "Add To Playlist")}
      </button>

      {isOpen ? (
        <div className="playlist-add-sheet-backdrop" role="presentation">
          <div className="playlist-add-sheet" aria-label={`Add ${movie.title} to playlist`} aria-modal="true" role="dialog">
            <div className="playlist-add-sheet-header">
              <div>
                <h2>Add To Playlist</h2>
                <p>Tap a playlist to add this title.</p>
              </div>
              <button className="secondary-button sheet-close-button" onClick={() => setIsOpen(false)} type="button">
                Done
              </button>
            </div>

            <label className="playlist-sheet-search">
              <span>Search Playlists</span>
              <input
                autoFocus
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search playlists..."
                type="search"
                value={query}
              />
            </label>

            {message ? <small className={(message.startsWith("Added") || message.startsWith("Created")) ? "success-text" : "error-text"}>{message}</small> : null}

            {onCreatePlaylist ? (
              <section className="playlist-sheet-section playlist-sheet-create-section">
                <h3>Create New Playlist</h3>
                <div className="playlist-sheet-create-row">
                  <input
                    onChange={(event) => setNewPlaylistName(event.target.value)}
                    placeholder="New playlist name"
                    type="text"
                    value={newPlaylistName}
                  />
                  <button className="secondary-button" disabled={isCreatingPlaylist} onClick={createPlaylistAndAdd} type="button">
                    {isCreatingPlaylist ? "Creating..." : "Create + Add"}
                  </button>
                </div>
              </section>
            ) : null}

            {recentPlaylists.length > 0 ? (
              <section className="playlist-sheet-section">
                <h3>Recent Playlists</h3>
                <div className="playlist-sheet-options">
                  {recentPlaylists.map((playlist) => (
                    <PlaylistOption key={playlist.id} playlist={playlist} />
                  ))}
                </div>
              </section>
            ) : null}

            <section className="playlist-sheet-section">
              <h3>All Playlists</h3>
              {visiblePlaylists.length === 0 ? (
                <p className="helper-text">No playlists match that search. Create a new playlist above or try another search.</p>
              ) : remainingPlaylists.length === 0 ? (
                <p className="helper-text">Recent playlists are shown above.</p>
              ) : (
                <div className="playlist-sheet-options">
                  {remainingPlaylists.map((playlist) => (
                    <PlaylistOption key={playlist.id} playlist={playlist} />
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      ) : null}

      {!isOpen && message ? <small className={(message.startsWith("Added") || message.startsWith("Created")) ? "success-text" : "error-text"}>{message}</small> : null}
    </div>
  );
}
