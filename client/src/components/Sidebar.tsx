import type { AppRoute, RouteAwareProps } from "../types";

const links: Array<{ label: string; route: AppRoute }> = [
  { label: "Home", route: "/" },
  { label: "Discover", route: "/discover" },
  { label: "Playlists", route: "/playlists" },
  { label: "Public", route: "/public" },
  { label: "Roulette", route: "/roulette" },
  { label: "Providers", route: "/providers" },
  { label: "Profile", route: "/profile" },
  { label: "Settings", route: "/settings" },
];

export function Sidebar({ activeRoute, onNavigate }: RouteAwareProps) {
  return (
    <aside className="sidebar" aria-label="Desktop navigation">
      <button className="brand reset-button" onClick={() => onNavigate("/")} type="button">
        <span className="brand-mark">F</span>
        <span>Flim</span>
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
        <span className="eyebrow">Prototype</span>
        <strong>Poster-first movie playlists</strong>
        <p>No APIs, no real movie data, no functionality.</p>
      </div>
    </aside>
  );
}
