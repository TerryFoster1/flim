import { useEffect, useState } from "react";
import { MovieGrid } from "../components/MovieGrid";
import { getPublicPlaylistBySlug } from "../services/apiPlaylistStore";
import type { Playlist } from "../types";

interface PublicPlaylistProps {
  publicSlug: string;
  onNavigate: (path: string) => void;
}

export function PublicPlaylist({ publicSlug, onNavigate }: PublicPlaylistProps) {
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "not_found">("loading");

  useEffect(() => {
    let isActive = true;
    setStatus("loading");

    getPublicPlaylistBySlug(publicSlug)
      .then((result) => {
        if (!isActive) return;
        setPlaylist(result);
        setStatus("ready");
      })
      .catch(() => {
        if (!isActive) return;
        setPlaylist(null);
        setStatus("not_found");
      });

    return () => {
      isActive = false;
    };
  }, [publicSlug]);

  if (status === "loading") {
    return <p className="empty-state">Loading shared playlist...</p>;
  }

  if (status === "not_found" || !playlist) {
    return (
      <section className="route-page public-playlist-page">
        <div className="page-heading">
          <span className="eyebrow">Shared Playlist</span>
          <h1>Playlist not found</h1>
          <p>This public playlist may have been deleted or the link may be incorrect.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="route-page public-playlist-page">
      <div className="playlist-hero public-playlist-hero">
        <div className="playlist-cover-xl" aria-label="Playlist cover">
          {playlist.movies.slice(0, 4).map((movie) =>
            movie.posterUrl ? <img alt="" key={movie.tmdbId} src={movie.posterUrl} /> : <div key={movie.tmdbId} />,
          )}
          {playlist.movies.length === 0 ? (
            <>
              <div />
              <div />
              <div />
              <div />
            </>
          ) : null}
        </div>
        <div className="playlist-copy">
          <span className="eyebrow">Shared Flim playlist</span>
          <h1>{playlist.name}</h1>
          {playlist.description ? <p>{playlist.description}</p> : null}
          <div className="meta-row">
            <span>{playlist.movies.length} movies</span>
            <span>{playlist.visibility}</span>
          </div>
          <button className="secondary-button" onClick={() => onNavigate("/playlists")} type="button">
            Create your own playlist
          </button>
        </div>
      </div>
      <MovieGrid
        movies={playlist.movies}
        emptyMessage="No movies have been added to this shared playlist yet."
        onNavigate={onNavigate}
      />
    </section>
  );
}
