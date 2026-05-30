import type { Playlist } from "../types";

interface PlaylistCardProps {
  playlist: Playlist;
  large?: boolean;
  onNavigate?: (path: string) => void;
  onDelete?: (playlistId: string) => void;
}

export function PlaylistCard({ playlist, large, onNavigate, onDelete }: PlaylistCardProps) {
  const coverMovies = playlist.movies.slice(0, 4);

  function confirmDelete() {
    if (window.confirm("Delete this playlist? This cannot be undone.")) {
      onDelete?.(playlist.id);
    }
  }

  return (
    <article className={`playlist-card ${large ? "large" : ""}`}>
      <button className="playlist-card-button reset-button" onClick={() => onNavigate?.(`/playlists/${playlist.id}`)} type="button">
        <div className="playlist-cover poster-collage">
          {coverMovies.length > 0 ? (
            coverMovies.map((movie) =>
              movie.posterUrl ? <img alt="" key={movie.tmdbId} src={movie.posterUrl} /> : <span key={movie.tmdbId} />,
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
          <span>{playlist.movies.length} movies</span>
        </div>
      </button>
      {onDelete ? (
        <div className="card-actions">
          <button className="danger-button compact" onClick={confirmDelete} type="button">
            Delete Playlist
          </button>
        </div>
      ) : null}
    </article>
  );
}
