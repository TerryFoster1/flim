import { TriceratopsBacklotGame } from "../games/triceratops/TriceratopsBacklotGame";

type BacklotGameId = "relic-run-lost-chapter" | "triceratops-backlot-runner";

interface BacklotGameProps {
  gameId: BacklotGameId;
  onNavigate: (path: string) => void;
}

export function BacklotGame({ gameId, onNavigate }: BacklotGameProps) {
  if (gameId === "triceratops-backlot-runner") {
    return <TriceratopsBacklotGame onNavigate={onNavigate} />;
  }

  return (
    <section className="route-page backlot-game-page backlot-game-pending">
      <button className="secondary-button compact" onClick={() => onNavigate("/games")} type="button">
        Back to Flim Arcade
      </button>
      <div className="backlot-game-pending-card">
        <span>Phase 2</span>
        <h1>Relic Run</h1>
        <p>
          Relic Run is next in the Backlot rebuild. The old tunnel-button simulator has been removed from the player route
          so it does not pretend to be a finished game.
        </p>
      </div>
    </section>
  );
}
