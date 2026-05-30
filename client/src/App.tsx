import { useEffect, useMemo, useState } from "react";
import { Footer } from "./components/Footer";
import { MobileNavigation } from "./components/MobileNavigation";
import { NavigationBar } from "./components/NavigationBar";
import { Sidebar } from "./components/Sidebar";
import { addMovieToPlaylist, clonePlaylist, loadPlaylists, removeMovieFromPlaylist, savePlaylists, setMovieWatchStatus } from "./services/localPlaylistStore";
import { Discover } from "./pages/Discover";
import { Home } from "./pages/Home";
import { MovieDetailsPage } from "./pages/MovieDetails";
import { PlaylistDetails } from "./pages/PlaylistDetails";
import { Playlists } from "./pages/Playlists";
import { Profile } from "./pages/Profile";
import { ProfilePlaylists } from "./pages/ProfilePlaylists";
import { ProfileSaved } from "./pages/ProfileSaved";
import { ProfileWatched } from "./pages/ProfileWatched";
import { Providers } from "./pages/Providers";
import { PublicPlaylists } from "./pages/PublicPlaylists";
import { Roulette } from "./pages/Roulette";
import { Settings } from "./pages/Settings";
import type { AppRoute, MovieDetails, MovieSearchResult, Playlist, RouteState, WatchStatus } from "./types";

function routeFromPath(pathname = window.location.pathname): RouteState {
  if (pathname === "/") return { route: "/" };
  if (pathname === "/discover") return { route: "/discover" };
  if (pathname === "/playlists") return { route: "/playlists" };
  if (pathname.startsWith("/playlists/")) return { route: "/playlists/:id", playlistId: pathname.split("/")[2] };
  if (pathname.startsWith("/movies/")) return { route: "/movies/:tmdbId", tmdbId: pathname.split("/")[2] };
  if (pathname === "/public") return { route: "/public" };
  if (pathname === "/roulette") return { route: "/roulette" };
  if (pathname === "/profile") return { route: "/profile" };
  if (pathname === "/profile/playlists") return { route: "/profile/playlists" };
  if (pathname === "/profile/saved") return { route: "/profile/saved" };
  if (pathname === "/profile/watched") return { route: "/profile/watched" };
  if (pathname === "/providers") return { route: "/providers" };
  if (pathname === "/settings") return { route: "/settings" };
  return { route: "/" };
}

export default function App() {
  const [routeState, setRouteState] = useState<RouteState>(routeFromPath);
  const [playlists, setPlaylists] = useState<Playlist[]>(() => loadPlaylists());

  useEffect(() => {
    savePlaylists(playlists);
  }, [playlists]);

  useEffect(() => {
    const onPopState = () => setRouteState(routeFromPath());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  function navigate(path: string) {
    window.history.pushState({}, "", path);
    setRouteState(routeFromPath(path));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function addToPlaylist(playlistId: string, movie: MovieSearchResult | MovieDetails) {
    setPlaylists((current) => addMovieToPlaylist(current, playlistId, movie));
  }

  function removeFromPlaylist(playlistId: string, tmdbId: number) {
    setPlaylists((current) => removeMovieFromPlaylist(current, playlistId, tmdbId));
  }

  function updateWatchStatus(playlistId: string, tmdbId: number, watchStatus: WatchStatus) {
    setPlaylists((current) => setMovieWatchStatus(current, playlistId, tmdbId, watchStatus));
  }

  function cloneLocalPlaylist(playlistId: string) {
    setPlaylists((current) => clonePlaylist(current, playlistId));
  }

  const activePlaylist = useMemo(
    () => playlists.find((playlist) => playlist.id === routeState.playlistId) || playlists[0],
    [playlists, routeState.playlistId],
  );

  const activeRoute: AppRoute = routeState.route;
  const page = {
    "/": <Home onNavigate={navigate} playlists={playlists} addToPlaylist={addToPlaylist} />,
    "/discover": <Discover onNavigate={navigate} playlists={playlists} addToPlaylist={addToPlaylist} />,
    "/playlists": <Playlists onNavigate={navigate} playlists={playlists} setPlaylists={setPlaylists} />,
    "/playlists/:id": activePlaylist ? (
      <PlaylistDetails
        playlist={activePlaylist}
        onNavigate={navigate}
        clonePlaylist={cloneLocalPlaylist}
        removeMovie={removeFromPlaylist}
        updateWatchStatus={updateWatchStatus}
      />
    ) : (
      <Playlists onNavigate={navigate} playlists={playlists} setPlaylists={setPlaylists} />
    ),
    "/movies/:tmdbId": (
      <MovieDetailsPage
        tmdbId={Number(routeState.tmdbId)}
        playlists={playlists}
        addToPlaylist={addToPlaylist}
        updateWatchStatus={updateWatchStatus}
      />
    ),
    "/public": <PublicPlaylists onNavigate={navigate} playlists={playlists} clonePlaylist={cloneLocalPlaylist} />,
    "/roulette": <Roulette playlists={playlists} onNavigate={navigate} />,
    "/profile": <Profile onNavigate={navigate} playlists={playlists} />,
    "/profile/playlists": <ProfilePlaylists onNavigate={navigate} playlists={playlists} />,
    "/profile/saved": <ProfileSaved playlists={playlists} />,
    "/profile/watched": <ProfileWatched playlists={playlists} updateWatchStatus={updateWatchStatus} onNavigate={navigate} />,
    "/providers": <Providers />,
    "/settings": <Settings />,
  }[activeRoute];

  return (
    <div className="app-shell">
      <Sidebar activeRoute={activeRoute} onNavigate={navigate} />
      <div className="main-shell">
        <NavigationBar activeRoute={activeRoute} onNavigate={navigate} />
        <main className="page-container">{page}</main>
        <Footer />
      </div>
      <MobileNavigation activeRoute={activeRoute} onNavigate={navigate} />
    </div>
  );
}
