import { GenreChip } from "../components/GenreChip";
import { PosterShelf } from "../components/PosterShelf";
import type { AppRoute } from "../types";

interface HomeProps {
  onNavigate: (route: AppRoute) => void;
}

export function Home({ onNavigate }: HomeProps) {
  return (
    <section className="route-page">
      <div className="hero home-hero">
        <div className="hero-copy">
          <span className="eyebrow">Movie playlists, not movie homework</span>
          <h1>Spotify Playlists for Movies</h1>
          <p>Create lists. Share with friends. Discover what to watch next.</p>
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
      <div className="section-grid two-col">
        <article className="feature-panel">
          <span className="eyebrow">Featured Public Playlists</span>
          <h2>Lists that feel like a Friday night plan</h2>
          <div className="mini-playlist-row">
            <span />
            <span />
            <span />
            <span />
          </div>
        </article>
        <article className="feature-panel roulette-panel">
          <span className="eyebrow">Roulette CTA</span>
          <h2>Can't choose? Spin the night.</h2>
          <button className="primary-button compact" onClick={() => onNavigate("/roulette")} type="button">
            Open Roulette
          </button>
        </article>
      </div>
      <PosterShelf title="Popular Movie Lists" />
      <PosterShelf title="Recently Shared" />
      <div className="genre-strip" aria-label="Trending genres">
        {Array.from({ length: 5 }, (_, index) => (
          <GenreChip key={index} />
        ))}
      </div>
    </section>
  );
}
