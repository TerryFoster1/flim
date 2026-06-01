import { getMediaExtensions } from "../services/mediaExtensionService";
import type { MediaType } from "../types";

interface MediaExtensionsProps {
  media: {
    tmdbId: number;
    title: string;
    mediaType?: MediaType;
    posterUrl?: string;
  };
}

export function MediaExtensions({ media }: MediaExtensionsProps) {
  const extensions = getMediaExtensions(media);
  const soundtrackLink = extensions.soundtrack.soundtrack?.links[0];
  const trailerLink = extensions.videos[0];

  return (
    <section className="media-extensions" aria-label={`Media extensions for ${media.title}`}>
      <div className="media-extension-heading">
        <div>
          <span className="eyebrow">Media Extensions</span>
          <h2>Keep exploring</h2>
        </div>
        <span className="provider-status">Foundation only</span>
      </div>

      <div className="media-extension-grid">
        <article className="media-extension-card watch-movie-card">
          <div className="extension-art watch-art" aria-hidden="true">
            {media.posterUrl ? <img alt="" src={media.posterUrl} /> : <span />}
            <strong>▶</strong>
          </div>
          <div>
            <span className="extension-icon">🎬</span>
            <h3>Watch Movie</h3>
            <p>Use provider and Plex options to open the best available destination.</p>
            <a className="secondary-button" href={`#where-to-watch-${media.tmdbId}`}>
              Provider Options
            </a>
          </div>
        </article>

        <article className="media-extension-card soundtrack-card">
          <div className="extension-art album-art" aria-hidden="true">
            {media.posterUrl ? <img alt="" src={media.posterUrl} /> : <span />}
            <strong>♪</strong>
          </div>
          <div>
            <span className="extension-icon">🎵</span>
            <h3>Listen To Soundtrack</h3>
            <p>{extensions.soundtrack.notes}</p>
            {soundtrackLink ? (
              <a className="secondary-button" href={soundtrackLink.url} rel="noreferrer" target="_blank">
                Open In Spotify
              </a>
            ) : (
              <button className="secondary-button" disabled type="button">Soundtrack not available yet</button>
            )}
          </div>
        </article>

        <article className="media-extension-card trailer-card">
          <div className="extension-art trailer-art" aria-hidden="true">
            {media.posterUrl ? <img alt="" src={media.posterUrl} /> : <span />}
            <strong>▶</strong>
          </div>
          <div>
            <span className="extension-icon">🎞</span>
            <h3>Watch Trailer</h3>
            <p>Official trailer support is planned. This opens a YouTube search fallback for now.</p>
            {trailerLink ? (
              <a className="secondary-button" href={trailerLink.url} rel="noreferrer" target="_blank">
                Open In YouTube
              </a>
            ) : null}
          </div>
        </article>

        <article className="media-extension-card trivia-card">
          <div className="extension-art trivia-art" aria-hidden="true">
            <span />
            <strong>?</strong>
          </div>
          <div>
            <span className="extension-icon">📖</span>
            <h3>Trivia & Facts</h3>
            <p>Trivia, awards, production notes, and behind-the-scenes content are planned for a later phase.</p>
            <button className="secondary-button" disabled type="button">Coming Soon</button>
          </div>
        </article>

        <article className="media-extension-card roulette-card">
          <div className="extension-art roulette-art" aria-hidden="true">
            <span />
            <strong>🎲</strong>
          </div>
          <div>
            <span className="extension-icon">🎲</span>
            <h3>Add To Now Playing</h3>
            <p>Now Playing currently uses saved playlist movies. Direct movie weighting is planned for a future release.</p>
            <button className="secondary-button" onClick={() => window.dispatchEvent(new CustomEvent("flim:open-roulette"))} type="button">
              Open Now Playing
            </button>
          </div>
        </article>
      </div>
    </section>
  );
}
