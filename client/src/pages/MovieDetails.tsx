import { useEffect, useMemo, useState } from "react";
import { AddToPlaylistControl } from "../components/AddToPlaylistControl";
import { FollowTitleControl } from "../components/FollowTitleControl";
import { MediaExtensions } from "../components/MediaExtensions";
import { OptionalSectionBoundary } from "../components/OptionalSectionBoundary";
import { PageShell } from "../components/PageShell";
import { TitleRatingControl } from "../components/TitleRatingControl";
import { TvProgressTracker } from "../components/TvProgressTracker";
import { WatchStatusBadge } from "../components/WatchStatusBadge";
import { WhereToWatch } from "../components/WhereToWatch";
import { getCurrentProfile } from "../services/profileService";
import { getMovieDetails, getTvDetails, hasTmdbApiKey } from "../services/tmdbService";
import type { ContentRating } from "../types";
import type { MediaType, MovieDetails, Playlist, WatchStatus } from "../types";

interface MovieDetailsPageProps {
  tmdbId: number;
  mediaType?: MediaType;
  playlists: Playlist[];
  addToPlaylist: (playlistId: string, movie: MovieDetails) => void | Promise<void>;
  updateWatchStatus: (playlistId: string, tmdbId: number, watchStatus: WatchStatus, mediaType?: string) => void | Promise<void>;
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

export function MovieDetailsPage({ tmdbId, mediaType = "movie", playlists, addToPlaylist, updateWatchStatus }: MovieDetailsPageProps) {
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
        title="Details unavailable"
        description="Details unavailable. Try refreshing."
        action={<button className="primary-button" onClick={() => setLoadVersion((current) => current + 1)} type="button">Try again</button>}
      />
    );
  }

  return (
    <section className="route-page">
      <div className="movie-detail-hero">
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
          <TitleRatingControl mediaType={normalizedMovie.mediaType || mediaType} tmdbId={normalizedMovie.tmdbId} />
          <OptionalSectionBoundary key={`where-${detailsKey}`} label="Where To Watch">
            <WhereToWatch movie={normalizedMovie} />
          </OptionalSectionBoundary>
          {mediaType === "tv" ? (
            <OptionalSectionBoundary key={`progress-${detailsKey}`} label="TV progress">
              <TvProgressTracker show={normalizedMovie} />
            </OptionalSectionBoundary>
          ) : null}
          <OptionalSectionBoundary key={`extensions-${detailsKey}`} label="Trailers and extras">
            <MediaExtensions media={normalizedMovie} />
          </OptionalSectionBoundary>
        </div>
      </div>
    </section>
  );
}
