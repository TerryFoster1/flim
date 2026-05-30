import { MovieGrid } from "../components/MovieGrid";
import { PageShell } from "../components/PageShell";
import type { Playlist, WatchStatus } from "../types";

interface ProfileWatchedProps {
  playlists: Playlist[];
  onNavigate: (path: string) => void;
  updateWatchStatus: (playlistId: string, tmdbId: number, watchStatus: WatchStatus) => void;
}

export function ProfileWatched({ playlists, onNavigate, updateWatchStatus }: ProfileWatchedProps) {
  const watchedItems = playlists.flatMap((playlist) => playlist.movies.filter((movie) => movie.watchStatus === "watched").map((movie) => ({ playlist, movie })));

  return (
    <PageShell eyebrow="Profile" title="Watch History" description="Watched movies persist locally after refresh.">
      {watchedItems.length === 0 ? <p className="empty-state">No watched movies yet.</p> : null}
      {playlists.map((playlist) => (
        <MovieGrid
          key={playlist.id}
          emptyMessage="No watched movies in this playlist."
          movies={playlist.movies.filter((movie) => movie.watchStatus === "watched")}
          onNavigate={onNavigate}
          onWatchStatusChange={updateWatchStatus}
          playlistId={playlist.id}
        />
      ))}
    </PageShell>
  );
}
