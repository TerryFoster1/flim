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
        <a
          className="media-extension-card media-extension-card-action soundtrack-card compact-extension-card"
          href={soundtrackLink?.url}
          rel="noreferrer"
          target="_blank"
          aria-label={`Listen to ${media.title} soundtrack on Spotify`}
        >
          <div className="compact-extension-copy">
            <h3>Listen to the soundtrack</h3>
            <span className="round-media-link spotify-link" aria-hidden="true">
              <img alt="" src="/provider-icons/spotify.png" />
            </span>
            <p>{soundtrackLink ? extensions.soundtrack.notes : "Soundtrack not available yet."}</p>
          </div>
        </a>

        <a
          className="media-extension-card media-extension-card-action trailer-card"
          href={trailerLink?.url}
          rel="noreferrer"
          target="_blank"
          aria-label={`Watch ${media.title} trailer on YouTube`}
        >
          <div className="extension-art trailer-art media-extension-logo-art" aria-hidden="true">
            <span className="round-media-link youtube-link">
              <img alt="" src="/provider-icons/youtube.png" />
            </span>
          </div>
          <div>
            <h3>Watch Trailer</h3>
            <p>Open trailer results on YouTube.</p>
          </div>
        </a>

        <button className="media-extension-card media-extension-card-action trivia-card reset-button" type="button" aria-label="Trivia and facts coming soon">
          <div className="extension-art trivia-art" aria-hidden="true">
            <span />
            <strong>?</strong>
          </div>
          <div>
            <h3>Trivia & Facts</h3>
            <p>Trivia, awards, production notes, and behind-the-scenes stories.</p>
          </div>
        </button>
      </div>
    </section>
  );
}
