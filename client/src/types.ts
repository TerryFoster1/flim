export type AppRoute =
  | "/"
  | "/discover"
  | "/playlists"
  | "/playlists/:id"
  | "/public"
  | "/roulette"
  | "/profile"
  | "/profile/playlists"
  | "/profile/saved"
  | "/profile/watched"
  | "/providers"
  | "/settings";

export interface RouteAwareProps {
  activeRoute: AppRoute;
  onNavigate: (route: AppRoute) => void;
}
