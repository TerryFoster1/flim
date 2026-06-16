import { lazy, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { AddToPlaylistControl } from "../components/AddToPlaylistControl";
import { FollowTitleControl } from "../components/FollowTitleControl";
import { OptionalSectionBoundary } from "../components/OptionalSectionBoundary";
import { PageShell } from "../components/PageShell";
import { RecommendationShelf } from "../components/RecommendationShelf";
import { WatchStatusBadge } from "../components/WatchStatusBadge";
import { getSoundtrackAvailability } from "../services/mediaExtensionService";
import { getCurrentProfile } from "../services/profileService";
import { getMovieDetails, getTvDetails, hasTmdbApiKey } from "../services/tmdbService";
import { enqueueTitleTrivia } from "../services/triviaService";
import { getProviderAvailabilityForTitle, normalizeStreamingRegion } from "../services/watchProviderService";
import type { ContentRating } from "../types";
import type { MediaType, MovieAvailability, MovieDetails, Playlist, WatchStatus } from "../types";

const MediaExtensions = lazy(() => import("../components/MediaExtensions").then((module) => ({ default: module.MediaExtensions })));
const TitleRatingControl = lazy(() => import("../components/TitleRatingControl").then((module) => ({ default: module.TitleRatingControl })));
const TvProgressTracker = lazy(() => import("../components/TvProgressTracker").then((module) => ({ default: module.TvProgressTracker })));
const WhereToWatch = lazy(() => import("../components/WhereToWatch").then((module) => ({ default: module.WhereToWatch })));

interface MovieDetailsPageProps {
  tmdbId: number;
  mediaType?: MediaType;
  playlists: Playlist[];
  addToPlaylist: (playlistId: string, movie: MovieDetails) => void | Promise<void>;
  updateWatchStatus: (playlistId: string, tmdbId: number, watchStatus: WatchStatus, mediaType?: string) => void | Promise<void>;
  onNavigate?: (path: string) => void;
}

function countryFromRegion(value?: string) {
  const clean = value?.trim().toUpperCase();
  if (!clean) return "";
  if (clean === "CANADA") return "CA";
  if (clean === "UNITED STATES" || clean === "USA") return "US";
  return clean.slice(0, 2);
}

function genrePath(genre: string) {
  const key = genre.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (key === "science-fiction") return "/genre/sci-fi";
  return `/genre/${key || "drama"}`;
}

function chooseContentRating(ratings: ContentRating[] = [], countryCode = "") {
  const preferredCountry = countryFromRegion(countryCode);
  return (
    ratings.find((rating) => rating.countryCode === preferredCountry) ||
    ratings.find((rating) => rating.countryCode === "CA") ||
    ratings.find((rating) => rating.countryCode === "US") ||
    ratings[0]
  )?.rating;
}

function titleDateLabel(value?: string) {
  if (!value) return "";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { month: "long", day: "numeric", year: "numeric" }).format(date);
}

function releaseCountdown(value?: string) {
  if (!value) return "";
  const releaseTime = new Date(`${value}T12:00:00`).getTime();
  if (!Number.isFinite(releaseTime)) return "";
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const days = Math.ceil((releaseTime - today.getTime()) / 86400000);
  if (days > 1) return `Releases in ${days} Days`;
  if (days === 1) return "Releases Tomorrow";
  if (days === 0) return "Releases Today";
  return "";
}

function releaseWindow(releaseDate?: string, mediaType: MediaType = "movie") {
  if (!releaseDate) return "unknown";
  const releaseTime = new Date(`${releaseDate}T12:00:00`).getTime();
  if (!Number.isFinite(releaseTime)) return "unknown";
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const days = Math.ceil((releaseTime - today.getTime()) / 86400000);
  if (days > 0) return "upcoming";
  if (mediaType === "movie" && days >= -60) return "theaters";
  return "released";
}

function firstStreamingProvider(availability: MovieAvailability | null) {
  return availability?.links.find((link) => link.availabilityKnown && link.url && (link.accessType === "subscription" || link.accessType === "free"));
}

function TitleStatusBanner({ movie, region }: { movie: MovieDetails; region: string }) {
  const [availability, setAvailability] = useState<MovieAvailability | null>(null);
  const mediaType = movie.mediaType || "movie";
  const normalizedRegion = normalizeStreamingRegion(region || "CA");
  const windowState = releaseWindow(movie.releaseDate, mediaType);
  const dateText = titleDateLabel(movie.releaseDate);
  const countdown = releaseCountdown(movie.releaseDate);
  const ticketLinks = availability?.ticketLinks || [];
  const primaryTicket = ticketLinks[0];
  const streamingProvider = firstStreamingProvider(availability);

  useEffect(() => {
    let isActive = true;
    setAvailability(null);
    getProviderAvailabilityForTitle(movie, normalizedRegion)
      .then((result) => {
        if (!isActive) return;
        setAvailability(result);
      })
      .catch(() => {
        if (isActive) setAvailability(null);
      });
    return () => {
      isActive = false;
    };
  }, [movie.tmdbId, mediaType, normalizedRegion]);

  let eyebrow = mediaType === "tv" ? "Coming To Streaming" : "Coming To Theaters";
  let title = dateText || "Release Date TBA";
  let detail = countdown || (dateText ? "Follow this title for release updates." : "Follow this title for release updates.");

  if (streamingProvider) {
    return null;
  } else if (windowState === "theaters") {
    eyebrow = "In Theaters Now";
    title = primaryTicket ? "Tickets available" : "In theaters now";
    detail = "Follow for streaming availability.";
  } else if (windowState === "released") {
    return null;
  } else if (windowState === "unknown") {
    eyebrow = "Release Date TBA";
    title = mediaType === "tv" ? "Season date not announced yet" : "Theatrical date not announced yet";
    detail = "Follow this title for release and streaming updates.";
  }

  return (
    <section className={`title-status-banner title-status-${streamingProvider ? "streaming" : windowState}`} aria-label={`${movie.title} release status`}>
      <div>
        <span>{eyebrow}</span>
        <strong>{title}</strong>
        <small>{detail}</small>
      </div>
      <div className="title-status-actions">
        {primaryTicket ? (
          <a className="primary-button compact" href={primaryTicket.url} rel="noreferrer" target="_blank">
            {windowState === "upcoming" ? "Buy Advance Tickets" : "Buy Tickets"}
          </a>
        ) : null}
      </div>
    </section>
  );
}

const detailRetryDelays = [750, 1500];
const detailSlowMessageMs = 7000;
const DETAIL_CACHE_PREFIX = "flim:title-details:";
const DETAIL_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 14;

function errorReason(error: unknown) {
  return error instanceof Error ? error.message : "Unknown title details error.";
}

function logDetailsLoad(event: string, details: Record<string, unknown>) {
  console.warn(event, {
    route: typeof window !== "undefined" ? `${window.location.pathname}${window.location.search}` : "",
    ...details,
  });
}

function detailCacheKey(mediaType: MediaType, tmdbId: number) {
  return `${DETAIL_CACHE_PREFIX}${mediaType}:${tmdbId}`;
}

function readCachedDetails(mediaType: MediaType, tmdbId: number) {
  if (typeof window === "undefined" || !Number.isFinite(tmdbId)) return null;
  try {
    const raw = window.sessionStorage.getItem(detailCacheKey(mediaType, tmdbId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { cachedAt?: number; details?: MovieDetails };
    if (!parsed.cachedAt || Date.now() - parsed.cachedAt > DETAIL_CACHE_TTL_MS) {
      window.sessionStorage.removeItem(detailCacheKey(mediaType, tmdbId));
      return null;
    }
    return hasCoreTitleData(parsed.details, mediaType, tmdbId) ? parsed.details || null : null;
  } catch {
    return null;
  }
}

function writeCachedDetails(mediaType: MediaType, tmdbId: number, details: MovieDetails) {
  if (typeof window === "undefined" || !hasCoreTitleData(details, mediaType, tmdbId)) return;
  try {
    window.sessionStorage.setItem(detailCacheKey(mediaType, tmdbId), JSON.stringify({ cachedAt: Date.now(), details }));
  } catch {
    // Best effort only; network/server cache remains the source of truth.
  }
}

function OptionalLoading({ label }: { label: string }) {
  return <section className="optional-section-fallback"><p>{label} is loading...</p></section>;
}

function TitleTriviaGamesCard({ movie, onNavigate }: { movie: MovieDetails; onNavigate?: (path: string) => void }) {
  const mediaType = movie.mediaType || "movie";
  const gamePath = `/games/title/${mediaType}/${movie.tmdbId}`;

  function openGames() {
    const returnTo = `${window.location.pathname}${window.location.search}`;
    const path = `${gamePath}?returnTo=${encodeURIComponent(returnTo)}`;
    if (onNavigate) {
      onNavigate(path);
      return;
    }
    window.location.assign(path);
  }

  return (
    <section className="title-games-entry-card" aria-label={`Trivia and games for ${movie.title}`}>
      <button className="reset-button title-games-entry-button" onClick={openGames} type="button">
        <div className="title-games-entry-art" aria-hidden="true">
          {movie.backdropUrl || movie.posterUrl ? <img alt="" src={movie.backdropUrl || movie.posterUrl} /> : <span />}
          <strong>?</strong>
        </div>
        <div className="title-games-entry-copy">
          <span>Movie Companion</span>
          <h2>Trivia & Games</h2>
          <p>Play title trivia, challenge friends, and explore Flim Arcade modes for {movie.title}.</p>
          <em>Play Now</em>
        </div>
      </button>
    </section>
  );
}

function TitleSoundtrackCard({ movie }: { movie: MovieDetails }) {
  const soundtrack = getSoundtrackAvailability(movie);
  const link = soundtrack.soundtrack?.links[0];

  return (
    <section className="media-extensions soundtrack-section" aria-label={`${movie.title} soundtrack`}>
      <div className="media-extension-heading">
        <h2>Soundtrack</h2>
      </div>
      <div className="media-extension-grid compact-media-extension-grid">
        <a
          className="media-extension-card media-extension-card-action soundtrack-card compact-extension-card"
          href={link?.url}
          rel="noreferrer"
          target="_blank"
          aria-label={`Listen to ${movie.title} soundtrack on Spotify`}
        >
          <div className="compact-extension-copy">
            <h3>Listen to the soundtrack</h3>
            <span className="round-media-link spotify-link" aria-hidden="true">
              <img alt="" src="/provider-icons/spotify.png" />
            </span>
            <p>{link ? soundtrack.notes : "Soundtrack not available yet."}</p>
          </div>
        </a>
      </div>
    </section>
  );
}

function DetailsSkeleton({ mediaType, retryCount, isSlow }: { mediaType: MediaType; retryCount: number; isSlow?: boolean }) {
  return (
    <section className="route-page" aria-busy="true">
      <div className="movie-detail-hero movie-detail-skeleton">
        <div className="movie-detail-poster skeleton-block" aria-hidden="true" />
        <div className="movie-detail-copy">
          <div className="skeleton-line skeleton-title" aria-hidden="true" />
          <div className="skeleton-meta-row" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div className="skeleton-line" aria-hidden="true" />
          <div className="skeleton-line short" aria-hidden="true" />
          <p className="helper-text">
            {retryCount > 0
              ? `Having trouble loading details. Trying again... (${retryCount}/2)`
              : isSlow
                ? "Details are taking longer than expected. Still loading..."
              : `Loading ${mediaType === "tv" ? "show" : "movie"} details...`}
          </p>
        </div>
      </div>
    </section>
  );
}

function hasCoreTitleData(
  details: MovieDetails | null | undefined,
  expectedType: MediaType,
  expectedTmdbId: number,
): details is MovieDetails & { tmdbId: number; title: string; mediaType: MediaType } {
  const id = Number(details?.tmdbId);
  const type = details?.mediaType || expectedType;
  const title = typeof details?.title === "string" ? details.title.trim() : "";
  return Number.isFinite(id) && id === expectedTmdbId && type === expectedType && title.length > 0;
}

export function MovieDetailsPage({ tmdbId, mediaType = "movie", playlists, addToPlaylist, updateWatchStatus, onNavigate }: MovieDetailsPageProps) {
  const [movie, setMovie] = useState<MovieDetails | null>(null);
  const [streamingCountry, setStreamingCountry] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "slow" | "retrying" | "error">("loading");
  const [retryCount, setRetryCount] = useState(0);
  const [loadNonce, setLoadNonce] = useState(0);
  const requestedRefreshModeRef = useRef<"default" | "cache-first">("default");
  const sourcePlaylistId = useMemo(() => new URLSearchParams(window.location.search).get("playlist") || undefined, [mediaType, tmdbId]);
  const savedInstances = useMemo(() => playlists.flatMap((playlist) => playlist.movies.map((item) => ({ playlist, item }))).filter(({ item }) => item.tmdbId === tmdbId && (item.mediaType || "movie") === mediaType), [playlists, tmdbId, mediaType]);
  const watched = savedInstances.some(({ item }) => item.watchStatus === "watched");
  const allSavedInstancesWatched = savedInstances.length > 0 && savedInstances.every(({ item }) => item.watchStatus === "watched");
  const normalizedMovie = useMemo(() => {
    if (!hasCoreTitleData(movie, mediaType, tmdbId)) return null;
    return {
      ...movie,
      mediaType: movie.mediaType || mediaType,
      overview: movie.overview || "No overview is available yet.",
      genres: Array.isArray(movie.genres) ? movie.genres.filter(Boolean) : [],
      contentRatings: Array.isArray(movie.contentRatings) ? movie.contentRatings : [],
    };
  }, [movie, mediaType, tmdbId]);
  const contentRating = chooseContentRating(normalizedMovie?.contentRatings, streamingCountry) || normalizedMovie?.contentRating;
  const detailsKey = `${mediaType}-${tmdbId}`;

  useEffect(() => {
    setMovie(null);
    setStatus("loading");
    setRetryCount(0);
    setLoadNonce(0);
    requestedRefreshModeRef.current = "default";
  }, [detailsKey]);

  useEffect(() => {
    let mounted = true;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let slowTimer: ReturnType<typeof setTimeout> | null = null;
    const wait = (delay: number) => new Promise<void>((resolve) => {
      retryTimer = setTimeout(resolve, delay);
    });

    async function loadMovie() {
      if (!hasTmdbApiKey() || !Number.isFinite(tmdbId)) {
        setStatus("error");
        return;
      }
      slowTimer = setTimeout(() => {
        if (!mounted) return;
        setStatus((current) => current === "loading" ? "slow" : current);
        logDetailsLoad("title_details_slow_pending", {
          tmdbId,
          mediaType,
          retryCount,
          hasCoreData: false,
          optionalSection: false,
          pendingMs: detailSlowMessageMs,
        });
      }, detailSlowMessageMs);
      const cachedDetails = readCachedDetails(mediaType, tmdbId);
      if (cachedDetails) {
        setMovie(cachedDetails);
        setStatus("idle");
        logDetailsLoad("title_details_client_cache_hit", {
          tmdbId,
          mediaType,
          hasCoreData: true,
          optionalSection: false,
        });
      } else {
        setMovie(null);
        setStatus("loading");
      }
      setRetryCount(0);

      let finalError: unknown = null;
      for (let attempt = 0; attempt <= detailRetryDelays.length; attempt += 1) {
        const startedAt = performance.now();
        try {
          const refreshMode = requestedRefreshModeRef.current === "cache-first" || attempt > 0 ? "cache-first" : undefined;
          const details = mediaType === "tv"
            ? await getTvDetails(tmdbId, { refreshMode, timeoutMs: 45000 })
            : await getMovieDetails(tmdbId, { refreshMode, timeoutMs: 45000 });
          if (!hasCoreTitleData(details, mediaType, tmdbId)) {
            throw new Error("Title details response was missing core title data.");
          }
          writeCachedDetails(mediaType, tmdbId, details);
          if (mounted) {
            if (slowTimer) {
              clearTimeout(slowTimer);
              slowTimer = null;
            }
            setMovie(details);
            setStatus("idle");
            setRetryCount(0);
            requestedRefreshModeRef.current = "default";
            logDetailsLoad("title_details_load_success", {
              tmdbId,
              mediaType,
              retryCount: attempt,
              refreshMode: refreshMode || "default",
              durationMs: Math.round(performance.now() - startedAt),
              hasCoreData: true,
              optionalSection: false,
            });
          }
          return;
        } catch (error) {
          finalError = error;
          if (!mounted) return;

          if (attempt < detailRetryDelays.length) {
            const nextRetryCount = attempt + 1;
            if (!cachedDetails) setStatus("retrying");
            setRetryCount(nextRetryCount);
            logDetailsLoad("title_details_retrying", {
              tmdbId,
              mediaType,
              retryCount: nextRetryCount,
              refreshMode: nextRetryCount > 0 ? "cache-first" : "default",
              reason: errorReason(error),
              hasCoreData: Boolean(cachedDetails),
              optionalSection: false,
              retryDelayMs: detailRetryDelays[attempt],
              durationMs: Math.round(performance.now() - startedAt),
            });
            await wait(detailRetryDelays[attempt]);
          }
        }
      }

      logDetailsLoad("title_details_load_failed", {
        tmdbId,
        mediaType,
        retryCount: detailRetryDelays.length,
        reason: errorReason(finalError),
        hasCoreData: Boolean(cachedDetails),
        optionalSection: false,
      });
      if (slowTimer) {
        clearTimeout(slowTimer);
        slowTimer = null;
      }
      if (mounted) setStatus(cachedDetails ? "idle" : "error");
    }

    loadMovie();
    return () => {
      mounted = false;
      if (retryTimer) clearTimeout(retryTimer);
      if (slowTimer) clearTimeout(slowTimer);
    };
  }, [tmdbId, mediaType, loadNonce]);

  useEffect(() => {
    if (Number.isFinite(tmdbId)) {
      enqueueTitleTrivia({ mediaType, tmdbId, source: "details" });
    }
  }, [mediaType, tmdbId]);

  useEffect(() => {
    let mounted = true;
    getCurrentProfile()
      .then((profile) => {
        if (mounted) setStreamingCountry(profile.countryCode || profile.streamingRegion || "");
      })
      .catch(() => {
        if (mounted) setStreamingCountry("");
      });
    return () => {
      mounted = false;
    };
  }, []);

  if (status === "loading" || status === "slow" || status === "retrying" || (!normalizedMovie && status !== "error")) {
    return <DetailsSkeleton mediaType={mediaType} retryCount={status === "retrying" ? retryCount : 0} isSlow={status === "slow"} />;
  }

  if (!normalizedMovie) {
    return (
      <PageShell
        eyebrow={mediaType === "tv" ? "TV Show" : "Movie"}
        title="Details are taking longer than expected."
        description="The title did not load after a couple of attempts. Refresh the details from this page."
        action={<button className="primary-button" onClick={() => {
          logDetailsLoad("title_details_manual_refresh", {
            tmdbId,
            mediaType,
            refreshMode: "cache-first",
            hasCoreData: false,
            optionalSection: false,
          });
          requestedRefreshModeRef.current = "cache-first";
          setMovie(null);
          setStatus("loading");
          setRetryCount(0);
          setLoadNonce((current) => current + 1);
        }} type="button" aria-label="Refresh title details">Refresh Details</button>}
      />
    );
  }

  return (
    <section className="route-page movie-details-page">
      <div className="movie-detail-hero" style={normalizedMovie.backdropUrl ? { "--movie-backdrop": `url("${normalizedMovie.backdropUrl}")` } as CSSProperties : undefined}>
        {normalizedMovie.backdropUrl ? <div className="movie-detail-backdrop" aria-hidden="true" /> : null}
        {normalizedMovie.posterUrl ? <img className="movie-detail-poster" src={normalizedMovie.posterUrl} alt={`${normalizedMovie.title} poster`} /> : <div className="poster tone-blue" />}
        <div className="movie-detail-copy">
          <h1>{normalizedMovie.title}</h1>
          <TitleStatusBanner movie={normalizedMovie} region={streamingCountry} />
          <div className="meta-row">
            {normalizedMovie.releaseYear ? <span>{normalizedMovie.releaseYear}</span> : null}
            {normalizedMovie.runtimeMinutes ? <span>{normalizedMovie.runtimeMinutes} min</span> : null}
            {normalizedMovie.seasonCount ? <span>{normalizedMovie.seasonCount} seasons</span> : null}
            {normalizedMovie.episodeCount ? <span>{normalizedMovie.episodeCount} episodes</span> : null}
            {contentRating ? <span>{contentRating}</span> : null}
            <WatchStatusBadge label={watched ? "Watched" : "Not watched"} />
          </div>
          <p>{normalizedMovie.overview}</p>
          {normalizedMovie.genres.length > 0 ? (
            <div className="genre-strip">
              {normalizedMovie.genres.map((genre) => (
                <button className="genre-chip" key={genre} onClick={() => onNavigate?.(genrePath(genre))} type="button">{genre}</button>
              ))}
            </div>
          ) : null}
          <div className="title-primary-actions">
            <AddToPlaylistControl addToPlaylist={(playlistId) => addToPlaylist(playlistId, normalizedMovie)} currentPlaylistId={sourcePlaylistId} movie={normalizedMovie} playlists={playlists} />
            <FollowTitleControl movie={normalizedMovie} />
          </div>
          {savedInstances.length > 0 ? (
            <div className="title-secondary-actions">
              <button
                className={allSavedInstancesWatched ? "watched-toggle is-watched" : "watched-toggle"}
                onClick={() => {
                  const nextStatus = allSavedInstancesWatched ? "not_watched" : "watched";
                  savedInstances.forEach(({ playlist }) => {
                    void updateWatchStatus(playlist.id, tmdbId, nextStatus, mediaType);
                  });
                }}
                type="button"
              >
                {allSavedInstancesWatched ? "Watched ✓" : "Mark as Watched"}
              </button>
            </div>
          ) : null}
          <OptionalSectionBoundary key={`rating-${detailsKey}`} label="Title rating">
            <Suspense fallback={<OptionalLoading label="Title rating" />}>
              <TitleRatingControl mediaType={normalizedMovie.mediaType || mediaType} tmdbId={normalizedMovie.tmdbId} />
            </Suspense>
          </OptionalSectionBoundary>
          <OptionalSectionBoundary key={`where-${detailsKey}`} label="Where To Watch">
            <Suspense fallback={<OptionalLoading label="Where To Watch" />}>
              <WhereToWatch movie={normalizedMovie} />
            </Suspense>
          </OptionalSectionBoundary>
          {normalizedMovie.cast && normalizedMovie.cast.length > 0 ? (
            <section className="cast-section">
              <div className="actor-section-heading">
                <h2>Cast</h2>
                <span>{normalizedMovie.cast.length}</span>
              </div>
              <div className="cast-member-row">
                {normalizedMovie.cast.map((member) => (
                  <button
                    className="cast-member-card"
                    key={member.tmdbId}
                    onClick={() => onNavigate ? onNavigate(`/actor/${member.tmdbId}`) : window.location.assign(`/actor/${member.tmdbId}`)}
                    type="button"
                  >
                    {member.profileUrl ? <img alt={`${member.name} profile`} src={member.profileUrl} /> : <span className="cast-avatar-fallback">{member.name.slice(0, 1)}</span>}
                    <strong>{member.name}</strong>
                    {member.character ? <small>{member.character}</small> : null}
                  </button>
                ))}
              </div>
            </section>
          ) : null}
          {mediaType === "tv" ? (
            <OptionalSectionBoundary key={`progress-${detailsKey}`} label="TV progress">
              <Suspense fallback={<OptionalLoading label="TV progress" />}>
                <TvProgressTracker show={normalizedMovie} />
              </Suspense>
            </OptionalSectionBoundary>
          ) : null}
          <OptionalSectionBoundary key={`extensions-${detailsKey}`} label="Trailers and extras">
            <Suspense fallback={<OptionalLoading label="Trailers and extras" />}>
              <MediaExtensions media={normalizedMovie} onNavigate={onNavigate} />
            </Suspense>
          </OptionalSectionBoundary>
          <TitleTriviaGamesCard movie={normalizedMovie} onNavigate={onNavigate} />
          <TitleSoundtrackCard movie={normalizedMovie} />
          {onNavigate ? (
            <OptionalSectionBoundary key={`recommendations-${detailsKey}`} label="Recommendations">
              <RecommendationShelf
                title="You May Also Like"
                mediaType={normalizedMovie.mediaType || mediaType}
                tmdbId={normalizedMovie.tmdbId}
                onNavigate={onNavigate}
                limit={8}
              />
            </OptionalSectionBoundary>
          ) : null}
        </div>
      </div>
    </section>
  );
}
