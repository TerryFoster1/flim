import { useEffect, useMemo, useState } from "react";
import { AddToPlaylistControl } from "../components/AddToPlaylistControl";
import { PageShell } from "../components/PageShell";
import { ProviderRow } from "../components/ProviderRow";
import { WatchStatusBadge } from "../components/WatchStatusBadge";
import { getMovieDetails, hasTmdbApiKey } from "../services/tmdbService";
import type { MovieDetails, Playlist, WatchStatus } from "../types";

interface MovieDetailsPageProps {
  tmdbId: number;
  playlists: Playlist[];
  addToPlaylist: (playlistId: string, movie: MovieDetails) => void;
  updateWatchStatus: (playlistId: string, tmdbId: number, watchStatus: WatchStatus) => void;
}

export function MovieDetailsPage({ tmdbId, playlists, addToPlaylist, updateWatchStatus }: MovieDetailsPageProps) {
  const [movie, setMovie] = useState<MovieDetails | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const savedInstances = useMemo(() => playlists.flatMap((playlist) => playlist.movies.map((item) => ({ playlist, item }))).filter(({ item }) => item.tmdbId === tmdbId), [playlists, tmdbId]);
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
        const details = await getMovieDetails(tmdbId);
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
  }, [tmdbId]);

  if (status === "loading") {
    return <PageShell eyebrow="Movie" title="Loading movie..." description="Fetching movie details from TMDb." />;
  }

  if (!movie) {
    return (
      <PageShell eyebrow="Movie" title="Movie details unavailable" description="Add VITE_TMDB_ACCESS_TOKEN or VITE_TMDB_API_KEY to load real TMDb movie detail pages." />
    );
  }

  return (
    <section className="route-page">
      <div className="movie-detail-hero">
        {movie.posterUrl ? <img className="movie-detail-poster" src={movie.posterUrl} alt={`${movie.title} poster`} /> : <div className="poster tone-blue" />}
        <div className="movie-detail-copy">
          <span className="eyebrow">TMDb movie</span>
          <h1>{movie.title}</h1>
          <div className="meta-row">
            <span>{movie.releaseYear || "Year"}</span>
            {movie.runtimeMinutes ? <span>{movie.runtimeMinutes} min</span> : null}
            <WatchStatusBadge label={watched ? "Watched" : "Not watched"} />
          </div>
          <p>{movie.overview}</p>
          <div className="genre-strip">
            {movie.genres.map((genre) => (
              <span className="genre-chip" key={genre}>{genre}</span>
            ))}
          </div>
          <ProviderRow />
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
        </div>
      </div>
    </section>
  );
}
