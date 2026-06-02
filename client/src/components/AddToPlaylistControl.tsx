import { useState } from "react";
import type { MovieDetails, MovieSearchResult, Playlist } from "../types";

interface AddToPlaylistControlProps {
  movie: MovieSearchResult | MovieDetails;
  playlists: Playlist[];
  addToPlaylist: (playlistId: string, movie: MovieSearchResult | MovieDetails) => void | Promise<void>;
}

export function AddToPlaylistControl({ movie, playlists, addToPlaylist }: AddToPlaylistControlProps) {
  const [message, setMessage] = useState("");

  if (playlists.length === 0) {
    return <span className="helper-text">Create a playlist first.</span>;
  }

  return (
    <div className="select-action-stack">
      <label className="select-action">
        <span>Add to</span>
        <select
          defaultValue=""
          onChange={async (event) => {
            const playlistId = event.target.value;
            if (!playlistId) return;
            setMessage("");
            try {
              await addToPlaylist(playlistId, movie);
              setMessage("Added to playlist.");
              event.target.value = "";
            } catch (error) {
              setMessage(error instanceof Error ? error.message : "Could not add this title. Please try again.");
            }
          }}
        >
          <option value="">Choose playlist</option>
          {playlists.map((playlist) => (
            <option key={playlist.id} value={playlist.id}>
              {playlist.name}
            </option>
          ))}
        </select>
      </label>
      {message ? <small className={message.startsWith("Added") ? "success-text" : "error-text"}>{message}</small> : null}
    </div>
  );
}
