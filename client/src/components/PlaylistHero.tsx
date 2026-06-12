import type { ReactNode } from "react";
import type { Playlist } from "../types";

interface PlaylistHeroProps {
  playlist: Playlist;
  secondaryMeta?: ReactNode;
}

interface PlaylistCoverArtProps {
  playlist: Playlist;
  className?: string;
}

function creatorLabel(playlist: Playlist) {
  if (playlist.creatorDisplayName) return `Curated by ${playlist.creatorDisplayName}`;
  if (playlist.creatorHandle && playlist.creatorHandle !== "the-director") return `Curated by @${playlist.creatorHandle}`;
  if (playlist.creatorHandle === "the-director") return "Curated by The Director";
  return playlist.isOwner ? "Curated by you" : "Curated playlist";
}

export function PlaylistCoverArt({ playlist, className = "" }: PlaylistCoverArtProps) {
  const posters = playlist.movies.slice(0, 5);
  const fallbackCount = Math.max(0, 5 - posters.length);

  return (
    <div className={`playlist-cover-xl playlist-cover-stack ${className}`.trim()} aria-label={`${playlist.name} playlist cover`}>
      {posters.map((movie, index) =>
        movie.posterUrl ? (
          <img alt="" className={`playlist-cover-card cover-card-${index + 1}`} key={`${movie.mediaType || "movie"}-${movie.tmdbId}-${index}`} src={movie.posterUrl} />
        ) : (
          <div className={`playlist-cover-card cover-card-${index + 1}`} key={`${movie.mediaType || "movie"}-${movie.tmdbId}-${index}`} />
        ),
      )}
      {Array.from({ length: fallbackCount }).map((_, index) => (
        <div className={`playlist-cover-card cover-card-${posters.length + index + 1}`} key={`cover-fallback-${index}`} />
      ))}
      <span className="playlist-cover-vinyl" aria-hidden="true" />
    </div>
  );
}

export function PlaylistHero({ playlist, secondaryMeta }: PlaylistHeroProps) {
  const isPublic = playlist.visibility === "public";
  const titleCount = playlist.movies.length;

  return (
    <div className="playlist-hero">
      <PlaylistCoverArt playlist={playlist} />
      <div className="playlist-copy">
        <h1>{playlist.name}</h1>
        {playlist.description ? <p>{playlist.description}</p> : null}
        <p className="playlist-curator-label">{creatorLabel(playlist)}</p>
        <div className="meta-row">
          <span>{titleCount} {titleCount === 1 ? "Title" : "Titles"}</span>
          {secondaryMeta || (!isPublic ? <span>{playlist.movies.filter((movie) => movie.watchStatus === "watched").length} watched</span> : null)}
        </div>
      </div>
    </div>
  );
}
