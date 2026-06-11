import { lazy, Suspense, useEffect, useMemo, useState, type CSSProperties } from "react";
import { AddToPlaylistControl } from "../components/AddToPlaylistControl";
import { FollowTitleControl } from "../components/FollowTitleControl";
import { OptionalSectionBoundary } from "../components/OptionalSectionBoundary";
import { PageShell } from "../components/PageShell";
import { WatchStatusBadge } from "../components/WatchStatusBadge";
import { getCurrentProfile } from "../services/profileService";
import { getMovieDetails, getTvDetails, hasTmdbApiKey } from "../services/tmdbService";
import type { ContentRating } from "../types";
import type { MediaType, MovieDetails, Playlist, WatchStatus } from "../types";

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

function chooseContentRating(ratings: ContentRating[] = [], countryCode = "") {
  const preferredCountry = countryFromRegion(countryCode);
  return (
    ratings.find((rating) => rating.countryCode === preferredCountry) ||
    ratings.find((rating) => rating.countryCode === "CA") ||
    ratings.find((rating) => rating.countryCode === "US") ||
    ratings[0]
  )?.rating;
}

const detailRetryDelays = [750, 1500];

function errorReason(error: unknown) {
  return error instanceof Error ? error.message : "Unknown title details error.";
}

function OptionalLoading({ label }: { label: string }) {
  return <section className="optional-section-fallback"><p>{label} is loading...</p></section>;
}

function hasCoreTitleData(details: MovieDetails | null | undefined, expectedType: MediaType, expectedTmdbId: number) {
  const id = Number(details?.tmdbId);
  const type = details?.mediaType || expectedType;
  const title = typeof details?.title === "string" ? details.title.trim() : "";
  return Number.isFinite(id) && id === expectedTmdbId && type === expectedType && title.length > 0;
}

export function MovieDetailsPage({ tmdbId, mediaType = "movie", playlists, addToPlaylist, updateWatchStatus, onNavigate }: MovieDetailsPageProps) {
  const [movie, setMovie] = useState<MovieDetails | null>(null);
  const [streamingCountry, setStreamingCountry] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "retrying" | "error">("idle");
  const [retryCount, setRetryCount] = useState(0);
  const [loadVersion, setLoadVersion] = useState(0);
  const sourcePlaylistId = useMemo(() => new URLSearchParams(window.location.search).get("playlist") || undefined, [mediaType, tmdbId]);
  const savedInstances = useMemo(() => playlists.flatMap((playlist) => playlist.movies.map((item) => ({ playlist, item }))).filter(({ item }) => item.tmdbId === tmdbId && (item.mediaType || "movie") === mediaType), [playlists, tmdbId, mediaType]);
  const watched = savedInstances.some(({ item }) => item.watchStatus === "watched");
  const allSavedInstancesWatched = savedInstances.length > 0 && savedInstances.every(({ item }) => item.watchStatus === "watched");
  const normalizedMovie = useMemo(() => {
    if (!movie) return null;
    return {
      ...movie,
      mediaType: movie.mediaType || mediaType,
      overview: movie.overview || "No overview is available yet.",
      genres: Array.isArray(movie.genres) ? movie.genres.filter(Boolean) : [],
      contentRatings: Array.isArray(movie.contentRatings) ? movie.contentRatings : [],
    };
  }, [movie, mediaType]);
  const contentRating = chooseContentRating(normalizedMovie?.contentRatings, streamingCountry) || normalizedMovie?.contentRating;
  const detailsKey = `${mediaType}-${tmdbId}`;

  useEffect(() => {
    let mounted = true;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const route = `/${mediaType === "tv" ? "tv" : "movies"}/${tmdbId}`;
    const wait = (delay: number) => new Promise<void>((resolve) => {
      retryTimer = setTimeout(resolve, delay);
    });

    async function loadMovie() {
      if (!hasTmdbApiKey() || !Number.isFinite(tmdbId)) {
        setStatus("error");
        return;
      }
      setMovie(null);
      setStatus("loading");
      setRetryCount(0);

      let finalError: unknown = null;
      for (let attempt = 0; attempt <= detailRetryDelays.length; attempt += 1) {
        try {
          const details = mediaType === "tv"
            ? await getTvDetails(tmdbId, { bypassCache: attempt > 0 })
            : await getMovieDetails(tmdbId, { bypassCache: attempt > 0 });
          if (!hasCoreTitleData(details, mediaType, tmdbId)) {
            throw new Error("Title details response was missing core title data.");
          }
          if (mounted) {
            setMovie(details);
            setStatus("idle");
            setRetryCount(0);
          }
          return;
        } catch (error) {
          finalError = error;
          if (!mounted) return;

          if (attempt < detailRetryDelays.length) {
            const nextRetryCount = attempt + 1;
            setStatus("retrying");
            setRetryCount(nextRetryCount);
            console.warn("title_details_retrying", {
              route,
              tmdbId,
              mediaType,
              retryCount: nextRetryCount,
              reason: errorReason(error),
              hasCoreData: false,
              optionalSection: false,
            });
            await wait(detailRetryDelays[attempt]);
          }
        }
      }

      console.error("title_details_load_failed", {
        route,
        tmdbId,
        mediaType,
        retryCount: detailRetryDelays.length,
        reason: errorReason(finalError),
        hasCoreData: false,
        optionalSection: false,
      });
      if (mounted) setStatus("error");
    }

    loadMovie();
    return () => {
      mounted = false;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [tmdbId, mediaType, loadVersion]);

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

  if (status === "loading" || status === "retrying") {
    return (
      <PageShell
        eyebrow={mediaType === "tv" ? "TV Show" : "Movie"}
        title={`Loading ${mediaType === "tv" ? "show" : "movie"}...`}
        description={status === "retrying" ? `Having trouble loading details. Trying again... (${retryCount}/2)` : "Loading title details."}
      />
    );
  }

  if (!normalizedMovie) {
    return (
      <PageShell
        eyebrow={mediaType === "tv" ? "TV Show" : "Movie"}
        title="Details are taking longer than expected."
        description="Refresh the title details without leaving this page."
        action={<button className="primary-button" onClick={() => {
          setMovie(null);
          setStatus("loading");
          setLoadVersion((current) => current + 1);
        }} type="button" aria-label="Refresh title details">Refresh Details</button>}
      />
    );
  }

  return (
    <section className="route-page">
      <div className="movie-detail-hero" style={normalizedMovie.backdropUrl ? { "--movie-backdrop": `url("${normalizedMovie.backdropUrl}")` } as CSSProperties : undefined}>
        {normalizedMovie.backdropUrl ? <div className="movie-detail-backdrop" aria-hidden="true" /> : null}
        {normalizedMovie.posterUrl ? <img className="movie-detail-poster" src={normalizedMovie.posterUrl} alt={`${normalizedMovie.title} poster`} /> : <div className="poster tone-blue" />}
        <div className="movie-detail-copy">
          <h1>{normalizedMovie.title}</h1>
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
                <span className="genre-chip" key={genre}>{genre}</span>
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
          <OptionalSectionBoundary key={`where-${detailsKey}`} label="Where To Watch">
            <Suspense fallback={<OptionalLoading label="Where To Watch" />}>
              <WhereToWatch movie={normalizedMovie} />
            </Suspense>
          </OptionalSectionBoundary>
          {mediaType === "tv" ? (
            <OptionalSectionBoundary key={`progress-${detailsKey}`} label="TV progress">
              <Suspense fallback={<OptionalLoading label="TV progress" />}>
                <TvProgressTracker show={normalizedMovie} />
              </Suspense>
            </OptionalSectionBoundary>
          ) : null}
          <OptionalSectionBoundary key={`extensions-${detailsKey}`} label="Trailers and extras">
            <Suspense fallback={<OptionalLoading label="Trailers and extras" />}>
              <MediaExtensions media={normalizedMovie} />
            </Suspense>
          </OptionalSectionBoundary>
        </div>
      </div>
    </section>
  );
}
