import { useEffect, useMemo, useState } from "react";
import { AddToPlaylistControl } from "../components/AddToPlaylistControl";
import { FollowTitleControl } from "../components/FollowTitleControl";
import { MediaExtensions } from "../components/MediaExtensions";
import { OptionalSectionBoundary } from "../components/OptionalSectionBoundary";
import { PageShell } from "../components/PageShell";
import { TvProgressTracker } from "../components/TvProgressTracker";
import { WhereToWatch } from "../components/WhereToWatch";
import { WatchStatusBadge } from "../components/WatchStatusBadge";
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

export function MovieDetailsPage({ tmdbId, mediaType = "movie", playlists, addToPlaylist, updateWatchStatus }: MovieDetailsPageProps) {
  const [movie, setMovie] = useState<MovieDetails | null>(null);
  const [streamingCountry, setStreamingCountry] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const sourcePlaylistId = useMemo(() => new URLSearchParams(window.location.search).get("playlist") || undefined, [mediaType, tmdbId]);
  const savedInstances = useMemo(() => playlists.flatMap((playlist) => playlist.movies.map((item) => ({ playlist, item }))).filter(({ item }) => item.tmdbId === tmdbId && (item.mediaType || "movie") === mediaType), [playlists, tmdbId, mediaType]);
  const watched = savedInstances.some(({ item }) => item.watchStatus === "watched");
  const contentRating = chooseContentRating(movie?.contentRatings, streamingCountry) || movie?.contentRating;
  const detailsKey = `${mediaType}-${tmdbId}`;

  useEffect(() => {
    let mounted = true;
    async function loadMovie() {
      if (!hasTmdbApiKey() || !Number.isFinite(tmdbId)) {
        setStatus("error");
        return;
      }
      setStatus("loading");
      try {
        const details = mediaType === "tv" ? await getTvDetails(tmdbId) : await getMovieDetails(tmdbId);
        if (mounted) {
          setMovie(details);
          setStatus("idle");
        }
      } catch (error) {
        console.error("title_details_load_failed", mediaType, tmdbId, error instanceof Error ? error.message : "Unknown title details error.");
        if (mounted) setStatus("error");
      }
    }
    loadMovie();
    return () => {
      mounted = false;
    };
  }, [tmdbId, mediaType]);

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

  if (status === "loading") {
    return <PageShell eyebrow={mediaType === "tv" ? "TV Show" : "Movie"} title={`Loading ${mediaType === "tv" ? "show" : "movie"}...`} description="Loading title details." />;
  }

  if (!movie) {
    return (
      <PageShell eyebrow={mediaType === "tv" ? "TV Show" : "Movie"} title="Details unavailable" description="Details could not be loaded right now. Please try again shortly." />
    );
  }

  return (
    <section className="route-page">
      <div className="movie-detail-hero">
        {movie.posterUrl ? <img className="movie-detail-poster" src={movie.posterUrl} alt={`${movie.title} poster`} /> : <div className="poster tone-blue" />}
        <div className="movie-detail-copy">
          <h1>{movie.title}</h1>
          <div className="meta-row">
            {movie.releaseYear ? <span>{movie.releaseYear}</span> : null}
            {movie.runtimeMinutes ? <span>{movie.runtimeMinutes} min</span> : null}
            {movie.seasonCount ? <span>{movie.seasonCount} seasons</span> : null}
            {movie.episodeCount ? <span>{movie.episodeCount} episodes</span> : null}
            {contentRating ? <span>{contentRating}</span> : null}
            <WatchStatusBadge label={watched ? "Watched" : "Not watched"} />
          </div>
          <p>{movie.overview}</p>
          <div className="genre-strip">
            {movie.genres.map((genre) => (
              <span className="genre-chip" key={genre}>{genre}</span>
            ))}
          </div>
          <div className="button-row">
            <AddToPlaylistControl addToPlaylist={(playlistId) => addToPlaylist(playlistId, movie)} currentPlaylistId={sourcePlaylistId} movie={movie} playlists={playlists} />
            <FollowTitleControl movie={movie} />
            {savedInstances.map(({ playlist, item }) => (
              <button
                className={item.watchStatus === "watched" ? "watched-toggle is-watched" : "watched-toggle"}
                key={playlist.id}
                onClick={() => updateWatchStatus(playlist.id, tmdbId, item.watchStatus === "watched" ? "not_watched" : "watched", mediaType)}
                type="button"
              >
                {item.watchStatus === "watched" ? "✓ Watched" : "Mark Watched"}
                <span>{playlist.name}</span>
              </button>
            ))}
          </div>
          <OptionalSectionBoundary key={`where-${detailsKey}`} label="Where To Watch">
            <WhereToWatch movie={movie} />
          </OptionalSectionBoundary>
          {mediaType === "tv" ? (
            <OptionalSectionBoundary key={`progress-${detailsKey}`} label="TV progress">
              <TvProgressTracker show={movie} />
            </OptionalSectionBoundary>
          ) : null}
          <OptionalSectionBoundary key={`extensions-${detailsKey}`} label="Trailers and extras">
            <MediaExtensions media={movie} />
          </OptionalSectionBoundary>
        </div>
      </div>
    </section>
  );
}
