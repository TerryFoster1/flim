import { MovieSearchPanel } from "../components/MovieSearchPanel";
import { PageShell } from "../components/PageShell";
import { PosterShelf } from "../components/PosterShelf";
import type { MovieSearchResult, Playlist } from "../types";

interface DiscoverProps {
  onNavigate: (path: string) => void;
  playlists: Playlist[];
  addToPlaylist: (playlistId: string, movie: MovieSearchResult) => void;
}

export function Discover({ onNavigate, playlists, addToPlaylist }: DiscoverProps) {
  const savedMovies = playlists.flatMap((playlist) => playlist.movies);

  return (
    <PageShell eyebrow="Discover" title="Search and save real movies" description="TMDb-powered search appears here when `VITE_TMDB_API_KEY` is configured.">
      <MovieSearchPanel addToPlaylist={addToPlaylist} onNavigate={onNavigate} playlists={playlists} />
      <PosterShelf movies={savedMovies} onNavigate={onNavigate} title="Movies saved to your playlists" />
      <PosterShelf title="Poster-first empty state" />
    </PageShell>
  );
}
