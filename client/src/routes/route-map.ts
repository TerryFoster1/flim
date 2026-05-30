// Central client route map placeholder for Phase 1A.
// TODO: Wire these routes with React Router in a future implementation phase.
// Route names intentionally match the poster-first playlist platform direction.

export const clientRoutes = {
  home: "/",
  discover: "/discover",
  playlists: "/playlists",
  playlistDetails: "/playlists/:id",
  publicPlaylists: "/public",
  roulette: "/roulette",
  profile: "/profile",
  profilePlaylists: "/profile/playlists",
  profileSaved: "/profile/saved",
  profileWatched: "/profile/watched",
  providers: "/providers",
} as const;

export type ClientRouteKey = keyof typeof clientRoutes;
