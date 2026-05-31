import type { AppRoute, RouteAwareProps } from "../types";

const links: Array<{ label: string; route: AppRoute }> = [
  { label: "Collections", route: "/" },
  { label: "Roulette", route: "/roulette" },
];

export function MobileNavigation({ activeRoute, onNavigate }: RouteAwareProps) {
  const collectionsActive =
    activeRoute === "/" ||
    activeRoute === "/playlists" ||
    activeRoute === "/playlists/:id" ||
    activeRoute === "/public" ||
    activeRoute === "/movies/:tmdbId" ||
    activeRoute === "/p/:slug";

  return (
    <nav className="mobile-nav" aria-label="Mobile navigation">
      {links.map((link) => (
        <button
          className={(link.route === "/" ? collectionsActive : activeRoute === link.route) ? "is-active reset-button" : "reset-button"}
          key={link.route}
          onClick={() => onNavigate(link.route)}
          type="button"
        >
          <span aria-hidden="true">{link.route === "/" ? "🎞" : "🎬"}</span>
          {link.label}
        </button>
      ))}
    </nav>
  );
}
