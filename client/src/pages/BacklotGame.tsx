import { useEffect, useMemo, useRef, useState } from "react";
import { recordBacklotGameOver, recordBacklotLaunch } from "../services/backlotService";

type BacklotGameId = "relic-run-lost-chapter" | "triceratops-backlot-runner";

interface BacklotGameProps {
  gameId: BacklotGameId;
  onNavigate: (path: string) => void;
}

const gameConfig: Record<BacklotGameId, {
  title: string;
  subtitle: string;
  artwork: string;
  prompt: string;
  actions: string[];
  accent: string;
}> = {
  "relic-run-lost-chapter": {
    title: "Relic Run",
    subtitle: "The Lost Chapter",
    artwork: "/arcade/art/adventure.webp",
    prompt: "Choose your path through the temple reel before the lights go out.",
    actions: ["Left Tunnel", "Grab Relic", "Right Tunnel"],
    accent: "Explorer",
  },
  "triceratops-backlot-runner": {
    title: "TRICERATOPS!",
    subtitle: "Backlot Boulevard",
    artwork: "/arcade/art/adventure.webp",
    prompt: "Dodge props, leap cables, and keep the dinosaur in frame.",
    actions: ["Dodge Left", "Jump", "Dodge Right"],
    accent: "Dino Run",
  },
};

export function BacklotGame({ gameId, onNavigate }: BacklotGameProps) {
  const config = gameConfig[gameId];
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [energy, setEnergy] = useState(100);
  const [round, setRound] = useState(1);
  const [ended, setEnded] = useState(false);
  const [message, setMessage] = useState("Backlot session ready.");
  const [syncStatus, setSyncStatus] = useState("");
  const startedAt = useRef(Date.now());

  useEffect(() => {
    startedAt.current = Date.now();
    recordBacklotLaunch(gameId).catch(() => {
      setSyncStatus("Sign in on staging to save Backlot progress.");
    });
  }, [gameId]);

  const progress = useMemo(() => Math.min(100, Math.round((round / 8) * 100)), [round]);

  function play(action: string) {
    if (ended) return;
    const actionBonus = action.length % 3 === 0 ? 120 : action.includes("Jump") || action.includes("Relic") ? 160 : 100;
    const nextStreak = streak + 1;
    const nextScore = score + actionBonus + nextStreak * 15;
    const nextEnergy = Math.max(0, energy - 9);
    const nextRound = round + 1;
    setScore(nextScore);
    setStreak(nextStreak);
    setEnergy(nextEnergy);
    setRound(nextRound);
    setMessage(`${action} landed. The booth keeps rolling.`);
    if (nextRound > 8 || nextEnergy <= 0) {
      finish(nextScore);
    }
  }

  function finish(finalScore = score) {
    setEnded(true);
    setMessage(finalScore > 900 ? "Director's cut complete." : "Session wrapped. Try for a cleaner take.");
    const playTimeMs = Math.max(1000, Date.now() - startedAt.current);
    recordBacklotGameOver(gameId, finalScore, playTimeMs).catch(() => {
      setSyncStatus("Session played locally. Sign in on staging to save scores.");
    });
  }

  function restart() {
    startedAt.current = Date.now();
    setScore(0);
    setStreak(0);
    setEnergy(100);
    setRound(1);
    setEnded(false);
    setMessage("Backlot session ready.");
    setSyncStatus("");
    recordBacklotLaunch(gameId).catch(() => setSyncStatus("Sign in on staging to save Backlot progress."));
  }

  return (
    <section className="route-page backlot-game-page">
      <button className="secondary-button compact" onClick={() => onNavigate("/games")} type="button">
        Back to Flim Arcade
      </button>
      <div className="backlot-game-stage">
        <div className="backlot-game-art">
          <img alt="" src={config.artwork} />
        </div>
        <div className="backlot-game-panel">
          <span>{config.accent}</span>
          <h1>{config.title}</h1>
          <p>{config.subtitle}</p>
          <p>{config.prompt}</p>
          <div className="backlot-game-meters" aria-label="Game stats">
            <strong>{score.toLocaleString()} pts</strong>
            <strong>{energy}% energy</strong>
            <strong>{progress}% reel</strong>
          </div>
          <p className="backlot-game-message">{message}</p>
          {ended ? (
            <div className="backlot-game-actions">
              <button className="primary-button" onClick={restart} type="button">Play Again</button>
              <button className="secondary-button" onClick={() => onNavigate("/games")} type="button">Backlot Arcade</button>
            </div>
          ) : (
            <div className="backlot-game-actions">
              {config.actions.map((action) => (
                <button className="primary-button" key={action} onClick={() => play(action)} type="button">
                  {action}
                </button>
              ))}
              <button className="secondary-button" onClick={() => finish()} type="button">End Session</button>
            </div>
          )}
          {syncStatus ? <p className="backlot-sync-note">{syncStatus}</p> : null}
        </div>
      </div>
    </section>
  );
}
