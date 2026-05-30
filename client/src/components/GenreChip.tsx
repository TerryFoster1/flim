interface GenreChipProps {
  label?: "Genre Name";
}

export function GenreChip({ label = "Genre Name" }: GenreChipProps) {
  return <span className="genre-chip">{label}</span>;
}
