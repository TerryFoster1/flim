import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Footer } from "./components/Footer";
import { InstallFlimPrompt } from "./components/InstallFlimPrompt";
import { NavigationBar } from "./components/NavigationBar";
import { FilmReelIcon } from "./components/RouletteAssets";
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
  if (pathname === "/roulette") return { route: "/" };
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
  const [isRouletteOpen, setIsRouletteOpen] = useState(() => window.location.pathname === "/roulette");
  const [roulettePlaylists, setRoulettePlaylists] = useState<Playlist[] | null>(null);

  useEffect(() => {
    refreshPlaylists();
  }, []);

  useEffect(() => {
    const onPopState = () => setRouteState(routeFromPath());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    const openRoulette = (event: Event) => {
      const detail = event instanceof CustomEvent ? event.detail : undefined;
      setRoulettePlaylists(Array.isArray(detail?.playlists) ? detail.playlists : null);
      setIsRouletteOpen(true);
    };
    window.addEventListener("flim:open-roulette", openRoulette);
    return () => window.removeEventListener("flim:open-roulette", openRoulette);
  }, []);

  function navigate(path: string) {
    setIsRouletteOpen(false);
    setRoulettePlaylists(null);
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
  const playlistsPage = (initialView: "my" | "public" = "my") => (
    <Playlists
      initialView={initialView}
      notice={playlistNotice}
      onCreatePlaylist={createRemotePlaylist}
      onNavigate={navigate}
      playlists={playlists}
    />
  );
  const pages: Partial<Record<AppRoute, ReactNode>> = {
    "/": playlistsPage("my"),
    "/discover": playlistsPage("my"),
    "/playlists": playlistsPage("my"),
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
      <Playlists initialView="my" notice={playlistNotice || "Playlist not found."} onCreatePlaylist={createRemotePlaylist} onNavigate={navigate} playlists={playlists} />
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
    "/public": playlistsPage("public"),
    "/roulette": playlistsPage("my"),
    "/providers": playlistsPage("my"),
    "/settings": <Settings />,
  };
  const page = pages[activeRoute] ?? playlistsPage("my");

  return (
    <div className="app-shell">
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
      <button
        className="floating-roulette-button"
        aria-label="Open Movie Roulette"
        onClick={() => {
          setRoulettePlaylists(null);
          setIsRouletteOpen(true);
        }}
        type="button"
      >
        <FilmReelIcon />
      </button>
      {isRouletteOpen ? (
        <div className="roulette-modal-backdrop" role="dialog" aria-modal="true" aria-label="Movie Night Roulette">
          <button
            className="roulette-modal-close"
            aria-label="Close roulette"
            onClick={() => {
              setIsRouletteOpen(false);
              setRoulettePlaylists(null);
            }}
            type="button"
          >
            X
          </button>
          <div className="roulette-modal-shell">
            <Roulette playlists={roulettePlaylists || playlists} onNavigate={navigate} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
