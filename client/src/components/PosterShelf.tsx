import { placeholderMovies } from "../data/placeholders";
import { PosterCard } from "./PosterCard";

interface PosterShelfProps {
  title: string;
  eyebrow?: string;
}

export function PosterShelf({ title, eyebrow = "Poster shelf" }: PosterShelfProps) {
  return (
    <section className="shelf" aria-label={title}>
      <div className="shelf-header">
        <div className="shelf-title">{title}</div>
        <span className="eyebrow">{eyebrow}</span>
      </div>
      <div className="poster-row">
        {placeholderMovies.slice(0, 8).map((movie) => (
          <PosterCard key={`${title}-${movie.id}`} movie={movie} />
        ))}
      </div>
    </section>
  );
}
