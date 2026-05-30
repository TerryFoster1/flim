import { placeholderMovies } from "../data/placeholders";
import { PosterCard } from "./PosterCard";

export function MovieGrid() {
  return (
    <div className="movie-grid">
      {placeholderMovies.slice(0, 12).map((movie) => (
        <PosterCard key={movie.id} movie={movie} />
      ))}
    </div>
  );
}
