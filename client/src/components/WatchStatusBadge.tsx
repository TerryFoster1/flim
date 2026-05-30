interface WatchStatusBadgeProps {
  label?: string;
}

export function WatchStatusBadge({ label = "Watch status" }: WatchStatusBadgeProps) {
  return <span className="status-pill">{label}</span>;
}
