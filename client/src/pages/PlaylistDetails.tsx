import { useState, type FormEvent } from "react";
import { MovieGrid } from "../components/MovieGrid";
import { MovieSearchPanel } from "../components/MovieSearchPanel";
import { PlaylistHero } from "../components/PlaylistHero";
import { SharePlaylistButton } from "../components/SharePlaylistButton";
import type { MovieSearchResult, Playlist, WatchStatus } from "../types";

interface PlaylistDetailsProps {
  playlist: Playlist;
  onNavigate: (path: string) => void;
  addToPlaylist: (playlistId: string, movie: MovieSearchResult) => void | Promise<void>;
  deletePlaylist: (playlistId: string) => void | Promise<void>;
  updatePlaylist: (playlistId: string, input: Pick<Playlist, "name" | "description" | "visibility">) => Playlist | void | Promise<Playlist | void>;
  removeMovie: (playlistId: string, tmdbId: number, mediaType?: string) => void | Promise<void>;
  reorderMovies: (playlistId: string, movieIds: string[]) => void | Promise<void>;
  updateWatchStatus: (playlistId: string, tmdbId: number, watchStatus: WatchStatus, mediaType?: string) => void | Promise<void>;
}

export function PlaylistDetails({ playlist, onNavigate, addToPlaylist, deletePlaylist, updatePlaylist, removeMovie, reorderMovies, updateWatchStatus }: PlaylistDetailsProps) {
  const [showAddMovie, setShowAddMovie] = useState(!playlist.isSystem && Boolean(playlist.isOwner) && playlist.movies.length === 0);
  const [showPlaylistMenu, setShowPlaylistMenu] = useState(false);
  const [showEditPlaylist, setShowEditPlaylist] = useState(false);
  const [editForm, setEditForm] = useState({
    name: playlist.name,
    description: playlist.description,
    visibility: playlist.visibility,
  });
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [notice, setNotice] = useState("");
  const [noticeType, setNoticeType] = useState<"success" | "error">("success");
  const editable = !playlist.isSystem && Boolean(playlist.isOwner);
  const shareable = playlist.visibility === "public";
  const followerCount = playlist.followerCount || 0;

  async function makePublicForShare() {
    setNotice("");
    try {
      await updatePlaylist(playlist.id, {
        name: playlist.name,
        description: playlist.description,
        visibility: "public",
      });
      setNoticeType("success");
      setNotice("Playlist is public. Share it with the link or QR code.");
    } catch {
      setNoticeType("error");
      setNotice("Unable to make playlist public. Please try again.");
      throw new Error("Unable to make playlist public.");
    }
  }

  function openEditPlaylist() {
    setEditForm({
      name: playlist.name,
      description: playlist.description,
      visibility: playlist.visibility,
    });
    setShowPlaylistMenu(false);
    setShowEditPlaylist(true);
  }

  async function savePlaylist(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSavingEdit(true);
    setNotice("");
    try {
      await updatePlaylist(playlist.id, {
        name: editForm.name,
        description: editForm.description,
        visibility: editForm.visibility,
      });
      setShowEditPlaylist(false);
      setNoticeType("success");
      setNotice("Playlist saved.");
    } catch {
      setNoticeType("error");
      setNotice("Unable to save playlist. Please try again.");
    } finally {
      setIsSavingEdit(false);
    }
  }

  async function confirmDelete() {
    if (window.confirm("Delete this playlist? This cannot be undone.")) {
      await deletePlaylist(playlist.id);
    }
  }

  async function moveMovie(index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= playlist.movies.length) return;

    const nextMovies = [...playlist.movies];
    [nextMovies[index], nextMovies[targetIndex]] = [nextMovies[targetIndex], nextMovies[index]];
    const movieIds = nextMovies.map((movie) => movie.id || "").filter(Boolean);

    if (movieIds.length !== nextMovies.length) {
      setNoticeType("error");
      setNotice("Unable to reorder movies. Please try again.");
      return;
    }

    try {
      await reorderMovies(playlist.id, movieIds);
      setNoticeType("success");
      setNotice("Playlist order saved.");
    } catch {
      setNoticeType("error");
      setNotice("Unable to reorder movies. Please try again.");
    }
  }

  return (
    <section className="route-page">
      <PlaylistHero
        playlist={playlist}
        secondaryMeta={shareable || editable ? (
          <>
            {shareable ? <span>{followerCount} {followerCount === 1 ? "follower" : "followers"}</span> : null}
            <SharePlaylistButton label="Share Playlist" onMakePublic={editable ? makePublicForShare : undefined} playlist={playlist} />
          </>
        ) : undefined}
      />
      <div className="playlist-management-bar">
        {editable ? (
          <div className="button-row">
            <button className="primary-button" onClick={() => setShowAddMovie((current) => !current)} type="button">
              Add Movie or TV Show
            </button>
          </div>
        ) : shareable ? (
          <SharePlaylistButton playlist={playlist} label="Share Playlist" />
        ) : (
          <span className="system-playlist-badge">{playlist.isSystem ? "System Playlist" : "View Only"}</span>
        )}
        <div className="playlist-overflow">
          <button className="playlist-menu-button" aria-expanded={showPlaylistMenu} aria-label="Playlist options" onClick={() => setShowPlaylistMenu((current) => !current)} type="button">
            ...
          </button>
          {showPlaylistMenu ? (
            <div className="playlist-menu-panel">
              {editable ? <button onClick={openEditPlaylist} type="button">Edit Playlist</button> : null}
              {editable ? <button className="danger-menu-item" onClick={confirmDelete} type="button">Delete Playlist</button> : null}
            </div>
          ) : null}
        </div>
      </div>
      {notice ? <p className={noticeType === "success" ? "success-message" : "error-message"}>{notice}</p> : null}
      {showEditPlaylist ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Edit playlist">
          <form className="search-modal playlist-edit-modal" onSubmit={savePlaylist}>
            <div className="modal-header">
              <div>
                <span className="eyebrow">Playlist Settings</span>
                <h2>Edit Playlist</h2>
              </div>
              <button className="ghost-button" onClick={() => setShowEditPlaylist(false)} type="button">Cancel</button>
            </div>
            <label>
              <span>Playlist title</span>
              <input
                maxLength={120}
                onChange={(event) => setEditForm((current) => ({ ...current, name: event.target.value }))}
                required
                value={editForm.name}
              />
            </label>
            <label>
              <span>Description</span>
              <textarea
                maxLength={600}
                onChange={(event) => setEditForm((current) => ({ ...current, description: event.target.value }))}
                value={editForm.description}
              />
            </label>
            <label>
              <span>Visibility</span>
              <select
                onChange={(event) => setEditForm((current) => ({ ...current, visibility: event.target.value as Playlist["visibility"] }))}
                value={editForm.visibility}
              >
                <option value="private">private</option>
                <option value="public">public</option>
              </select>
            </label>
            <div className="button-row">
              <button className="primary-button" disabled={isSavingEdit} type="submit">{isSavingEdit ? "Saving..." : "Save Playlist"}</button>
              <button className="secondary-button" onClick={() => setShowEditPlaylist(false)} type="button">Cancel</button>
            </div>
          </form>
        </div>
      ) : null}
      {showAddMovie ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Add movie to playlist">
          <div className="search-modal">
            <div className="modal-header">
              <div>
                <span className="eyebrow">Add Title</span>
                <h2>Search for a movie or TV show</h2>
              </div>
              <button className="ghost-button" onClick={() => setShowAddMovie(false)} type="button">Done</button>
            </div>
            <MovieSearchPanel
              addToPlaylist={addToPlaylist}
              fixedPlaylistId={playlist.id}
              onMovieAdded={() => {
                setNoticeType("success");
                setNotice("Title added to playlist.");
              }}
              onNavigate={onNavigate}
              playlists={[playlist]}
            />
          </div>
        </div>
      ) : null}
      <MovieGrid
        movies={playlist.movies}
        emptyMessage={playlist.isSystem ? "This system playlist will fill automatically as Flim learns more from your activity." : "No titles in this playlist yet."}
        onNavigate={onNavigate}
        onRemove={editable ? removeMovie : undefined}
        onReorder={editable ? moveMovie : undefined}
        onWatchStatusChange={editable ? updateWatchStatus : undefined}
        playlistId={playlist.id}
      />
    </section>
  );
}
