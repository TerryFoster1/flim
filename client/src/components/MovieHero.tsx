import { ProviderRow } from "./ProviderRow";

export function MovieHero() {
  return (
    <section className="hero home-hero">
      <div className="hero-copy">
        <span className="eyebrow">Movie Title</span>
        <h1>Movie Title</h1>
        <p>Poster-first movie detail placeholder for a future connected movie record.</p>
        <ProviderRow />
      </div>
      <div className="hero-posters">
        <div className="poster tall tone-red" />
        <div className="poster tone-blue" />
      </div>
    </section>
  );
}
