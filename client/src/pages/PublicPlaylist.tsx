import { useEffect, useState } from "react";
import { MovieGrid } from "../components/MovieGrid";
import { SharePlaylistButton } from "../components/SharePlaylistButton";
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
      <div className="public-playlist-hero">
        <div className="public-hero-backdrop" aria-hidden="true">
          {playlist.movies.slice(0, 9).map((movie, index) =>
            movie.posterUrl ? <img alt="" key={`${movie.tmdbId}-${index}`} src={movie.posterUrl} /> : <span key={`${movie.tmdbId}-${index}`} />,
          )}
        </div>
        <div className="playlist-cover-xl public-cover-art" aria-label="Playlist cover">
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
        <div className="playlist-copy public-playlist-copy">
          <span className="eyebrow">Shared Flim playlist</span>
          <h1>{playlist.name}</h1>
          {playlist.description ? <p>{playlist.description}</p> : null}
          <div className="meta-row">
            <span>{playlist.movies.length} movies</span>
            <span>Shared via Flim</span>
          </div>
          <div className="button-row">
            <SharePlaylistButton playlist={playlist} />
            <button className="secondary-button" onClick={() => onNavigate("/playlists")} type="button">
              Create your own playlist
            </button>
          </div>
        </div>
      </div>
      <div className="public-playlist-intro">
        <div>
          <span className="eyebrow">Poster Wall</span>
          <h2>Browse the list</h2>
        </div>
        <p>Open any movie to see details, where-to-watch options, trailers, soundtracks, and media extensions.</p>
      </div>
      <MovieGrid
        movies={playlist.movies}
        emptyMessage="No movies have been added to this shared playlist yet."
        onNavigate={onNavigate}
      />
    </section>
  );
}
