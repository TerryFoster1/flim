import { MovieGrid } from "../components/MovieGrid";
import { PlaylistHero } from "../components/PlaylistHero";
import { PosterShelf } from "../components/PosterShelf";
import type { Playlist, WatchStatus } from "../types";

interface PlaylistDetailsProps {
  playlist: Playlist;
  onNavigate: (path: string) => void;
  clonePlaylist: (playlistId: string) => void;
  removeMovie: (playlistId: string, tmdbId: number) => void;
  updateWatchStatus: (playlistId: string, tmdbId: number, watchStatus: WatchStatus) => void;
}

export function PlaylistDetails({ playlist, onNavigate, clonePlaylist, removeMovie, updateWatchStatus }: PlaylistDetailsProps) {
  return (
    <section className="route-page">
      <PlaylistHero clonePlaylist={clonePlaylist} playlist={playlist} />
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
