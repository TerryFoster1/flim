import type { Playlist } from "../types";

interface PlaylistCardProps {
  playlist: Playlist;
  large?: boolean;
  onNavigate?: (path: string) => void;
}

export function PlaylistCard({ playlist, large, onNavigate }: PlaylistCardProps) {
  const coverMovies = playlist.movies.slice(0, 4);
  const isDirectorPlaylist = playlist.creatorHandle === "the-director" || playlist.creatorDisplayName === "The Director";
  const detailPath = playlist.visibility === "public" && !playlist.isOwner ? `/p/${playlist.publicSlug}` : `/playlists/${playlist.id}`;
  const followerCount = playlist.followerCount || 0;

  return (
    <article className={`playlist-card ${large ? "large" : ""}`}>
      <button className="playlist-card-button reset-button" onClick={() => onNavigate?.(detailPath)} type="button">
        <div className="playlist-cover poster-collage">
          {coverMovies.length > 0 ? (
            coverMovies.map((movie) =>
              movie.posterUrl ? <img alt="" key={`${movie.mediaType || "movie"}-${movie.tmdbId}`} src={movie.posterUrl} /> : <span key={`${movie.mediaType || "movie"}-${movie.tmdbId}`} />,
            )
          ) : (
            <>
              <span />
              <span />
              <span />
              <span />
            </>
          )}
        </div>
        <h3>{playlist.name}</h3>
        {playlist.description ? <p>{playlist.description}</p> : null}
        <div className="card-meta">
          <span>{playlist.visibility}</span>
          <span>{playlist.movies.length} titles</span>
          {playlist.visibility === "public" ? <span>{followerCount} {followerCount === 1 ? "follower" : "followers"}</span> : null}
          {playlist.isFollowing ? <span>Following</span> : null}
          {isDirectorPlaylist ? <span>Curated by The Director</span> : playlist.creatorHandle ? <span>by @{playlist.creatorHandle}</span> : null}
        </div>
      </button>
    </article>
  );
}
