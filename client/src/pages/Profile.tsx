import { StatsCard } from "../components/StatsCard";
import type { Playlist } from "../types";

interface ProfileProps {
  onNavigate: (path: string) => void;
  playlists: Playlist[];
}

export function Profile({ onNavigate, playlists }: ProfileProps) {
  const movies = playlists.flatMap((playlist) => playlist.movies);
  const watched = movies.filter((movie) => movie.watchStatus === "watched");
  const savedPlaylists = playlists.filter((playlist) => playlist.saved || playlist.clonedFromId);
  const stats = [
    { label: "Playlists Created", value: String(playlists.length) },
    { label: "Movies Saved", value: String(movies.length) },
    { label: "Movies Watched", value: String(watched.length) },
    { label: "Saved Playlists", value: String(savedPlaylists.length) },
  ];

  return (
    <section className="route-page">
      <div className="profile-hero">
        <div>
          <span className="eyebrow">Profile</span>
          <h1>Your Flim activity</h1>
          <p>A simple summary of your playlists and watched movies.</p>
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
    </section>
  );
}
