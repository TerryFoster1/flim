import { relicRunConfig } from "./config";

export type RelicRunScoreEvent =
  | "jump"
  | "perfectJump"
  | "swing"
  | "perfectSwing"
  | "whipHit"
  | "beetle"
  | "mummy"
  | "relic"
  | "filmReel";

export interface RelicRunScoreState {
  score: number;
  combo: number;
  comboHits: number;
  distance: number;
  perfectJumps: number;
  perfectSwings: number;
  whipHits: number;
  beetlesDefeated: number;
  mummiesDefeated: number;
  relics: number;
  filmReels: number;
}

export const initialRelicRunScoreState: RelicRunScoreState = {
  score: 0,
  combo: 1,
  comboHits: 0,
  distance: 0,
  perfectJumps: 0,
  perfectSwings: 0,
  whipHits: 0,
  beetlesDefeated: 0,
  mummiesDefeated: 0,
  relics: 0,
  filmReels: 0
};

export function addRelicRunDistance(state: RelicRunScoreState, distancePx: number): RelicRunScoreState {
  const distanceScore = Math.floor(Math.max(0, distancePx) / relicRunConfig.scoring.distancePointEveryPx);
  return {
    ...state,
    distance: state.distance + Math.max(0, distancePx),
    score: state.score + distanceScore
  };
}

export function addRelicRunScoreEvent(state: RelicRunScoreState, event: RelicRunScoreEvent): RelicRunScoreState {
  const base = relicRunConfig.scoring[event];
  const comboHits = state.comboHits + 1;
  const combo = Math.min(8, 1 + Math.floor(comboHits / 4));

  return {
    ...state,
    score: state.score + Math.round(base * combo),
    combo,
    comboHits,
    perfectJumps: state.perfectJumps + (event === "perfectJump" ? 1 : 0),
    perfectSwings: state.perfectSwings + (event === "perfectSwing" ? 1 : 0),
    whipHits: state.whipHits + (event === "whipHit" || event === "beetle" || event === "mummy" ? 1 : 0),
    beetlesDefeated: state.beetlesDefeated + (event === "beetle" ? 1 : 0),
    mummiesDefeated: state.mummiesDefeated + (event === "mummy" ? 1 : 0),
    relics: state.relics + (event === "relic" ? 1 : 0),
    filmReels: state.filmReels + (event === "filmReel" ? 1 : 0)
  };
}

export function breakRelicRunCombo(state: RelicRunScoreState): RelicRunScoreState {
  return {
    ...state,
    combo: 1,
    comboHits: 0
  };
}
