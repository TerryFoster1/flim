import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Footer } from "./components/Footer";
import { InstallFlimPrompt } from "./components/InstallFlimPrompt";
import { NavigationBar } from "./components/NavigationBar";
import { NowPlayingTicketIcon } from "./components/RouletteAssets";
import { getSession, logout as logoutSession } from "./services/authService";
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
import { Profile } from "./pages/Profile";
import { ProfilePlaylists } from "./pages/ProfilePlaylists";
import { ProfileSaved } from "./pages/ProfileSaved";
import { ProfileWatched } from "./pages/ProfileWatched";
import { PublicPlaylist } from "./pages/PublicPlaylist";
import { PublicProfile } from "./pages/PublicProfile";
import { Roulette } from "./pages/Roulette";
import { Settings } from "./pages/Settings";
import { PrivacyPolicy } from "./pages/PrivacyPolicy";
import { TermsOfUse } from "./pages/TermsOfUse";
import { Contact } from "./pages/Contact";
import { AuthPage } from "./pages/AuthPage";
import { DirectorAdmin } from "./pages/DirectorAdmin";
import { LandingPage } from "./pages/LandingPage";
import { createSystemPlaylists } from "./services/systemPlaylists";
import type { AppRoute, CurrentUser, MovieDetails, MovieSearchResult, Playlist, RouteState, WatchStatus } from "./types";

function routeFromPath(pathname = window.location.pathname): RouteState {
  if (pathname === "/") return { route: "/" };
  if (pathname === "/discover") return { route: "/discover" };
  if (pathname === "/playlists") return { route: "/playlists" };
  if (pathname.startsWith("/playlists/")) return { route: "/playlists/:id", playlistId: pathname.split("/")[2] };
  if (pathname.startsWith("/p/")) return { route: "/p/:slug", publicSlug: pathname.split("/")[2] };
  if (pathname.startsWith("/movies/")) return { route: "/movies/:tmdbId", tmdbId: pathname.split("/")[2] };
  if (pathname.startsWith("/tv/")) return { route: "/tv/:tmdbId", tmdbId: pathname.split("/")[2] };
  if (pathname === "/public" || pathname === "/public-playlists") return { route: "/public" };
  if (pathname === "/roulette") return { route: "/" };
  if (pathname === "/profile") return { route: "/profile" };
  if (pathname === "/profile/playlists") return { route: "/profile/playlists" };
  if (pathname === "/profile/saved") return { route: "/profile/saved" };
  if (pathname === "/profile/watched") return { route: "/profile/watched" };
  if (pathname === "/providers") return { route: "/providers" };
  if (pathname === "/settings") return { route: "/settings" };
  if (pathname === "/signin") return { route: "/signin" };
  if (pathname === "/signup") return { route: "/signup" };
  if (pathname.startsWith("/@")) return { route: "/@handle", handle: pathname.slice(2) };
  if (pathname === "/privacy") return { route: "/privacy" };
  if (pathname === "/terms") return { route: "/terms" };
  if (pathname === "/contact") return { route: "/contact" };
  if (pathname === "/director-admin" || pathname === "/director-admin/dashboard") return { route: "/director-admin/dashboard" };
  if (pathname === "/director-admin/login") return { route: "/director-admin/login" };
  if (pathname === "/director-admin/playlists") return { route: "/director-admin/playlists" };
  if (pathname.startsWith("/director-admin/playlists/")) return { route: "/director-admin/playlists/:id", adminPlaylistId: pathname.split("/")[3] };
  if (pathname === "/director-admin/analytics") return { route: "/director-admin/analytics" };
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
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);

  useEffect(() => {
    getSession().then((result) => setCurrentUser(result.user)).catch(() => setCurrentUser(null));
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
      setDataMessage("Could not load playlists right now. Please try again shortly.");
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

  async function removeFromPlaylist(playlistId: string, tmdbId: number, mediaType = "movie") {
    await removeMovieFromPlaylist(playlistId, tmdbId, mediaType);
    await refreshPlaylists();
  }

  async function updateWatchStatus(playlistId: string, tmdbId: number, watchStatus: WatchStatus, mediaType = "movie") {
    await toggleWatchedStatus(playlistId, tmdbId, watchStatus, mediaType);
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

  async function handleAuthenticated(user: CurrentUser) {
    setCurrentUser(user);
    await refreshPlaylists();
  }

  async function logout() {
    await logoutSession().catch(() => undefined);
    setCurrentUser(null);
    await refreshPlaylists();
    navigate("/");
    setPlaylistNotice("Signed out.");
  }

  const ownedPlaylists = useMemo(() => playlists.filter((playlist) => playlist.isOwner), [playlists]);
  const systemPlaylists = useMemo(() => createSystemPlaylists(ownedPlaylists), [ownedPlaylists]);
  const rewindPlaylists = useMemo(
    () => systemPlaylists.filter((playlist) => playlist.systemType !== "plex_library" && playlist.movies.length > 0),
    [systemPlaylists],
  );
  const displayPlaylists = useMemo(() => [...systemPlaylists, ...playlists], [playlists, systemPlaylists]);
  const detailPlaylist = useMemo(() => displayPlaylists.find((playlist) => playlist.id === routeState.playlistId), [displayPlaylists, routeState.playlistId]);

  const activeRoute: AppRoute = routeState.route;
  const isDirectorAdminRoute = activeRoute.startsWith("/director-admin");
  const openNowPlaying = () => {
    setRoulettePlaylists(null);
    setIsRouletteOpen(true);
  };
  const playlistsPage = (initialView: "my" | "public" = "my") => (
    <Playlists
      initialView={initialView}
      currentUser={currentUser}
      rewindPlaylists={rewindPlaylists}
      notice={playlistNotice}
      onCreatePlaylist={createRemotePlaylist}
      onNavigate={navigate}
      playlists={playlists}
    />
  );
  const pages: Partial<Record<AppRoute, ReactNode>> = {
    "/": <LandingPage />,
    "/discover": playlistsPage("my"),
    "/playlists": playlistsPage("my"),
    "/playlists/:id": detailPlaylist ? (
      <PlaylistDetails
        playlist={detailPlaylist}
        onNavigate={navigate}
        addToPlaylist={addToPlaylist}
        clonePlaylist={cloneRemotePlaylist}
        deletePlaylist={deleteRemotePlaylist}
        removeMovie={removeFromPlaylist}
        updateWatchStatus={updateWatchStatus}
      />
    ) : (
      <Playlists currentUser={currentUser} rewindPlaylists={rewindPlaylists} initialView="my" notice={playlistNotice || "Playlist not found."} onCreatePlaylist={createRemotePlaylist} onNavigate={navigate} playlists={playlists} />
    ),
    "/p/:slug": <PublicPlaylist publicSlug={routeState.publicSlug || ""} onNavigate={navigate} />,
    "/movies/:tmdbId": (
      <MovieDetailsPage
        mediaType="movie"
        tmdbId={Number(routeState.tmdbId)}
        playlists={ownedPlaylists}
        addToPlaylist={addToPlaylist}
        updateWatchStatus={updateWatchStatus}
      />
    ),
    "/tv/:tmdbId": (
      <MovieDetailsPage
        mediaType="tv"
        tmdbId={Number(routeState.tmdbId)}
        playlists={ownedPlaylists}
        addToPlaylist={addToPlaylist}
        updateWatchStatus={updateWatchStatus}
      />
    ),
    "/public": playlistsPage("public"),
    "/roulette": playlistsPage("my"),
    "/profile": <Profile onNavigate={navigate} playlists={displayPlaylists} />,
    "/profile/playlists": <ProfilePlaylists onNavigate={navigate} playlists={displayPlaylists} />,
    "/profile/saved": <ProfileSaved playlists={playlists} />,
    "/profile/watched": <ProfileWatched playlists={playlists} onNavigate={navigate} updateWatchStatus={updateWatchStatus} />,
    "/providers": playlistsPage("my"),
    "/settings": <Settings currentUser={currentUser} onNavigate={navigate} />,
    "/signin": <AuthPage mode="signin" onAuth={handleAuthenticated} onNavigate={navigate} />,
    "/signup": <AuthPage mode="signup" onAuth={handleAuthenticated} onNavigate={navigate} />,
    "/@handle": <PublicProfile handle={routeState.handle || ""} onNavigate={navigate} />,
    "/privacy": <PrivacyPolicy />,
    "/terms": <TermsOfUse />,
    "/contact": <Contact />,
    "/director-admin/login": <DirectorAdmin page="login" onNavigate={navigate} />,
    "/director-admin/dashboard": <DirectorAdmin page="dashboard" onNavigate={navigate} />,
    "/director-admin/playlists": <DirectorAdmin page="playlists" onNavigate={navigate} />,
    "/director-admin/playlists/:id": <DirectorAdmin page="playlist" playlistId={routeState.adminPlaylistId} onNavigate={navigate} />,
    "/director-admin/analytics": <DirectorAdmin page="analytics" onNavigate={navigate} />,
  };
  const page = pages[activeRoute] ?? playlistsPage("my");

  return (
    <div className="app-shell">
      <div className="main-shell">
        <NavigationBar activeRoute={activeRoute} currentUser={currentUser} onNavigate={navigate} onLogout={logout} />
        <main className="page-container">
          {dataStatus === "loading" ? <p className="empty-state">Loading playlists...</p> : null}
          {dataStatus === "error" ? <p className="error-message">{dataMessage}</p> : null}
          {dataStatus !== "loading" ? page : null}
        </main>
        <Footer />
      </div>
      <InstallFlimPrompt />
      {!isDirectorAdminRoute ? <div className="playlist-bottom-control" role="navigation" aria-label="Playlist controls">
        <button
          className={`bottom-control-tab ${activeRoute === "/playlists" || activeRoute === "/playlists/:id" || activeRoute === "/discover" ? "is-active" : ""}`}
          onClick={() => navigate("/playlists")}
          type="button"
        >
          My Playlists
        </button>
        <button
          className="bottom-now-playing-button"
          aria-label="Open Movie Roulette"
          onClick={openNowPlaying}
          type="button"
        >
          <NowPlayingTicketIcon />
        </button>
        <button
          className={`bottom-control-tab ${activeRoute === "/public" ? "is-active" : ""}`}
          onClick={() => navigate("/public")}
          type="button"
        >
          Public Playlists
        </button>
      </div> : null}
      {isRouletteOpen ? (
        <div className="roulette-modal-backdrop" role="dialog" aria-modal="true" aria-label="Now Playing">
          <button
            className="roulette-modal-close"
            aria-label="Close Now Playing"
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
