import type { AppRoute, RouteAwareProps } from "../types";

const links: Array<{ label: string; route: AppRoute }> = [
  { label: "Home", route: "/" },
  { label: "Discover", route: "/discover" },
  { label: "Lists", route: "/playlists" },
  { label: "Spin", route: "/roulette" },
  { label: "Profile", route: "/profile" },
];

export function MobileNavigation({ activeRoute, onNavigate }: RouteAwareProps) {
  return (
    <nav className="mobile-nav" aria-label="Mobile navigation">
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
  );
}
