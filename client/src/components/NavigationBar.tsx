import type { AppRoute, RouteAwareProps } from "../types";
import { BrandMark } from "./BrandMark";

const links: Array<{ label: string; route: AppRoute }> = [
  { label: "Collections", route: "/" },
  { label: "Roulette", route: "/roulette" },
];

export function NavigationBar({ activeRoute, onNavigate }: RouteAwareProps) {
  const collectionsActive =
    activeRoute === "/" ||
    activeRoute === "/playlists" ||
    activeRoute === "/playlists/:id" ||
    activeRoute === "/public" ||
    activeRoute === "/movies/:tmdbId" ||
    activeRoute === "/p/:slug";

  return (
    <header className="topbar">
      <button className="mobile-brand reset-button" onClick={() => onNavigate("/")} type="button">
        <BrandMark />
      </button>
      <nav className="top-links" aria-label="Top navigation">
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
      <button className="settings-icon-button" aria-label="Settings" onClick={() => onNavigate("/settings")} type="button">
        ⚙
      </button>
    </header>
  );
}
