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
        <h2>Keep exploring</h2>
      </div>

      <div className="media-extension-grid">
        <article className="media-extension-card soundtrack-card compact-extension-card">
          <div className="compact-extension-copy">
            <h3>Listen to the soundtrack</h3>
            {soundtrackLink ? (
              <a className="round-media-link spotify-link" href={soundtrackLink.url} rel="noreferrer" target="_blank" aria-label={`Listen to ${media.title} soundtrack on Spotify`}>
                <span>Spotify</span>
              </a>
            ) : (
              <button className="round-media-link spotify-link is-disabled" disabled type="button">
                <span>Spotify</span>
              </button>
            )}
            <p>{soundtrackLink ? extensions.soundtrack.notes : "Soundtrack not available yet."}</p>
          </div>
        </article>

        <article className="media-extension-card trailer-card">
          <div className="extension-art trailer-art" aria-hidden="true">
            {media.posterUrl ? <img alt="" src={media.posterUrl} /> : <span />}
            <strong>Play</strong>
          </div>
          <div>
            <h3>Watch Trailer</h3>
            <p>Open trailer results on YouTube.</p>
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
            <h3>Trivia & Facts</h3>
            <p>Trivia, awards, production notes, and behind-the-scenes stories.</p>
            <button className="secondary-button" disabled type="button">Coming Soon</button>
          </div>
        </article>
      </div>
    </section>
  );
}
