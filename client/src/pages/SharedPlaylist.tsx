import { useEffect, useState } from "react";
import { PlaylistDetails } from "./PlaylistDetails";
import { acceptSharedPlaylistInvite, addMovieToSharedPlaylist, getSharedPlaylistByToken, removeMovieFromSharedPlaylist } from "../services/apiPlaylistStore";
import type { MovieSearchResult, Playlist, WatchStatus } from "../types";

interface SharedPlaylistProps {
  token: string;
  onNavigate: (path: string) => void;
}

export function SharedPlaylist({ token, onNavigate }: SharedPlaylistProps) {
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "invite" | "accepting" | "not_found" | "error">("loading");
  const [inviteMessage, setInviteMessage] = useState("");

  async function refreshSharedPlaylist() {
    setStatus("loading");
    try {
      const result = await getSharedPlaylistByToken(token);
      setPlaylist(result);
      setStatus(result.accessMode === "invite" ? "invite" : "ready");
    } catch {
      setPlaylist(null);
      setStatus("not_found");
    }
  }

  useEffect(() => {
    refreshSharedPlaylist();
  }, [token]);

  async function addToPlaylist(_playlistId: string, movie: MovieSearchResult) {
    await addMovieToSharedPlaylist(token, movie);
    await refreshSharedPlaylist();
  }

  async function acceptInvite() {
    setInviteMessage("");
    setStatus("accepting");
    try {
      await acceptSharedPlaylistInvite(token);
      await refreshSharedPlaylist();
    } catch (error) {
      setStatus("invite");
      setInviteMessage(error instanceof Error ? error.message : "Unable to accept this playlist invite. Please try again.");
    }
  }

  async function removeFromPlaylist(_playlistId: string, tmdbId: number, mediaType = "movie") {
    await removeMovieFromSharedPlaylist(token, tmdbId, mediaType);
    await refreshSharedPlaylist();
  }

  if (status === "loading") {
    return (
      <section className="route-page">
        <div className="page-heading">
          <h1>Loading shared playlist...</h1>
        </div>
      </section>
    );
  }

  if (status === "not_found" || !playlist) {
    return (
      <section className="route-page">
        <div className="page-heading">
          <h1>Shared playlist not found</h1>
          <p>This shared link may have been changed or the playlist may no longer be shared.</p>
        </div>
      </section>
    );
  }

  if (status === "invite" || status === "accepting") {
    return (
      <section className="route-page">
        <div className="shared-invite-panel">
          <div>
            <p className="shared-invite-label">Playlist Invite</p>
            <h1>{playlist.name}</h1>
            {playlist.description ? <p>{playlist.description}</p> : null}
            {playlist.inviteExpiresAt ? <p className="helper-text">Invite expires {new Date(playlist.inviteExpiresAt).toLocaleDateString()}.</p> : null}
          </div>
          <p className="helper-text">Accept this invite to view and edit titles with the playlist owner. Collaborators cannot delete the playlist, change privacy, or manage collaborators.</p>
          <button className="primary-button" disabled={status === "accepting"} onClick={acceptInvite} type="button">
            {status === "accepting" ? "Accepting..." : "Accept Invite"}
          </button>
          {inviteMessage ? <p className="error-message">{inviteMessage}</p> : null}
        </div>
      </section>
    );
  }

  return (
    <PlaylistDetails
      playlist={playlist}
      onNavigate={onNavigate}
      addToPlaylist={addToPlaylist}
      deletePlaylist={async () => undefined}
      updatePlaylist={async () => undefined}
      removeMovie={removeFromPlaylist}
      updateWatchStatus={async (_playlistId: string, _tmdbId: number, _watchStatus: WatchStatus) => undefined}
    />
  );
}
