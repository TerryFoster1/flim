import { PageShell } from "../components/PageShell";
import { PlaylistGrid } from "../components/PlaylistGrid";
import type { Playlist } from "../types";

interface HomeProps {
  onNavigate: (path: string) => void;
  playlists: Playlist[];
  notice?: string;
}

const curatedPosterUrls = [
  "https://image.tmdb.org/t/p/w500/9gk7adHYeDvHkCSEqAvQNLV5Uge.jpg",
  "https://image.tmdb.org/t/p/w500/qJ2tW6WMUDux911r6m7haRef0WH.jpg",
  "https://image.tmdb.org/t/p/w500/6FfCtAuVAW8XJjZ7eWeLibRLWTw.jpg",
  "https://image.tmdb.org/t/p/w500/8UlWHLMpgZm9bx6QYh0NFoq67TZ.jpg",
  "https://image.tmdb.org/t/p/w500/rCzpDGLbOoPwLjy3OAm5NUPOTrC.jpg",
  "https://image.tmdb.org/t/p/w500/5KCVkau1HEl7ZzfPsKAPM0sMiKc.jpg",
];

function getHeroPosters(playlists: Playlist[]) {
  const savedPosters = playlists.flatMap((playlist) => playlist.movies).map((movie) => movie.posterUrl).filter(Boolean) as string[];
  return [...savedPosters, ...curatedPosterUrls].slice(0, 8);
}

export function Home({ onNavigate, playlists, notice }: HomeProps) {
  const heroPosters = getHeroPosters(playlists);
  const continuePlaylist = [...playlists].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  const watchedMovies = playlists
    .flatMap((playlist) => playlist.movies)
    .filter((movie) => movie.watchStatus === "watched")
    .slice(0, 8);
  const publicPlaylists = playlists.filter((playlist) => playlist.visibility === "public").slice(0, 4);

  return (
    <section className="route-page">
      <section className="cinema-hero" aria-label="Flim movie poster hero">
        <div className="cinema-poster-wall">
          {heroPosters.map((posterUrl, index) => (
            <img alt="" className={`cinema-poster poster-${index + 1}`} key={`${posterUrl}-${index}`} src={posterUrl} />
          ))}
        </div>
        <div className="cinema-hero-overlay">
          <h1>Your Movie Playlists</h1>
          <p>Create, share, and discover movie playlists.</p>
          <div className="button-row">
            <button className="primary-button" onClick={() => onNavigate("/playlists")} type="button">Create Playlist</button>
            <button className="secondary-button" onClick={() => onNavigate("/public")} type="button">Browse Public Lists</button>
          </div>
        </div>
      </section>
      {notice ? <p className="success-message">{notice}</p> : null}

      <PageShell
        eyebrow="My Playlists"
        title="Playlists"
        action={<button className="primary-button" onClick={() => onNavigate("/playlists")} type="button">Create Playlist</button>}
      >
      {playlists.length === 0 ? (
        <section className="empty-playlists-panel cinematic-empty">
          <div className="empty-poster-wall" aria-hidden="true">
            {Array.from({ length: 6 }).map((_, index) => <span key={index} />)}
          </div>
          <div className="empty-copy">
            <h2>Create your first playlist.</h2>
            <button className="primary-button" onClick={() => onNavigate("/playlists")} type="button">Create Playlist</button>
          </div>
        </section>
      ) : (
        <PlaylistGrid onNavigate={onNavigate} playlists={playlists} />
      )}
      </PageShell>

      <section className="home-cinema-grid">
        <article className="cinema-experience-card continue-card">
          <div className="cinema-card-art">
            {continuePlaylist ? (
              <div className="continue-cover poster-collage">
                {continuePlaylist.movies.slice(0, 4).map((movie) =>
                  movie.posterUrl ? <img alt="" key={movie.tmdbId} src={movie.posterUrl} /> : <span key={movie.tmdbId} />,
                )}
                {continuePlaylist.movies.length === 0 ? (
                  <>
                    <span />
                    <span />
                    <span />
                    <span />
                  </>
                ) : null}
              </div>
            ) : (
              <div className="film-reel-illustration" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
            )}
          </div>
          <div className="cinema-card-copy">
            {continuePlaylist ? (
              <>
                <h2>{continuePlaylist.name}</h2>
                <p>{continuePlaylist.movies.length} movies waiting on the shelf.</p>
                <button className="primary-button" onClick={() => onNavigate(`/playlists/${continuePlaylist.id}`)} type="button">
                  Continue
                </button>
              </>
            ) : (
              <>
                <h2>Start building your movie playlist.</h2>
                <button className="primary-button" onClick={() => onNavigate("/playlists")} type="button">
                  Create Playlist
                </button>
              </>
            )}
          </div>
        </article>

        <article className="cinema-experience-card movie-night-card">
          <div className="cinema-card-art">
            {watchedMovies.length > 0 ? (
              <div className="watched-poster-stack">
                {watchedMovies.slice(0, 5).map((movie) =>
                  movie.posterUrl ? <img alt="" key={movie.tmdbId} src={movie.posterUrl} /> : <span key={movie.tmdbId} />,
                )}
              </div>
            ) : (
              <div className="popcorn-illustration" aria-hidden="true">
                <span className="popcorn-kernel one" />
                <span className="popcorn-kernel two" />
                <span className="popcorn-kernel three" />
                <span className="popcorn-bucket" />
              </div>
            )}
          </div>
          <div className="cinema-card-copy">
            {watchedMovies.length > 0 ? (
              <>
                <h2>{watchedMovies.length} recent watches</h2>
                <p>Your watched posters are becoming a little theater archive.</p>
                <button className="secondary-button" onClick={() => onNavigate("/profile/watched")} type="button">
                  Open History
                </button>
              </>
            ) : (
              <>
                <h2>Your movie nights will appear here.</h2>
                <p>Watched posters will collect here after the credits roll.</p>
              </>
            )}
          </div>
        </article>
      </section>

      <section className="home-stream-section">
        <div className="shelf-header">
          <div>
            <h2>Shared movie shelves</h2>
          </div>
          <button className="secondary-button" onClick={() => onNavigate("/public")} type="button">
            Browse Public Lists
          </button>
        </div>
        {publicPlaylists.length > 0 ? (
          <PlaylistGrid onNavigate={onNavigate} playlists={publicPlaylists} />
        ) : (
          <div className="poster-marquee" aria-label="Public playlist preview">
            {curatedPosterUrls.slice(0, 5).map((posterUrl) => <img alt="" key={posterUrl} src={posterUrl} />)}
          </div>
        )}
      </section>

      <section className="roulette-home-banner">
        <div className="roulette-mini-wheel" aria-hidden="true">
          <span />
        </div>
        <div>
          <h2>Let movie night pick itself.</h2>
        </div>
        <button className="primary-button" onClick={() => window.dispatchEvent(new CustomEvent("flim:open-roulette"))} type="button">
          Choose Tonight
        </button>
      </section>
    </section>
  );
}
