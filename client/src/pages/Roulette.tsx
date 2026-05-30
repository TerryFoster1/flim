import { BlindSpinButton } from "../components/BlindSpinButton";
import { GenreChip } from "../components/GenreChip";
import { RouletteButton } from "../components/RouletteButton";

export function Roulette() {
  return (
    <section className="route-page">
      <div className="roulette-stage">
        <div className="roulette-copy">
          <span className="eyebrow">Movie Roulette</span>
          <h1>Spin into something worth watching</h1>
          <p>Visual-only filter shell for genres, providers, playlists, runtime, and Blind Spin.</p>
          <div className="selector-cloud">
            {Array.from({ length: 4 }, (_, index) => (
              <GenreChip key={index} />
            ))}
            <span>Provider Name</span>
            <span>Playlist Name</span>
            <span>Under 2 Hours</span>
          </div>
          <div className="button-row">
            <RouletteButton />
            <BlindSpinButton />
          </div>
        </div>
        <div className="roulette-wheel" aria-label="Roulette animation placeholder">
          <div className="wheel-core">?</div>
          <div className="orbit one" />
          <div className="orbit two" />
          <div className="orbit three" />
        </div>
      </div>
      <div className="results-placeholder">
        <span className="eyebrow">Results area</span>
        <h2>Movie Title</h2>
        <p>Animation placeholder and provider destination preview.</p>
      </div>
    </section>
  );
}
