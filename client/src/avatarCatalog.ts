export type AvatarUnlockType = "default" | "ticket" | "achievement" | "seasonal" | "limited";
export type AvatarRarity = "common" | "uncommon" | "rare" | "epic" | "legendary";

export interface BaseAvatar {
  id: string;
  key: string;
  name: string;
  theme: string;
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
  { id: "classic", key: "classic", name: "Classic", theme: "Friendly Flim alien", imagePath: "/avatars/base/classic.svg", defaultUnlocked: true, tags: ["alien", "happy"] },
  { id: "one-eye", key: "one-eye", name: "One Eye", theme: "Cyclops movie buddy", imagePath: "/avatars/base/one-eye.svg", defaultUnlocked: true, tags: ["alien", "cyclops"] },
  { id: "lashes", key: "lashes", name: "Lashes", theme: "Bright-eyed curator", imagePath: "/avatars/base/lashes.svg", defaultUnlocked: true, tags: ["alien", "expressive"] },
  { id: "buck-tooth", key: "buck-tooth", name: "Buck Tooth", theme: "Goofy cinema pal", imagePath: "/avatars/base/buck-tooth.svg", defaultUnlocked: true, tags: ["alien", "goofy"] },
  { id: "cool-dude", key: "cool-dude", name: "Cool Dude", theme: "Shades-on taste maker", imagePath: "/avatars/base/cool-dude.svg", defaultUnlocked: true, tags: ["alien", "cool"] },
  { id: "long-hair", key: "long-hair", name: "Long Hair", theme: "Laid-back watchlist fan", imagePath: "/avatars/base/long-hair.svg", defaultUnlocked: true, tags: ["alien", "hair"] },
  { id: "sleepy", key: "sleepy", name: "Sleepy", theme: "Late-night movie watcher", imagePath: "/avatars/base/sleepy.svg", defaultUnlocked: true, tags: ["alien", "sleepy"] },
  { id: "nerd", key: "nerd", name: "Nerd", theme: "Deep-cut film expert", imagePath: "/avatars/base/nerd.svg", defaultUnlocked: true, tags: ["alien", "glasses"] },
  { id: "spot", key: "spot", name: "Spot", theme: "Speckled cinema critter", imagePath: "/avatars/base/spot.svg", defaultUnlocked: true, tags: ["alien", "spotted"] },
  { id: "mohawk", key: "mohawk", name: "Mohawk", theme: "Punk playlist curator", imagePath: "/avatars/base/mohawk.svg", defaultUnlocked: true, tags: ["alien", "punk"] },
  { id: "star", key: "star", name: "Star", theme: "Premiere-night superfan", imagePath: "/avatars/base/star.svg", defaultUnlocked: true, tags: ["alien", "star"] },
  { id: "ziggy", key: "ziggy", name: "Ziggy", theme: "Zig-zag space pal", imagePath: "/avatars/base/ziggy.svg", defaultUnlocked: true, tags: ["alien", "zigzag"] },
];

export const avatarSkins: AvatarSkin[] = [
  { id: "dino-costume", name: "Dino Costume", imagePath: "/avatars/skins/dino-costume.svg", unlockType: "ticket", futureTicketCost: 800, rarity: "rare", defaultUnlocked: false },
  { id: "spacesuit", name: "Spacesuit", imagePath: "/avatars/skins/spacesuit.svg", unlockType: "ticket", futureTicketCost: 650, rarity: "uncommon", defaultUnlocked: false },
  { id: "robot-costume", name: "Robot Costume", imagePath: "/avatars/skins/robot-costume.svg", unlockType: "ticket", futureTicketCost: 700, rarity: "rare", defaultUnlocked: false },
  { id: "ghost-sheet", name: "Ghost Sheet", imagePath: "/avatars/skins/ghost-sheet.svg", unlockType: "seasonal", futureTicketCost: 500, rarity: "uncommon", defaultUnlocked: false },
  { id: "pirate", name: "Pirate", imagePath: "/avatars/skins/pirate.svg", unlockType: "ticket", futureTicketCost: 550, rarity: "uncommon", defaultUnlocked: false },
  { id: "wizard", name: "Wizard", imagePath: "/avatars/skins/wizard.svg", unlockType: "achievement", futureTicketCost: null, rarity: "epic", defaultUnlocked: false },
  { id: "ninja", name: "Ninja", imagePath: "/avatars/skins/ninja.svg", unlockType: "ticket", futureTicketCost: 600, rarity: "rare", defaultUnlocked: false },
  { id: "superhero", name: "Superhero", imagePath: "/avatars/skins/superhero.svg", unlockType: "limited", futureTicketCost: 900, rarity: "epic", defaultUnlocked: false },
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
