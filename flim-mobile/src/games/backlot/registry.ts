import type { BacklotDiscoveryRequest } from "../../api/types";
import { RELIC_RUN_GAME_ID } from "../relic-run/config";
import { relicRunGameRegistration } from "../relic-run/registry";
import { TRICERATOPS_GAME_ID } from "../triceratops/config";
import { triceratopsGameRegistration } from "../triceratops/registry";

export interface BacklotGameCatalogEntry {
  gameId: string;
  title: string;
  subtitle: string;
  description: string;
  route: "/games/relic-run" | "/games/triceratops";
  artworkKey: string;
  difficulty: "easy" | "medium" | "hard" | "expert";
  estimatedPlayTimeMinutes: number;
  genre: string;
  unlockType: "discovery";
  testDiscoverySource: BacklotDiscoveryRequest;
  rewardId: string;
  achievementSetId: string;
  statisticsProvider: string;
  saveProvider: string;
  launchProvider: string;
}

export const relicRunDiscoverySource: BacklotDiscoveryRequest = {
  gameId: RELIC_RUN_GAME_ID,
  sourceType: "arcade_mode",
  sourceId: "poster-guess",
  sourceTitle: "Movie Reveal"
};

export const triceratopsDinosaurDiscoverySource: BacklotDiscoveryRequest = {
  gameId: TRICERATOPS_GAME_ID,
  sourceType: "challenge_theme",
  sourceId: "dinosaur-theme",
  sourceTitle: "Dinosaur Movie Challenge"
};

export const backlotGameCatalog: BacklotGameCatalogEntry[] = [
  {
    gameId: relicRunGameRegistration.gameId,
    title: relicRunGameRegistration.title,
    subtitle: relicRunGameRegistration.subtitle,
    description: "Dash through a lost adventure reel hidden inside Flim.",
    route: "/games/relic-run",
    artworkKey: "adventure",
    difficulty: "medium",
    estimatedPlayTimeMinutes: 3,
    genre: "adventure",
    unlockType: "discovery",
    testDiscoverySource: relicRunDiscoverySource,
    rewardId: "relic-run-lost-chapter-ticket-bonus",
    achievementSetId: "relic-run-lost-chapter-achievements",
    statisticsProvider: "backlot.server.stats.v1",
    saveProvider: "backlot.server.save.v1",
    launchProvider: "native.expo-router"
  },
  {
    gameId: triceratopsGameRegistration.gameId,
    title: triceratopsGameRegistration.title,
    subtitle: triceratopsGameRegistration.subtitle,
    description: "Terror on Backlot Boulevard, uncovered through dinosaur movie play.",
    route: "/games/triceratops",
    artworkKey: "action",
    difficulty: "medium",
    estimatedPlayTimeMinutes: 3,
    genre: "dinosaur",
    unlockType: "discovery",
    testDiscoverySource: triceratopsDinosaurDiscoverySource,
    rewardId: "triceratops-runner-ticket-bonus",
    achievementSetId: "triceratops-backlot-runner-achievements",
    statisticsProvider: "backlot.server.stats.v1",
    saveProvider: "backlot.server.save.v1",
    launchProvider: "native.expo-router"
  }
];

export const backlotGamesById = new Map(backlotGameCatalog.map((game) => [game.gameId, game]));

export function isDinosaurChallenge(value: { title?: string; name?: string; description?: string; slug?: string; id?: string }) {
  const haystack = [value.title, value.name, value.description, value.slug, value.id].filter(Boolean).join(" ").toLowerCase();
  return /\b(dinosaur|jurassic|triceratops|cretaceous|raptor)\b/.test(haystack);
}

export function isAllowedBacklotDiscovery(discovery: Pick<BacklotDiscoveryRequest, "gameId" | "sourceType" | "sourceId">) {
  return (
    (discovery.gameId === RELIC_RUN_GAME_ID && discovery.sourceType === "arcade_mode" && discovery.sourceId === "poster-guess") ||
    (discovery.gameId === TRICERATOPS_GAME_ID && discovery.sourceType === "challenge_theme" && discovery.sourceId === "dinosaur-theme")
  );
}
