import type { AppRoute, RouteAwareProps } from "../types";

const links: Array<{ label: string; route: AppRoute }> = [
  { label: "Search", route: "/" },
  { label: "Playlists", route: "/playlists" },
  { label: "Roulette", route: "/roulette" },
  { label: "Discover", route: "/discover" },
  { label: "Public Lists", route: "/public" },
  { label: "Profile", route: "/profile" },
  { label: "Settings", route: "/settings" },
  { label: "Providers", route: "/providers" },
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
        <span className="eyebrow">Start here</span>
        <strong>Search for a movie</strong>
        <p>Find a movie first, then build the playlist around it.</p>
      </div>
    </aside>
  );
}
