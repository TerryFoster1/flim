import { useEffect, useMemo, useState } from "react";
import { AddToPlaylistControl } from "../components/AddToPlaylistControl";
import { MediaExtensions } from "../components/MediaExtensions";
import { PageShell } from "../components/PageShell";
import { WhereToWatch } from "../components/WhereToWatch";
import { WatchStatusBadge } from "../components/WatchStatusBadge";
import { getMovieDetails, getTvDetails, hasTmdbApiKey } from "../services/tmdbService";
import type { MediaType, MovieDetails, Playlist, WatchStatus } from "../types";

interface MovieDetailsPageProps {
  tmdbId: number;
  mediaType?: MediaType;
  playlists: Playlist[];
  addToPlaylist: (playlistId: string, movie: MovieDetails) => void | Promise<void>;
  updateWatchStatus: (playlistId: string, tmdbId: number, watchStatus: WatchStatus) => void | Promise<void>;
}

export function MovieDetailsPage({ tmdbId, mediaType = "movie", playlists, addToPlaylist, updateWatchStatus }: MovieDetailsPageProps) {
  const [movie, setMovie] = useState<MovieDetails | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const savedInstances = useMemo(() => playlists.flatMap((playlist) => playlist.movies.map((item) => ({ playlist, item }))).filter(({ item }) => item.tmdbId === tmdbId && (item.mediaType || "movie") === mediaType), [playlists, tmdbId, mediaType]);
  const watched = savedInstances.some(({ item }) => item.watchStatus === "watched");

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
      } catch {
        if (mounted) setStatus("error");
      }
    }
    loadMovie();
    return () => {
      mounted = false;
    };
  }, [tmdbId, mediaType]);

  if (status === "loading") {
    return <PageShell eyebrow={mediaType === "tv" ? "TV Show" : "Movie"} title={`Loading ${mediaType === "tv" ? "show" : "movie"}...`} description="Fetching details from TMDb." />;
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
          <span className="eyebrow">{mediaType === "tv" ? "TMDb TV show" : "TMDb movie"}</span>
          <h1>{movie.title}</h1>
          <div className="meta-row">
            {movie.releaseYear ? <span>{movie.releaseYear}</span> : null}
            {movie.runtimeMinutes ? <span>{movie.runtimeMinutes} min</span> : null}
            {movie.seasonCount ? <span>{movie.seasonCount} seasons</span> : null}
            {movie.episodeCount ? <span>{movie.episodeCount} episodes</span> : null}
            <WatchStatusBadge label={watched ? "Watched" : "Not watched"} />
          </div>
          <p>{movie.overview}</p>
          <div className="genre-strip">
            {movie.genres.map((genre) => (
              <span className="genre-chip" key={genre}>{genre}</span>
            ))}
          </div>
          <div className="button-row">
            <AddToPlaylistControl addToPlaylist={(playlistId) => addToPlaylist(playlistId, movie)} movie={movie} playlists={playlists} />
            {savedInstances.map(({ playlist, item }) => (
              <label className="watched-toggle" key={playlist.id}>
                <input
                  checked={item.watchStatus === "watched"}
                  onChange={(event) => updateWatchStatus(playlist.id, tmdbId, event.target.checked ? "watched" : "not_watched")}
                  type="checkbox"
                />
                Watched in {playlist.name}
              </label>
            ))}
          </div>
          <WhereToWatch movie={movie} />
          <MediaExtensions media={movie} />
        </div>
      </div>
    </section>
  );
}
