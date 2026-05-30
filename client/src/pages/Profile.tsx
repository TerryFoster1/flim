import { PosterShelf } from "../components/PosterShelf";
import { StatsCard } from "../components/StatsCard";
import { profileStats } from "../data/placeholders";
import type { AppRoute } from "../types";

interface ProfileProps {
  onNavigate: (route: AppRoute) => void;
}

export function Profile({ onNavigate }: ProfileProps) {
  return (
    <section className="route-page">
      <div className="profile-hero">
        <div className="avatar-placeholder">U</div>
        <div>
          <span className="eyebrow">Profile</span>
          <h1>User Name</h1>
          <p>Movie playlists, saved lists, watch history, and roulette history.</p>
        </div>
      </div>
      <div className="stats-grid">
        {profileStats.map((stat) => (
          <StatsCard key={stat.label} stat={stat} />
        ))}
      </div>
      <div className="profile-tabs">
        <button onClick={() => onNavigate("/profile/playlists")} type="button">My Playlists</button>
        <button onClick={() => onNavigate("/profile/saved")} type="button">Saved Lists</button>
        <button onClick={() => onNavigate("/profile/watched")} type="button">Watch History</button>
      </div>
      <PosterShelf title="My Playlists" />
      <PosterShelf title="Saved Lists" />
      <PosterShelf title="Watch History" />
    </section>
  );
}
