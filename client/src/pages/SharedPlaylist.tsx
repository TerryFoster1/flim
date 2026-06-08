import { useEffect, useState } from "react";
import { PlaylistDetails } from "./PlaylistDetails";
import { addMovieToSharedPlaylist, getSharedPlaylistByToken, removeMovieFromSharedPlaylist } from "../services/apiPlaylistStore";
import type { MovieSearchResult, Playlist, WatchStatus } from "../types";

interface SharedPlaylistProps {
  token: string;
  onNavigate: (path: string) => void;
}

export function SharedPlaylist({ token, onNavigate }: SharedPlaylistProps) {
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "not_found" | "error">("loading");

  async function refreshSharedPlaylist() {
    setStatus("loading");
    try {
      const result = await getSharedPlaylistByToken(token);
      setPlaylist(result);
      setStatus("ready");
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

  return (
    <PlaylistDetails
      playlist={playlist}
      onNavigate={onNavigate}
      addToPlaylist={addToPlaylist}
      deletePlaylist={async () => undefined}
      updatePlaylist={async () => undefined}
      removeMovie={removeFromPlaylist}
      reorderMovies={async () => undefined}
      updateWatchStatus={async (_playlistId: string, _tmdbId: number, _watchStatus: WatchStatus) => undefined}
    />
  );
}
