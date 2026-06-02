import type { ReactNode } from "react";
import type { Playlist } from "../types";

interface PlaylistHeroProps {
  playlist: Playlist;
  secondaryMeta?: ReactNode;
}

export function PlaylistHero({ playlist, secondaryMeta }: PlaylistHeroProps) {
  const isPublic = playlist.visibility === "public";

  return (
    <div className="playlist-hero">
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
        <span className="eyebrow">{playlist.visibility} playlist</span>
        <h1>{playlist.name}</h1>
        {playlist.description ? <p>{playlist.description}</p> : null}
        <div className="meta-row">
          <span>{playlist.movies.length} movies</span>
          {secondaryMeta || (!isPublic ? <span>{playlist.movies.filter((movie) => movie.watchStatus === "watched").length} watched</span> : null)}
        </div>
      </div>
    </div>
  );
}
