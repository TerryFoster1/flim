export type AvatarUnlockType = "default" | "ticket" | "achievement" | "seasonal" | "limited";
export type AvatarRarity = "common" | "uncommon" | "rare" | "epic" | "legendary";

export interface BaseAvatar {
  id: string;
  key: string;
  name: string;
  imagePath: string;
  defaultUnlocked: boolean;
  tags: string[];
}

export interface AvatarSkin {
  id: string;
  name: string;
  imagePath: string;
  unlockType: AvatarUnlockType;
  futureTicketCost: number | null;
  rarity: AvatarRarity;
  defaultUnlocked: boolean;
}

export interface AvatarCombination {
  id: string;
  baseAvatarId: string;
  skinId: string;
  imagePath: string;
}

export const defaultAvatarKey = "classic";

export const baseAvatars: BaseAvatar[] = [
  { id: "classic", key: "classic", name: "Classic", imagePath: "/avatars/base/classic.png", defaultUnlocked: true, tags: ["alien", "happy"] },
  { id: "one-eye", key: "one-eye", name: "One Eye", imagePath: "/avatars/base/one-eye.png", defaultUnlocked: true, tags: ["alien", "cyclops"] },
  { id: "lashes", key: "lashes", name: "Lashes", imagePath: "/avatars/base/lashes.png", defaultUnlocked: true, tags: ["alien", "expressive"] },
  { id: "buck-tooth", key: "buck-tooth", name: "Buck Tooth", imagePath: "/avatars/base/buck-tooth.png", defaultUnlocked: true, tags: ["alien", "goofy"] },
  { id: "cool-dude", key: "cool-dude", name: "Cool Dude", imagePath: "/avatars/base/cool-dude.png", defaultUnlocked: true, tags: ["alien", "cool"] },
  { id: "long-hair", key: "long-hair", name: "Long Hair", imagePath: "/avatars/base/long-hair.png", defaultUnlocked: true, tags: ["alien", "hair"] },
  { id: "sleepy", key: "sleepy", name: "Sleepy", imagePath: "/avatars/base/sleepy.png", defaultUnlocked: true, tags: ["alien", "sleepy"] },
  { id: "nerd", key: "nerd", name: "Nerd", imagePath: "/avatars/base/nerd.png", defaultUnlocked: true, tags: ["alien", "glasses"] },
  { id: "spot", key: "spot", name: "Spot", imagePath: "/avatars/base/spot.png", defaultUnlocked: true, tags: ["alien", "spotted"] },
  { id: "mohawk", key: "mohawk", name: "Mohawk", imagePath: "/avatars/base/mohawk.png", defaultUnlocked: true, tags: ["alien", "punk"] },
  { id: "star", key: "star", name: "Star", imagePath: "/avatars/base/star.png", defaultUnlocked: true, tags: ["alien", "star"] },
  { id: "ziggy", key: "ziggy", name: "Ziggy", imagePath: "/avatars/base/ziggy.png", defaultUnlocked: true, tags: ["alien", "zigzag"] },
];

export const avatarSkins: AvatarSkin[] = [
  { id: "rex", name: "Rex", imagePath: "/avatars/skins/rex.png", unlockType: "ticket", futureTicketCost: 800, rarity: "rare", defaultUnlocked: false },
  { id: "spaceman", name: "Spaceman", imagePath: "/avatars/skins/spaceman.png", unlockType: "ticket", futureTicketCost: 650, rarity: "uncommon", defaultUnlocked: false },
  { id: "gearbox", name: "Gearbox", imagePath: "/avatars/skins/gearbox.png", unlockType: "ticket", futureTicketCost: 700, rarity: "rare", defaultUnlocked: false },
  { id: "spook", name: "Spook", imagePath: "/avatars/skins/spook.png", unlockType: "seasonal", futureTicketCost: 500, rarity: "uncommon", defaultUnlocked: false },
  { id: "peg-leg", name: "Peg Leg", imagePath: "/avatars/skins/peg-leg.png", unlockType: "ticket", futureTicketCost: 550, rarity: "uncommon", defaultUnlocked: false },
  { id: "hocus", name: "Hocus", imagePath: "/avatars/skins/hocus.png", unlockType: "achievement", futureTicketCost: null, rarity: "epic", defaultUnlocked: false },
  { id: "ninjin", name: "Ninjin", imagePath: "/avatars/skins/ninjin.png", unlockType: "ticket", futureTicketCost: 600, rarity: "rare", defaultUnlocked: false },
  { id: "magnifico", name: "Magnifico", imagePath: "/avatars/skins/magnifico.png", unlockType: "limited", futureTicketCost: 900, rarity: "epic", defaultUnlocked: false },
];

export const avatarCombinations: AvatarCombination[] = [];

const legacyAvatarAliases: Record<string, string> = {
  director: "classic",
  popcorn: "classic",
  astronaut: "ziggy",
  "film-reel": "spot",
  "retro-vhs": "cool-dude",
  detective: "nerd",
  "monster-hunter": "mohawk",
  explorer: "long-hair",
  robot: "one-eye",
  projectionist: "sleepy",
  "film-critter": "star",
  "movie-buff": "buck-tooth",
};

export const flimAvatars = baseAvatars;

export function normalizeAvatarKey(key?: string) {
  if (!key) return defaultAvatarKey;
  return legacyAvatarAliases[key] || key;
}

export function getFlimAvatar(key?: string) {
  const normalizedKey = normalizeAvatarKey(key);
  return baseAvatars.find((avatar) => avatar.id === normalizedKey) || baseAvatars[0];
}

export function getAvatarSkin(id?: string) {
  if (!id) return null;
  return avatarSkins.find((skin) => skin.id === id) || null;
}
