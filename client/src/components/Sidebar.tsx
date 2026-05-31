import type { AppRoute, RouteAwareProps } from "../types";
import { BrandMark } from "./BrandMark";

const links: Array<{ label: string; route: AppRoute }> = [
  { label: "Collections", route: "/" },
  { label: "Roulette", route: "/roulette" },
];

export function Sidebar({ activeRoute, onNavigate }: RouteAwareProps) {
  const collectionsActive =
    activeRoute === "/" ||
    activeRoute === "/playlists" ||
    activeRoute === "/playlists/:id" ||
    activeRoute === "/public" ||
    activeRoute === "/movies/:tmdbId" ||
    activeRoute === "/p/:slug";

  return (
    <aside className="sidebar" aria-label="Desktop navigation">
      <button className="brand reset-button" onClick={() => onNavigate("/")} type="button">
        <BrandMark />
      </button>
      <nav className="nav-stack">
        {links.map((link) => (
          <button
            className={(link.route === "/" ? collectionsActive : activeRoute === link.route) ? "is-active reset-button" : "reset-button"}
            key={link.route}
            onClick={() => onNavigate(link.route)}
            type="button"
          >
            {link.label}
          </button>
        ))}
      </nav>
      <div className="sidebar-card">
        <span className="eyebrow">Flim</span>
        <strong>Spotify playlists for movies</strong>
        <p>Collect posters. Share the list. Pick the night.</p>
      </div>
    </aside>
  );
}
