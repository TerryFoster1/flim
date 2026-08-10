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
  createSharedLink?: (playlistId: string) => Promise<{ sharedSlug: string; visibility: "shared" | "public"; expiresAt?: string }>;
  removeMovie: (playlistId: string, tmdbId: number, mediaType?: string) => void | Promise<void>;
  updateWatchStatus: (playlistId: string, tmdbId: number, watchStatus: WatchStatus, mediaType?: string) => void | Promise<void>;
  relatedPlaylists?: Playlist[];
}

const PLAYLIST_VISIBILITY_OPTIONS: Array<{ value: Playlist["visibility"]; label: string; helper: string }> = [
  { value: "private", label: "Private", helper: "Only you can view and edit." },
  { value: "shared", label: "Shared", helper: "Invite collaborators to edit titles." },
  { value: "public", label: "Public", helper: "Anyone can view. Collaborators can edit." },
];

const PLAYLIST_VISIBILITY_HELP: Record<Playlist["visibility"], string> = {
  private: "Private playlists are only visible to you.",
  shared: "Shared playlists stay hidden from public discovery. Invited collaborators can add, remove, and reorder titles.",
  public: "Public playlists can be discovered by anyone. Owner and invited collaborators can edit titles.",
};

const VISIBILITY_TRANSITION_CONFIRM: Record<Playlist["visibility"], string> = {
  private: "Changing this playlist to Private will hide it from collaborators and public viewers. Continue?",
  shared: "Changing this playlist to Shared keeps it hidden from public discovery and allows invited collaborators to edit titles. Continue?",
  public: "Making this playlist Public lets anyone view it. Existing collaborators can still edit titles. Continue?",
};

function playlistTitleKey(movie: { tmdbId: number; mediaType?: string }) {
  return `${movie.mediaType || "movie"}-${movie.tmdbId}`;
}

function playlistPath(playlist: Playlist) {
  return playlist.visibility === "public" && playlist.publicSlug ? `/p/${playlist.publicSlug}` : `/playlists/${playlist.id}`;
}

function getRelatedPlaylists(playlist: Playlist, candidates: Playlist[] = []) {
  const sourceKeys = new Set(playlist.movies.map(playlistTitleKey));
  if (sourceKeys.size === 0) return [];

  return candidates
    .filter((candidate) => candidate.id !== playlist.id && candidate.visibility === "public" && candidate.movies.length > 0)
    .map((candidate) => {
      const sharedTitleCount = candidate.movies.reduce((count, movie) => count + (sourceKeys.has(playlistTitleKey(movie)) ? 1 : 0), 0);
      return { playlist: candidate, sharedTitleCount };
    })
    .filter((item) => item.sharedTitleCount > 0)
    .sort((a, b) => b.sharedTitleCount - a.sharedTitleCount || (b.playlist.followerCount || 0) - (a.playlist.followerCount || 0) || a.playlist.name.localeCompare(b.playlist.name))
    .slice(0, 6);
}

export function PlaylistDetails({ playlist, onNavigate, addToPlaylist, deletePlaylist, updatePlaylist, createSharedLink, removeMovie, updateWatchStatus, relatedPlaylists = [] }: PlaylistDetailsProps) {
  const canAddTitles = !playlist.isSystem && Boolean(playlist.isOwner || playlist.canAddTitles);
  const canRemoveTitles = !playlist.isSystem && Boolean(playlist.isOwner || playlist.canRemoveTitles);
  const canEditPlaylist = !playlist.isSystem && Boolean(playlist.isOwner || playlist.canEditPlaylist);
  const [showAddMovie, setShowAddMovie] = useState(canAddTitles && playlist.movies.length === 0);
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
  const editable = canEditPlaylist;
  const shareable = playlist.visibility === "public";
  const sharedAccess = playlist.visibility === "shared" || playlist.accessMode === "shared";
  const followerCount = playlist.followerCount || 0;
  const likeCount = playlist.likeCount || 0;
  const related = getRelatedPlaylists(playlist, relatedPlaylists);

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
    if (playlist.visibility !== editForm.visibility && !window.confirm(VISIBILITY_TRANSITION_CONFIRM[editForm.visibility])) {
      return;
    }
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

  return (
    <section className="route-page">
      <PlaylistHero
        playlist={playlist}
        secondaryMeta={shareable || sharedAccess || editable ? (
          <>
            {shareable ? <span>{followerCount} {followerCount === 1 ? "follower" : "followers"}</span> : null}
            {shareable ? <span>{likeCount} {likeCount === 1 ? "like" : "likes"}</span> : null}
            {sharedAccess && !shareable ? <span>Shared Playlist</span> : null}
            <SharePlaylistButton label="Share Playlist" onCreateSharedLink={editable ? createSharedLink : undefined} onMakePublic={editable ? makePublicForShare : undefined} playlist={playlist} />
          </>
        ) : undefined}
      />
      <div className="playlist-management-bar">
        {canAddTitles ? (
          <div className="button-row">
            <button className="primary-button" onClick={() => setShowAddMovie((current) => !current)} type="button">
              Add Title
            </button>
          </div>
        ) : shareable ? (
          <SharePlaylistButton playlist={playlist} label="Share Playlist" />
        ) : (
          <span className="system-playlist-badge">{playlist.isSystem ? "System Playlist" : "View Only"}</span>
        )}
        {editable ? <div className="playlist-overflow">
          <button className="playlist-menu-button" aria-expanded={showPlaylistMenu} aria-label="Playlist options" onClick={() => setShowPlaylistMenu((current) => !current)} type="button">
            ...
          </button>
          {showPlaylistMenu ? (
            <div className="playlist-menu-panel">
              {editable ? <button onClick={openEditPlaylist} type="button">Edit Playlist</button> : null}
              {editable ? <button className="danger-menu-item" onClick={confirmDelete} type="button">Delete Playlist</button> : null}
            </div>
          ) : null}
        </div> : null}
      </div>
      {notice ? <p className={noticeType === "success" ? "success-message" : "error-message"}>{notice}</p> : null}
      {showEditPlaylist ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Edit playlist">
          <form className="search-modal playlist-edit-modal" onSubmit={savePlaylist}>
            <div className="modal-header">
              <div>
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
            <div className="visibility-picker">
              <span className="visibility-picker-label">Visibility</span>
              <div className="visibility-options" role="radiogroup" aria-label="Playlist visibility">
                {PLAYLIST_VISIBILITY_OPTIONS.map((option) => (
                  <button
                    aria-pressed={editForm.visibility === option.value}
                    className={`visibility-option ${editForm.visibility === option.value ? "active" : ""}`}
                    key={option.value}
                    onClick={() => setEditForm((current) => ({ ...current, visibility: option.value }))}
                    type="button"
                  >
                    <strong>{option.label}</strong>
                    <small>{option.helper}</small>
                  </button>
                ))}
              </div>
              <p className="helper-text">{PLAYLIST_VISIBILITY_HELP[editForm.visibility]}</p>
            </div>
            <div className="button-row">
              <button className="primary-button" disabled={isSavingEdit} type="submit">{isSavingEdit ? "Saving..." : "Save Playlist"}</button>
              <button className="secondary-button" onClick={() => setShowEditPlaylist(false)} type="button">Cancel</button>
            </div>
          </form>
        </div>
      ) : null}
      {showAddMovie ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Add title to playlist">
          <div className="search-modal">
            <div className="modal-header">
              <div>
                <h2>Search for a title</h2>
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
      <div className="playlist-title-list-heading">
        <h2>Titles in this playlist</h2>
        <p>{playlist.movies.length} {playlist.movies.length === 1 ? "title" : "titles"} curated here.</p>
      </div>
      <MovieGrid
        movies={playlist.movies}
        emptyMessage={playlist.isSystem ? "This system playlist will fill automatically as Flim learns more from your activity." : "No titles in this playlist yet."}
        onNavigate={onNavigate}
        onRemove={canRemoveTitles ? removeMovie : undefined}
        onWatchStatusChange={editable ? updateWatchStatus : undefined}
        playlistId={playlist.id}
      />
      {related.length > 0 ? (
        <section className="related-playlists-section">
          <div className="shelf-header">
            <h2>Related Playlists</h2>
          </div>
          <div className="related-playlists-row">
            {related.map(({ playlist: relatedPlaylist, sharedTitleCount }) => (
              <article className="related-playlist-card" key={relatedPlaylist.id}>
                <button className="playlist-card-button reset-button" onClick={() => onNavigate(playlistPath(relatedPlaylist))} type="button">
                  <div className="playlist-cover poster-collage" aria-hidden="true">
                    {relatedPlaylist.movies.slice(0, 4).map((movie) => (
                      movie.posterUrl
                        ? <img alt="" decoding="async" key={`${movie.mediaType || "movie"}-${movie.tmdbId}`} loading="lazy" src={movie.posterUrl} />
                        : <span key={`${movie.mediaType || "movie"}-${movie.tmdbId}`} />
                    ))}
                  </div>
                  <div className="related-playlist-copy">
                    <h3>{relatedPlaylist.name}</h3>
                    <p>{sharedTitleCount} shared {sharedTitleCount === 1 ? "title" : "titles"} with this playlist.</p>
                    <span>{relatedPlaylist.movies.length} {relatedPlaylist.movies.length === 1 ? "Title" : "Titles"}</span>
                  </div>
                </button>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </section>
  );
}
