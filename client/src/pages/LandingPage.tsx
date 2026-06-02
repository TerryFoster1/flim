import { NowPlayingTicketIcon } from "../components/RouletteAssets";
import type { CurrentUser } from "../types";

interface LandingPageProps {
  currentUser: CurrentUser | null;
  onNavigate: (path: string) => void;
  onOpenNowPlaying: () => void;
  onCreatePlaylist: () => void;
}

export function LandingPage({ currentUser, onNavigate, onOpenNowPlaying, onCreatePlaylist }: LandingPageProps) {
  return (
    <section className="route-page landing-page">
      <section className="collections-cinematic-hero landing-hero" aria-label="Flim movie playlists">
        <picture className="collections-hero-picture" aria-hidden="true">
          <source media="(max-width: 767px)" srcSet="/brand/flim-hero-mobile.png" />
          <source media="(min-width: 768px)" srcSet="/brand/flim-hero-desktop.png" />
          <img alt="" decoding="async" fetchPriority="high" src="/brand/flim-hero-desktop.png" />
        </picture>
        <div className="collections-hero-content">
          <h1>What Are We Watching Tonight?</h1>
          <p>Create, share, and discover movie and TV playlists.</p>
          <div className="button-row">
            <button className="primary-button" onClick={onCreatePlaylist} type="button">
              {currentUser ? "Create Playlist" : "Create Account"}
            </button>
            <button className="secondary-button" onClick={() => onNavigate("/public")} type="button">
              Browse Public Playlists
            </button>
          </div>
        </div>
      </section>

      <section className="landing-choice-row" aria-label="Choose where to go">
        <button className="landing-choice-tab" onClick={() => onNavigate("/playlists")} type="button">
          My Playlists
        </button>
        <button className="landing-now-playing-ticket" aria-label="Open Now Playing" onClick={onOpenNowPlaying} type="button">
          <NowPlayingTicketIcon />
        </button>
        <button className="landing-choice-tab" onClick={() => onNavigate("/public")} type="button">
          Public Playlists
        </button>
      </section>
    </section>
  );
}
