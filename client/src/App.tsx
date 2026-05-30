import { useEffect, useState } from "react";
import { Footer } from "./components/Footer";
import { MobileNavigation } from "./components/MobileNavigation";
import { NavigationBar } from "./components/NavigationBar";
import { Sidebar } from "./components/Sidebar";
import { Discover } from "./pages/Discover";
import { Home } from "./pages/Home";
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
import type { AppRoute } from "./types";

const routes: AppRoute[] = [
  "/",
  "/discover",
  "/playlists",
  "/playlists/:id",
  "/public",
  "/roulette",
  "/profile",
  "/profile/playlists",
  "/profile/saved",
  "/profile/watched",
  "/providers",
  "/settings",
];

function routeFromHash(): AppRoute {
  const route = window.location.hash.replace("#", "") || "/";
  if (route === "/playlists/new" || route.startsWith("/playlists/")) return "/playlists/:id";
  return routes.includes(route as AppRoute) ? (route as AppRoute) : "/";
}

export default function App() {
  const [activeRoute, setActiveRoute] = useState<AppRoute>(routeFromHash);

  useEffect(() => {
    const onHashChange = () => setActiveRoute(routeFromHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  function navigate(route: AppRoute) {
    window.location.hash = route === "/playlists/:id" ? "/playlists/placeholder" : route;
    setActiveRoute(route);
  }

  const page = {
    "/": <Home onNavigate={navigate} />,
    "/discover": <Discover />,
    "/playlists": <Playlists onNavigate={navigate} />,
    "/playlists/:id": <PlaylistDetails />,
    "/public": <PublicPlaylists onNavigate={navigate} />,
    "/roulette": <Roulette />,
    "/profile": <Profile onNavigate={navigate} />,
    "/profile/playlists": <ProfilePlaylists onNavigate={navigate} />,
    "/profile/saved": <ProfileSaved />,
    "/profile/watched": <ProfileWatched />,
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
