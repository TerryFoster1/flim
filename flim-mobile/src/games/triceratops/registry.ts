import { TRICERATOPS_GAME_ID } from "./config";

export interface HiddenGameRegistration {
  gameId: string;
  title: string;
  subtitle: string;
  locked: boolean;
  discoveryMethod: string;
  rewardId?: string;
}

export const triceratopsGameRegistration: HiddenGameRegistration = {
  gameId: TRICERATOPS_GAME_ID,
  title: "TRICERATOPS!",
  subtitle: "Terror on Backlot Boulevard",
  locked: false,
  discoveryMethod: "Future trivia Easter egg",
  rewardId: "triceratops-runner-ticket-bonus"
};
