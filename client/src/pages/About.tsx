import { PageShell } from "../components/PageShell";

export function About() {
  return (
    <PageShell eyebrow="About" title="About Flim" description="Flim is a place to create, share, and discover movie and TV playlists.">
      <div className="legal-page">
        <section>
          <h2>Built for movie night</h2>
          <p>Flim helps people keep watchlists, share curated playlists, and choose what to watch when everyone is ready to press play.</p>
        </section>
        <section>
          <h2>The Director</h2>
          <p>The Director is Flim's editorial curator for official playlists and seasonal movie-night picks.</p>
        </section>
        <section>
          <h2>Metadata</h2>
          <p>Movie and TV metadata may be provided by TMDb. Flim is not endorsed or certified by TMDb.</p>
        </section>
      </div>
    </PageShell>
  );
}
