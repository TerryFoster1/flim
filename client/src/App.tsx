import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Footer } from "./components/Footer";
import { InstallFlimPrompt } from "./components/InstallFlimPrompt";
import { MobileNavigation } from "./components/MobileNavigation";
import { NavigationBar } from "./components/NavigationBar";
import { Sidebar } from "./components/Sidebar";
import {
  addMovieToPlaylist,
  clonePlaylist,
  createPlaylist,
  deletePlaylist,
  getPlaylists,
  removeMovieFromPlaylist,
  toggleWatchedStatus,
} from "./services/apiPlaylistStore";
import { MovieDetailsPage } from "./pages/MovieDetails";
import { PlaylistDetails } from "./pages/PlaylistDetails";
import { Playlists } from "./pages/Playlists";
import { PublicPlaylist } from "./pages/PublicPlaylist";
import { Roulette } from "./pages/Roulette";
import { Settings } from "./pages/Settings";
import type { AppRoute, MovieDetails, MovieSearchResult, Playlist, RouteState, WatchStatus } from "./types";

function routeFromPath(pathname = window.location.pathname): RouteState {
  if (pathname === "/") return { route: "/" };
  if (pathname === "/discover") return { route: "/discover" };
  if (pathname === "/playlists") return { route: "/playlists" };
  if (pathname.startsWith("/playlists/")) return { route: "/playlists/:id", playlistId: pathname.split("/")[2] };
  if (pathname.startsWith("/p/")) return { route: "/p/:slug", publicSlug: pathname.split("/")[2] };
  if (pathname.startsWith("/movies/")) return { route: "/movies/:tmdbId", tmdbId: pathname.split("/")[2] };
  if (pathname === "/public") return { route: "/public" };
  if (pathname === "/roulette") return { route: "/roulette" };
  if (pathname === "/providers") return { route: "/providers" };
  if (pathname === "/settings") return { route: "/settings" };
  return { route: "/" };
}

export default function App() {
  const [routeState, setRouteState] = useState<RouteState>(routeFromPath);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [playlistNotice, setPlaylistNotice] = useState("");
  const [dataStatus, setDataStatus] = useState<"loading" | "ready" | "error">("loading");
  const [dataMessage, setDataMessage] = useState("");

  useEffect(() => {
    refreshPlaylists();
  }, []);

  useEffect(() => {
    const onPopState = () => setRouteState(routeFromPath());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  function navigate(path: string) {
    if (path !== "/playlists") {
      setPlaylistNotice("");
    }
    window.history.pushState({}, "", path);
    setRouteState(routeFromPath(path));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function refreshPlaylists() {
    try {
      setDataStatus("loading");
      setPlaylists(await getPlaylists());
      setDataMessage("");
      setDataStatus("ready");
    } catch {
      setDataStatus("error");
      setDataMessage("Could not load playlists from the database. Check Neon setup.");
    }
  }

  async function createRemotePlaylist(input: Pick<Playlist, "name" | "description" | "visibility">) {
    const created = await createPlaylist(input);
    await refreshPlaylists();
    return created;
  }

  async function addToPlaylist(playlistId: string, movie: MovieSearchResult | MovieDetails) {
    await addMovieToPlaylist(playlistId, movie);
    await refreshPlaylists();
  }

  async function removeFromPlaylist(playlistId: string, tmdbId: number) {
    await removeMovieFromPlaylist(playlistId, tmdbId);
    await refreshPlaylists();
  }

  async function updateWatchStatus(playlistId: string, tmdbId: number, watchStatus: WatchStatus) {
    await toggleWatchedStatus(playlistId, tmdbId, watchStatus);
    await refreshPlaylists();
  }

  async function cloneRemotePlaylist(playlistId: string) {
    await clonePlaylist(playlistId);
    await refreshPlaylists();
  }

  async function deleteRemotePlaylist(playlistId: string) {
    await deletePlaylist(playlistId);
    await refreshPlaylists();
    setPlaylistNotice("Playlist deleted.");
    navigate("/playlists");
  }

  const activePlaylist = useMemo(() => playlists.find((playlist) => playlist.id === routeState.playlistId), [playlists, routeState.playlistId]);

  const activeRoute: AppRoute = routeState.route;
  const collectionsPage = (initialView: "my" | "public" = "my") => (
    <Playlists
      initialView={initialView}
      notice={playlistNotice}
      onCreatePlaylist={createRemotePlaylist}
      onDelete={deleteRemotePlaylist}
      onNavigate={navigate}
      playlists={playlists}
    />
  );
  const pages: Partial<Record<AppRoute, ReactNode>> = {
    "/": collectionsPage("my"),
    "/discover": collectionsPage("my"),
    "/playlists": collectionsPage("my"),
    "/playlists/:id": activePlaylist ? (
      <PlaylistDetails
        playlist={activePlaylist}
        onNavigate={navigate}
        addToPlaylist={addToPlaylist}
        clonePlaylist={cloneRemotePlaylist}
        deletePlaylist={deleteRemotePlaylist}
        removeMovie={removeFromPlaylist}
        updateWatchStatus={updateWatchStatus}
      />
    ) : (
      <Playlists initialView="my" notice={playlistNotice || "Playlist not found."} onCreatePlaylist={createRemotePlaylist} onDelete={deleteRemotePlaylist} onNavigate={navigate} playlists={playlists} />
    ),
    "/p/:slug": <PublicPlaylist publicSlug={routeState.publicSlug || ""} onNavigate={navigate} />,
    "/movies/:tmdbId": (
      <MovieDetailsPage
        tmdbId={Number(routeState.tmdbId)}
        playlists={playlists}
        addToPlaylist={addToPlaylist}
        updateWatchStatus={updateWatchStatus}
      />
    ),
    "/public": collectionsPage("public"),
    "/roulette": <Roulette playlists={playlists} onNavigate={navigate} />,
    "/providers": collectionsPage("my"),
    "/settings": <Settings />,
  };
  const page = pages[activeRoute] ?? collectionsPage("my");

  return (
    <div className="app-shell">
      <Sidebar activeRoute={activeRoute} onNavigate={navigate} />
      <div className="main-shell">
        <NavigationBar activeRoute={activeRoute} onNavigate={navigate} />
        <main className="page-container">
          {dataStatus === "loading" ? <p className="empty-state">Loading playlists...</p> : null}
          {dataStatus === "error" ? <p className="error-message">{dataMessage}</p> : null}
          {dataStatus !== "loading" ? page : null}
        </main>
        <Footer />
      </div>
      <InstallFlimPrompt />
      <MobileNavigation activeRoute={activeRoute} onNavigate={navigate} />
    </div>
  );
}
