import { relicRunGameRegistration } from "@/games/relic-run/registry";

export interface BacklotGame {
  gameId: string;
  title: string;
  subtitle: string;
  route: "/games/relic-run";
}

export const backlotGameCatalog: BacklotGame[] = [
  {
    gameId: relicRunGameRegistration.gameId,
    title: relicRunGameRegistration.title,
    subtitle: relicRunGameRegistration.subtitle,
    route: "/games/relic-run"
  }
];
