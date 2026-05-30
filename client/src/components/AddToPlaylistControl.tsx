import type { MovieDetails, MovieSearchResult, Playlist } from "../types";

interface AddToPlaylistControlProps {
  movie: MovieSearchResult | MovieDetails;
  playlists: Playlist[];
  addToPlaylist: (playlistId: string, movie: MovieSearchResult | MovieDetails) => void;
}

export function AddToPlaylistControl({ movie, playlists, addToPlaylist }: AddToPlaylistControlProps) {
  if (playlists.length === 0) {
    return <span className="helper-text">Create a playlist first.</span>;
  }

  return (
    <label className="select-action">
      <span>Add to</span>
      <select
        defaultValue=""
        onChange={(event) => {
          if (event.target.value) {
            addToPlaylist(event.target.value, movie);
            event.target.value = "";
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
  );
}
