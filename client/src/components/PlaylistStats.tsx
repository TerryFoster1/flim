import { profileStats } from "../data/placeholders";
import { StatsCard } from "./StatsCard";

export function PlaylistStats() {
  return (
    <div className="stats-grid">
      {profileStats.map((stat) => (
        <StatsCard key={`playlist-${stat.label}`} stat={stat} />
      ))}
    </div>
  );
}
