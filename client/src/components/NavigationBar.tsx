import type { AppRoute, RouteAwareProps } from "../types";
import { BrandMark } from "./BrandMark";

const links: Array<{ label: string; route: AppRoute }> = [
  { label: "My Playlists", route: "/" },
  { label: "Public Playlists", route: "/public" },
  { label: "Roulette", route: "/roulette" },
  { label: "Profile", route: "/profile" },
];

export function NavigationBar({ activeRoute, onNavigate }: RouteAwareProps) {
  return (
    <header className="topbar">
      <button className="mobile-brand reset-button" onClick={() => onNavigate("/")} type="button">
        <BrandMark />
      </button>
      <nav className="top-links" aria-label="Top navigation">
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
      <button className="ghost-button" onClick={() => onNavigate("/playlists")} type="button">
        Create Playlist
      </button>
    </header>
  );
}
