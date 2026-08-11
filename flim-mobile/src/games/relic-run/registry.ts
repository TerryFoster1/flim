import { RELIC_RUN_GAME_ID } from "./config";

export interface HiddenGameRegistration {
  gameId: string;
  title: string;
  subtitle: string;
  locked: boolean;
  discoveryMethod: string;
  rewardId?: string;
}

export const relicRunGameRegistration: HiddenGameRegistration = {
  gameId: RELIC_RUN_GAME_ID,
  title: "Relic Run",
  subtitle: "The Lost Chapter",
  locked: false,
  discoveryMethod: "Future trivia achievement Easter egg",
  rewardId: "relic-run-lost-chapter-ticket-bonus"
};
