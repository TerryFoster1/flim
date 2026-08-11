import { triceratopsGameConfig } from "./config";

export type ScoreEvent =
  | "standardVehicleFlip"
  | "perfectVehicleFlip"
  | "pedestrianStomp"
  | "sceneryDestroyed"
  | "reelCollected"
  | "vehicleCollision"
  | "rampageBonus";

export interface ScoreState {
  score: number;
  combo: number;
  maxCombo: number;
  comboHits: number;
}

export const initialScoreState: ScoreState = {
  score: 0,
  combo: 1,
  maxCombo: 1,
  comboHits: 0
};

export function addScoreEvent(state: ScoreState, event: ScoreEvent): ScoreState {
  const baseValue = triceratopsGameConfig.scoring[event];
  const comboHits = state.comboHits + 1;
  const combo = Math.min(
    1 + comboHits * triceratopsGameConfig.scoring.comboStep,
    triceratopsGameConfig.scoring.maxMultiplier
  );

  return {
    score: state.score + Math.round(baseValue * combo),
    combo,
    maxCombo: Math.max(state.maxCombo, combo),
    comboHits
  };
}

export function addDistanceScore(state: ScoreState, distanceDeltaPx: number) {
  const distancePoints = Math.floor(distanceDeltaPx / triceratopsGameConfig.scoring.distancePointEveryPx);
  return {
    ...state,
    score: state.score + distancePoints
  };
}

export function resetCombo(state: ScoreState): ScoreState {
  return {
    ...state,
    combo: 1,
    comboHits: 0
  };
}
