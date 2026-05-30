import { MovieGrid } from "../components/MovieGrid";
import { PageShell } from "../components/PageShell";

export function ProfileWatched() {
  return (
    <PageShell eyebrow="Profile" title="Watch History" description="Poster-first watched status placeholder.">
      <MovieGrid />
    </PageShell>
  );
}
