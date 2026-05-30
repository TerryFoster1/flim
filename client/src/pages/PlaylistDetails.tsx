import { MovieGrid } from "../components/MovieGrid";
import { PlaylistHero } from "../components/PlaylistHero";
import { PosterShelf } from "../components/PosterShelf";

export function PlaylistDetails() {
  return (
    <section className="route-page">
      <PlaylistHero />
      <PosterShelf title="Movies in this playlist" />
      <MovieGrid />
    </section>
  );
}
