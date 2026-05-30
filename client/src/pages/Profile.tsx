import { PosterShelf } from "../components/PosterShelf";
import { StatsCard } from "../components/StatsCard";
import type { Playlist } from "../types";

interface ProfileProps {
  onNavigate: (path: string) => void;
  playlists: Playlist[];
}

export function Profile({ onNavigate, playlists }: ProfileProps) {
  const movies = playlists.flatMap((playlist) => playlist.movies);
  const watched = movies.filter((movie) => movie.watchStatus === "watched");
  const stats = [
    { label: "Playlists", value: String(playlists.length) },
    { label: "Saved Movies", value: String(movies.length) },
    { label: "Watched", value: String(watched.length) },
    { label: "Roulette Pool", value: String(movies.length) },
  ];

  return (
    <section className="route-page">
      <div className="profile-hero">
        <div className="avatar-placeholder">U</div>
        <div>
          <span className="eyebrow">Profile</span>
          <h1>User Name</h1>
          <p>Local profile view for playlists, saved movies, watched status, and roulette history placeholders.</p>
        </div>
      </div>
      <div className="stats-grid">
        {stats.map((stat) => (
          <StatsCard key={stat.label} stat={stat} />
        ))}
      </div>
      <div className="profile-tabs">
        <button onClick={() => onNavigate("/profile/playlists")} type="button">My Playlists</button>
        <button onClick={() => onNavigate("/profile/saved")} type="button">Saved Lists</button>
        <button onClick={() => onNavigate("/profile/watched")} type="button">Watch History</button>
      </div>
      <PosterShelf movies={movies} onNavigate={onNavigate} title="Saved Movie Posters" />
    </section>
  );
}
