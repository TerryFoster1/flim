import type { Playlist } from "../types";

interface PlaylistCardProps {
  playlist: Playlist;
  large?: boolean;
  onNavigate?: (path: string) => void;
  hideLikes?: boolean;
}

export function PlaylistCard({ playlist, large, onNavigate, hideLikes = false }: PlaylistCardProps) {
  const coverMovies = playlist.movies.slice(0, 4);
  const isDirectorPlaylist = playlist.creatorHandle === "the-director" || playlist.creatorDisplayName === "The Director";
  const detailPath = playlist.visibility === "public" && !playlist.isOwner ? `/p/${playlist.publicSlug}` : `/playlists/${playlist.id}`;
  const followerCount = playlist.followerCount || 0;
  const likeCount = playlist.likeCount || 0;
  const titleCountLabel = `${playlist.movies.length} ${playlist.movies.length === 1 ? "title" : "titles"}`;
  const creatorLabel = isDirectorPlaylist
    ? "Curated by The Director"
    : playlist.creatorDisplayName
      ? `by ${playlist.creatorDisplayName}`
      : playlist.creatorHandle
        ? `by @${playlist.creatorHandle}`
        : "";
  const updatedLabel = formatUpdatedAt(playlist.updatedAt);

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
          {playlist.visibility !== "public" ? <span>{playlist.visibility}</span> : null}
          <span>{titleCountLabel}</span>
          {playlist.visibility === "public" ? <span>{followerCount} {followerCount === 1 ? "follower" : "followers"}</span> : null}
          {playlist.visibility === "public" && !hideLikes ? <span>{likeCount} {likeCount === 1 ? "like" : "likes"}</span> : null}
          {playlist.isFollowing ? <span>Following</span> : null}
          {creatorLabel ? <span>{creatorLabel}</span> : null}
          {updatedLabel ? <span>{updatedLabel}</span> : null}
        </div>
      </button>
    </article>
  );
}

function formatUpdatedAt(value?: string) {
  if (!value) return "";
  const updated = new Date(value).getTime();
  if (!Number.isFinite(updated)) return "";
  const days = Math.max(0, Math.floor((Date.now() - updated) / 86_400_000));
  if (days === 0) return "Updated today";
  if (days === 1) return "Updated yesterday";
  if (days < 30) return `Updated ${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `Updated ${months} ${months === 1 ? "month" : "months"} ago`;
  const years = Math.floor(months / 12);
  return `Updated ${years} ${years === 1 ? "year" : "years"} ago`;
}
