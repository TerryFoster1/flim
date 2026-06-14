import type { CurrentUser } from "../types";

interface LandingPageProps {
  currentUser: CurrentUser | null;
  onNavigate: (path: string) => void;
}

export function LandingPage(_props: LandingPageProps) {
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
        </div>
      </section>
    </section>
  );
}
