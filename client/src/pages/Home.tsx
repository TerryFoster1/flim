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
          <span className="eyebrow">Movie playlists, not movie homework</span>
          <h1>Spotify Playlists for Movies</h1>
          <p>Create lists. Search real movie metadata. Save posters into playlists that persist locally for now.</p>
          <div className="button-row">
            <button className="primary-button" onClick={() => onNavigate("/playlists")} type="button">
              Browse Playlists
            </button>
            <button className="secondary-button" onClick={() => onNavigate("/roulette")} type="button">
              Try Roulette
            </button>
          </div>
        </div>
        <div className="hero-posters" aria-label="Poster placeholder collage">
          <div className="poster tall tone-red" />
          <div className="poster tone-blue" />
          <div className="poster tall tone-green" />
          <div className="poster tone-gold" />
        </div>
      </div>
      <MovieSearchPanel addToPlaylist={addToPlaylist} onNavigate={onNavigate} playlists={playlists} />
      <PosterShelf movies={savedMovies} onNavigate={onNavigate} title="Saved Movie Posters" />
      <div className="genre-strip" aria-label="Trending genres">
        {Array.from({ length: 5 }, (_, index) => (
          <GenreChip key={index} />
        ))}
      </div>
    </section>
  );
}
