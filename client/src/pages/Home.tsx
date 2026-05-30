import { GenreChip } from "../components/GenreChip";
import { MovieSearchPanel } from "../components/MovieSearchPanel";
import { PosterShelf } from "../components/PosterShelf";
import type { MovieSearchResult, Playlist } from "../types";

interface HomeProps {
  onNavigate: (path: string) => void;
  playlists: Playlist[];
  addToPlaylist: (playlistId: string, movie: MovieSearchResult) => void;
}

export function Home({ onNavigate, playlists, addToPlaylist }: HomeProps) {
  const savedMovies = playlists.flatMap((playlist) => playlist.movies);

  return (
    <section className="route-page">
      <div className="hero home-hero">
        <div className="hero-copy">
          <span className="eyebrow">Search first, playlist next</span>
          <h1>What movie are you looking for?</h1>
          <p>Search for a movie, open details, then save it into a playlist before the recommendation gets forgotten.</p>
          <MovieSearchPanel addToPlaylist={addToPlaylist} onNavigate={onNavigate} playlists={playlists} variant="hero" />
        </div>
        <div className="hero-posters" aria-label="Poster placeholder collage">
          <div className="poster tall tone-red" />
          <div className="poster tone-blue" />
          <div className="poster tall tone-green" />
          <div className="poster tone-gold" />
        </div>
      </div>
      <PosterShelf movies={savedMovies} onNavigate={onNavigate} title="Saved Movie Posters" />
      <div className="genre-strip" aria-label="Trending genres">
        {Array.from({ length: 5 }, (_, index) => (
          <GenreChip key={index} />
        ))}
      </div>
    </section>
  );
}
