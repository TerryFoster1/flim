import { PageShell } from "../components/PageShell";
import { PosterShelf } from "../components/PosterShelf";

export function Discover() {
  return (
    <PageShell eyebrow="Discover" title="Poster shelves for every mood" description="Placeholder movie browsing with streaming-service rhythm.">
      {["Trending Movies", "Action", "Comedy", "Drama", "Sci-Fi", "Horror", "Family", "Classic Films"].map((title) => (
        <PosterShelf key={title} title={title} />
      ))}
    </PageShell>
  );
}
