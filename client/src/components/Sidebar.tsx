import type { AppRoute, RouteAwareProps } from "../types";
import { BrandMark } from "./BrandMark";

const links: Array<{ label: string; route: AppRoute }> = [
  { label: "My Playlists", route: "/" },
  { label: "Public Playlists", route: "/public" },
  { label: "Roulette", route: "/roulette" },
  { label: "Profile", route: "/profile" },
];

export function Sidebar({ activeRoute, onNavigate }: RouteAwareProps) {
  return (
    <aside className="sidebar" aria-label="Desktop navigation">
      <button className="brand reset-button" onClick={() => onNavigate("/")} type="button">
        <BrandMark />
      </button>
      <nav className="nav-stack">
        {links.map((link) => (
          <button
            className={activeRoute === link.route ? "is-active reset-button" : "reset-button"}
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
        <button className="secondary-button sidebar-install-button" onClick={() => onNavigate("/settings")} type="button">
          Install Flim
        </button>
      </div>
    </aside>
  );
}
