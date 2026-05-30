import type { PlaceholderStat } from "../data/placeholders";

interface StatsCardProps {
  stat: PlaceholderStat;
}

export function StatsCard({ stat }: StatsCardProps) {
  return (
    <article>
      <strong>{stat.value}</strong>
      <span>{stat.label}</span>
    </article>
  );
}
