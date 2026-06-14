import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Footer } from "./components/Footer";
import { InstallFlimPrompt } from "./components/InstallFlimPrompt";
import { NavigationBar } from "./components/NavigationBar";
import { NowPlayingTicketIcon } from "./components/RouletteAssets";
import { getSession, logout as logoutSession } from "./services/authService";
import { enqueueTitleTrivia } from "./services/triviaService";
import {
  addMovieToPlaylist,
  createSharedPlaylistLink,
  createPlaylist,
  deletePlaylist,
  getPlaylists,
  removeMovieFromPlaylist,
  toggleWatchedStatus,
  updatePlaylist,
} from "./services/apiPlaylistStore";
import { MovieDetailsPage } from "./pages/MovieDetails";
import { ActorDetailsPage } from "./pages/ActorDetails";
import { CollectionDetailsPage } from "./pages/CollectionDetails";
import { FriendChallenge } from "./pages/FriendChallenge";
import { TriviaGames } from "./pages/TriviaGames";
import { HallOfFame } from "./pages/HallOfFame";
import { Progress } from "./pages/Progress";
import { SeasonalChallenges } from "./pages/SeasonalChallenges";
import { ChallengeDetails } from "./pages/ChallengeDetails";
import { PlaylistDetails } from "./pages/PlaylistDetails";
import { Playlists } from "./pages/Playlists";
import { Profile } from "./pages/Profile";
import { ProfilePlaylists } from "./pages/ProfilePlaylists";
import { ProfileSaved } from "./pages/ProfileSaved";
import { ProfileWatched } from "./pages/ProfileWatched";
import { FollowedTitles } from "./pages/FollowedTitles";
import { UpcomingReleases } from "./pages/UpcomingReleases";
import { PublicPlaylist } from "./pages/PublicPlaylist";
import { SharedPlaylist } from "./pages/SharedPlaylist";
import { PublicProfile } from "./pages/PublicProfile";
import { Roulette } from "./pages/Roulette";
import { Settings } from "./pages/Settings";
import { PrivacyPolicy } from "./pages/PrivacyPolicy";
import { TermsOfUse } from "./pages/TermsOfUse";
import { Contact } from "./pages/Contact";
import { Help } from "./pages/Help";
import { About } from "./pages/About";
import { AuthPage } from "./pages/AuthPage";
import { DirectorAdmin } from "./pages/DirectorAdmin";
import { LandingPage } from "./pages/LandingPage";
import { Discover } from "./pages/Discover";
import { DiscoveryHub } from "./pages/DiscoveryHub";
import { Curators } from "./pages/Curators";
import { createSystemPlaylists } from "./services/systemPlaylists";
import { getActiveSeasonalTheme } from "./seasonalThemes";
import type { AppRoute, CurrentUser, MovieDetails, MovieSearchResult, Playlist, RouteState, WatchStatus } from "./types";

function routeFromPath(path = window.location.pathname): RouteState {
  const url = new URL(path, window.location.origin);
  const pathname = url.pathname;
  if (pathname === "/") return { route: "/" };
  if (pathname === "/discover") return { route: "/discover" };
  if (pathname === "/curators") return { route: "/curators" };
  if (pathname === "/playlists") return { route: "/playlists" };
  if (pathname.startsWith("/playlists/")) return { route: "/playlists/:id", playlistId: pathname.split("/")[2] };
  if (pathname.startsWith("/p/")) return { route: "/p/:slug", publicSlug: pathname.split("/")[2] };
  if (pathname.startsWith("/s/")) return { route: "/s/:token", sharedToken: pathname.split("/")[2] };
  if (pathname.startsWith("/movies/")) return { route: "/movies/:tmdbId", tmdbId: pathname.split("/")[2] };
  if (pathname.startsWith("/tv/")) return { route: "/tv/:tmdbId", tmdbId: pathname.split("/")[2] };
  if (pathname.startsWith("/actor/")) return { route: "/actor/:id", actorId: pathname.split("/")[2] };
  if (pathname.startsWith("/person/")) return { route: "/person/:id", actorId: pathname.split("/")[2] };
  if (pathname.startsWith("/collection/")) return { route: "/collection/:id", collectionId: pathname.split("/")[2] };
  if (pathname.startsWith("/genre/")) return { route: "/genre/:id", discoveryKind: "genre", discoveryId: pathname.split("/")[2] };
  if (pathname.startsWith("/decade/")) return { route: "/decade/:id", discoveryKind: "decade", discoveryId: pathname.split("/")[2] };
  if (pathname.startsWith("/franchise/")) return { route: "/franchise/:id", discoveryKind: "franchise", discoveryId: pathname.split("/")[2] };
  if (pathname.startsWith("/games/title/")) {
    const parts = pathname.split("/");
    const mediaType = parts[3] === "tv" ? "tv" : "movie";
    return {
      route: "/games/title/:mediaType/:tmdbId",
      gamesMediaType: mediaType,
      gamesTmdbId: parts[4],
      returnTo: url.searchParams.get("returnTo") || undefined,
    };
  }
  if (pathname.startsWith("/challenge/")) return { route: "/challenge/:token", challengeToken: pathname.split("/")[2] };
  if (pathname === "/games" || pathname === "/trivia-games") return { route: "/games" };
  if (pathname === "/challenges") return { route: "/challenges" };
  if (pathname.startsWith("/challenges/")) return { route: "/challenges/:slug", seasonalChallengeSlug: pathname.split("/")[2] };
  if (pathname === "/progress") return { route: "/progress" };
  if (pathname === "/hall-of-fame") return { route: "/hall-of-fame" };
  if (pathname === "/public" || pathname === "/public-playlists") return { route: "/public" };
  if (pathname === "/roulette") return { route: "/" };
  if (pathname === "/profile") return { route: "/profile" };
  if (pathname === "/profile/playlists") return { route: "/profile/playlists" };
  if (pathname === "/profile/saved") return { route: "/profile/saved" };
  if (pathname === "/profile/watched") return { route: "/profile/watched" };
  if (pathname === "/followed-titles") return { route: "/followed-titles" };
  if (pathname === "/upcoming") return { route: "/upcoming" };
  if (pathname === "/providers") return { route: "/providers" };
  if (pathname === "/settings") return { route: "/settings" };
  if (pathname === "/signin") return { route: "/signin" };
  if (pathname === "/signup") return { route: "/signup" };
  if (pathname.startsWith("/@")) return { route: "/@handle", handle: pathname.slice(2) };
  if (pathname === "/privacy") return { route: "/privacy" };
  if (pathname === "/terms") return { route: "/terms" };
  if (pathname === "/contact") return { route: "/contact" };
  if (pathname === "/help") return { route: "/help" };
  if (pathname === "/about") return { route: "/about" };
  if (pathname === "/director-admin" || pathname === "/director-admin/dashboard") return { route: "/director-admin/dashboard" };
  if (pathname === "/director-admin/login") return { route: "/director-admin/login" };
  if (pathname === "/director-admin/playlists") return { route: "/director-admin/playlists" };
  if (pathname.startsWith("/director-admin/playlists/")) return { route: "/director-admin/playlists/:id", adminPlaylistId: pathname.split("/")[3] };
  if (pathname === "/director-admin/analytics") return { route: "/director-admin/analytics" };
  return { route: "/" };
}

function isDirectorPlaylist(playlist: Playlist) {
  return playlist.creatorHandle === "the-director" || playlist.creatorDisplayName === "The Director";
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
  const activeSeasonalTheme = useMemo(() => getActiveSeasonalTheme(), [routeState.route]);
  const activeRoute: AppRoute = routeState.route;
  const isHomeRoute = activeRoute === "/";

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

  useEffect(() => {
    const previousTheme = document.body.dataset.seasonalTheme;
    const previousPreview = document.body.dataset.seasonalThemePreview;
    document.body.dataset.seasonalTheme = !isHomeRoute && activeSeasonalTheme?.id ? activeSeasonalTheme.id : "default";
    if (!isHomeRoute && activeSeasonalTheme?.isPreview) {
      document.body.dataset.seasonalThemePreview = "true";
    } else {
      delete document.body.dataset.seasonalThemePreview;
    }
    return () => {
      if (previousTheme) {
        document.body.dataset.seasonalTheme = previousTheme;
      } else {
        delete document.body.dataset.seasonalTheme;
      }
      if (previousPreview) {
        document.body.dataset.seasonalThemePreview = previousPreview;
      } else {
        delete document.body.dataset.seasonalThemePreview;
      }
    };
  }, [activeSeasonalTheme, isHomeRoute]);

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

  async function refreshPlaylists(options: { background?: boolean } = {}) {
    try {
      if (!options.background) {
        setDataStatus("loading");
      }
      setPlaylists(await getPlaylists());
      setDataMessage("");
      setDataStatus("ready");
    } catch {
      if (!options.background) {
        setDataStatus("error");
      }
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
    enqueueTitleTrivia({ mediaType: movie.mediaType || "movie", tmdbId: movie.tmdbId, source: "playlist_add" });
    await refreshPlaylists({ background: true });
  }

  async function removeFromPlaylist(playlistId: string, tmdbId: number, mediaType = "movie") {
    await removeMovieFromPlaylist(playlistId, tmdbId, mediaType);
    await refreshPlaylists();
  }

  async function updateWatchStatus(playlistId: string, tmdbId: number, watchStatus: WatchStatus, mediaType = "movie") {
    await toggleWatchedStatus(playlistId, tmdbId, watchStatus, mediaType);
    await refreshPlaylists();
  }

  async function deleteRemotePlaylist(playlistId: string) {
    await deletePlaylist(playlistId);
    await refreshPlaylists();
    setPlaylistNotice("Playlist deleted.");
    navigate("/playlists");
  }

  async function updateRemotePlaylist(playlistId: string, input: Pick<Playlist, "name" | "description" | "visibility">) {
    const updated = await updatePlaylist(playlistId, input);
    await refreshPlaylists();
    return updated;
  }

  async function createRemoteSharedLink(playlistId: string) {
    const result = await createSharedPlaylistLink(playlistId);
    await refreshPlaylists();
    return result;
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
  const nowPlayingPlaylists = useMemo(
    () => playlists.filter((playlist) => playlist.isOwner || playlist.isFollowing || isDirectorPlaylist(playlist)),
    [playlists],
  );
  const detailPlaylist = useMemo(() => displayPlaylists.find((playlist) => playlist.id === routeState.playlistId), [displayPlaylists, routeState.playlistId]);

  const isDirectorAdminRoute = activeRoute.startsWith("/director-admin");
  const isTitleDetailRoute = activeRoute === "/movies/:tmdbId" || activeRoute === "/tv/:tmdbId";
  const isTitleGameRoute = activeRoute === "/games/title/:mediaType/:tmdbId";
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
    "/": <LandingPage currentUser={currentUser} onNavigate={navigate} />,
    "/discover": <Discover onNavigate={navigate} />,
    "/curators": <Curators onNavigate={navigate} />,
    "/playlists": playlistsPage("my"),
    "/playlists/:id": detailPlaylist ? (
      <PlaylistDetails
        playlist={detailPlaylist}
        onNavigate={navigate}
        addToPlaylist={addToPlaylist}
        deletePlaylist={deleteRemotePlaylist}
        updatePlaylist={updateRemotePlaylist}
        createSharedLink={createRemoteSharedLink}
        removeMovie={removeFromPlaylist}
        updateWatchStatus={updateWatchStatus}
        relatedPlaylists={displayPlaylists}
      />
    ) : (
      <Playlists currentUser={currentUser} rewindPlaylists={rewindPlaylists} initialView="my" notice={playlistNotice || "Playlist not found."} onCreatePlaylist={createRemotePlaylist} onNavigate={navigate} playlists={playlists} />
    ),
    "/p/:slug": <PublicPlaylist currentUser={currentUser} onFollowChanged={refreshPlaylists} publicSlug={routeState.publicSlug || ""} onNavigate={navigate} />,
    "/s/:token": <SharedPlaylist token={routeState.sharedToken || ""} onNavigate={navigate} />,
    "/movies/:tmdbId": (
      <MovieDetailsPage
        key={`movie-${routeState.tmdbId}`}
        mediaType="movie"
        tmdbId={Number(routeState.tmdbId)}
        playlists={ownedPlaylists}
        addToPlaylist={addToPlaylist}
        updateWatchStatus={updateWatchStatus}
        onNavigate={navigate}
      />
    ),
    "/tv/:tmdbId": (
      <MovieDetailsPage
        key={`tv-${routeState.tmdbId}`}
        mediaType="tv"
        tmdbId={Number(routeState.tmdbId)}
        playlists={ownedPlaylists}
        addToPlaylist={addToPlaylist}
        updateWatchStatus={updateWatchStatus}
        onNavigate={navigate}
      />
    ),
    "/actor/:id": <ActorDetailsPage actorId={Number(routeState.actorId)} onNavigate={navigate} />,
    "/person/:id": <ActorDetailsPage actorId={Number(routeState.actorId)} onNavigate={navigate} />,
    "/collection/:id": <CollectionDetailsPage collectionId={routeState.collectionId || ""} onNavigate={navigate} />,
    "/genre/:id": <DiscoveryHub kind="genre" hubId={routeState.discoveryId || ""} onNavigate={navigate} />,
    "/decade/:id": <DiscoveryHub kind="decade" hubId={routeState.discoveryId || ""} onNavigate={navigate} />,
    "/franchise/:id": <DiscoveryHub kind="franchise" hubId={routeState.discoveryId || ""} onNavigate={navigate} />,
    "/games": <TriviaGames onNavigate={navigate} />,
    "/games/title/:mediaType/:tmdbId": <TriviaGames mediaType={routeState.gamesMediaType || "movie"} tmdbId={Number(routeState.gamesTmdbId)} returnTo={routeState.returnTo} onNavigate={navigate} />,
    "/challenge/:token": <FriendChallenge token={routeState.challengeToken || ""} onNavigate={navigate} />,
    "/challenges": <SeasonalChallenges onNavigate={navigate} />,
    "/challenges/:slug": <ChallengeDetails slug={routeState.seasonalChallengeSlug || ""} onNavigate={navigate} />,
    "/progress": <Progress onNavigate={navigate} />,
    "/hall-of-fame": <HallOfFame onNavigate={navigate} />,
    "/public": playlistsPage("public"),
    "/roulette": playlistsPage("my"),
    "/profile": <Profile onNavigate={navigate} playlists={displayPlaylists} />,
    "/profile/playlists": <ProfilePlaylists onNavigate={navigate} playlists={displayPlaylists} />,
    "/profile/saved": <ProfileSaved playlists={playlists} />,
    "/profile/watched": <ProfileWatched playlists={playlists} onNavigate={navigate} updateWatchStatus={updateWatchStatus} />,
    "/followed-titles": <FollowedTitles onNavigate={navigate} />,
    "/upcoming": <UpcomingReleases playlists={ownedPlaylists} addToPlaylist={addToPlaylist} onNavigate={navigate} />,
    "/providers": playlistsPage("my"),
    "/settings": <Settings currentUser={currentUser} onNavigate={navigate} playlists={ownedPlaylists} />,
    "/signin": <AuthPage mode="signin" onAuth={handleAuthenticated} onNavigate={navigate} />,
    "/signup": <AuthPage mode="signup" onAuth={handleAuthenticated} onNavigate={navigate} />,
    "/@handle": <PublicProfile handle={routeState.handle || ""} onNavigate={navigate} />,
    "/privacy": <PrivacyPolicy />,
    "/terms": <TermsOfUse />,
    "/contact": <Contact />,
    "/help": <Help />,
    "/about": <About />,
    "/director-admin/login": <DirectorAdmin page="login" onNavigate={navigate} />,
    "/director-admin/dashboard": <DirectorAdmin page="dashboard" onNavigate={navigate} />,
    "/director-admin/playlists": <DirectorAdmin page="playlists" onNavigate={navigate} />,
    "/director-admin/playlists/:id": <DirectorAdmin page="playlist" playlistId={routeState.adminPlaylistId} onNavigate={navigate} />,
    "/director-admin/analytics": <DirectorAdmin page="analytics" onNavigate={navigate} />,
  };
  const page = pages[activeRoute] ?? playlistsPage("my");

  return (
    <div
      className={`app-shell ${isHomeRoute ? "is-home-route" : ""} ${!isHomeRoute && activeSeasonalTheme?.themeClass ? activeSeasonalTheme.themeClass : ""}`}
      data-seasonal-theme={!isHomeRoute && activeSeasonalTheme?.id ? activeSeasonalTheme.id : "default"}
      data-seasonal-theme-preview={!isHomeRoute && activeSeasonalTheme?.isPreview ? "true" : undefined}
    >
      <div className="main-shell">
        <NavigationBar activeRoute={activeRoute} currentUser={currentUser} onNavigate={navigate} onLogout={logout} />
        <main className={isHomeRoute ? "page-container home-page-container" : "page-container"}>
          {dataStatus === "loading" && !isTitleDetailRoute && !isTitleGameRoute ? <p className="empty-state">Loading playlists...</p> : null}
          {dataStatus === "error" ? <p className="error-message">{dataMessage}</p> : null}
          {dataStatus !== "loading" || isTitleDetailRoute || isTitleGameRoute ? page : null}
        </main>
        {!isHomeRoute && !isTitleGameRoute ? <Footer /> : null}
      </div>
      <InstallFlimPrompt />
      {!isDirectorAdminRoute && !isTitleGameRoute ? <div className="playlist-bottom-control" role="navigation" aria-label="Playlist controls">
        <button
          className={`bottom-control-tab ${activeRoute === "/playlists" || activeRoute === "/playlists/:id" || activeRoute === "/discover" || activeRoute === "/curators" ? "is-active" : ""}`}
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
            <Roulette playlists={roulettePlaylists || nowPlayingPlaylists} onNavigate={navigate} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
