interface StatsCardProps {
  stat: {
    label: string;
    value: string;
  };
}

export function StatsCard({ stat }: StatsCardProps) {
  return (
    <article>
      <strong>{stat.value}</strong>
      <span>{stat.label}</span>
    </article>
  );
}
