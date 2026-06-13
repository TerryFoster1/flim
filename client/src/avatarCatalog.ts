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
  facePlacement: {
    width: string;
    top: string;
    left: string;
  };
}

export interface AvatarCombination {
  id: string;
  baseAvatarId: string;
  skinId: string;
  imagePath: string;
}

export const defaultAvatarKey = "classic";

export const baseAvatars: BaseAvatar[] = [
  { id: "classic", key: "classic", name: "Classic", theme: "Friendly Flim alien", imagePath: "/avatars/base/classic.png", defaultUnlocked: true, tags: ["alien", "happy"] },
  { id: "one-eye", key: "one-eye", name: "One Eye", theme: "Cyclops movie buddy", imagePath: "/avatars/base/one-eye.png", defaultUnlocked: true, tags: ["alien", "cyclops"] },
  { id: "lashes", key: "lashes", name: "Lashes", theme: "Bright-eyed curator", imagePath: "/avatars/base/lashes.png", defaultUnlocked: true, tags: ["alien", "expressive"] },
  { id: "buck-tooth", key: "buck-tooth", name: "Buck Tooth", theme: "Goofy cinema pal", imagePath: "/avatars/base/buck-tooth.png", defaultUnlocked: true, tags: ["alien", "goofy"] },
  { id: "cool-dude", key: "cool-dude", name: "Cool Dude", theme: "Shades-on taste maker", imagePath: "/avatars/base/cool-dude.png", defaultUnlocked: true, tags: ["alien", "cool"] },
  { id: "long-hair", key: "long-hair", name: "Long Hair", theme: "Laid-back watchlist fan", imagePath: "/avatars/base/long-hair.png", defaultUnlocked: true, tags: ["alien", "hair"] },
  { id: "sleepy", key: "sleepy", name: "Sleepy", theme: "Late-night movie watcher", imagePath: "/avatars/base/sleepy.png", defaultUnlocked: true, tags: ["alien", "sleepy"] },
  { id: "nerd", key: "nerd", name: "Nerd", theme: "Deep-cut film expert", imagePath: "/avatars/base/nerd.png", defaultUnlocked: true, tags: ["alien", "glasses"] },
  { id: "spot", key: "spot", name: "Spot", theme: "Speckled cinema critter", imagePath: "/avatars/base/spot.png", defaultUnlocked: true, tags: ["alien", "spotted"] },
  { id: "mohawk", key: "mohawk", name: "Mohawk", theme: "Punk playlist curator", imagePath: "/avatars/base/mohawk.png", defaultUnlocked: true, tags: ["alien", "punk"] },
  { id: "star", key: "star", name: "Star", theme: "Premiere-night superfan", imagePath: "/avatars/base/star.png", defaultUnlocked: true, tags: ["alien", "star"] },
  { id: "ziggy", key: "ziggy", name: "Ziggy", theme: "Zig-zag space pal", imagePath: "/avatars/base/ziggy.png", defaultUnlocked: true, tags: ["alien", "zigzag"] },
];

export const avatarSkins: AvatarSkin[] = [
  { id: "rex", name: "Rex", imagePath: "/avatars/skins/rex.png", unlockType: "ticket", futureTicketCost: 800, rarity: "rare", defaultUnlocked: false, facePlacement: { width: "60%", top: "37%", left: "45%" } },
  { id: "spaceman", name: "Spaceman", imagePath: "/avatars/skins/spaceman.png", unlockType: "ticket", futureTicketCost: 650, rarity: "uncommon", defaultUnlocked: false, facePlacement: { width: "58%", top: "36%", left: "48%" } },
  { id: "gearbox", name: "Gearbox", imagePath: "/avatars/skins/gearbox.png", unlockType: "ticket", futureTicketCost: 700, rarity: "rare", defaultUnlocked: false, facePlacement: { width: "57%", top: "35%", left: "49%" } },
  { id: "spook", name: "Spook", imagePath: "/avatars/skins/spook.png", unlockType: "seasonal", futureTicketCost: 500, rarity: "uncommon", defaultUnlocked: false, facePlacement: { width: "52%", top: "36%", left: "48%" } },
  { id: "peg-leg", name: "Peg Leg", imagePath: "/avatars/skins/peg-leg.png", unlockType: "ticket", futureTicketCost: 550, rarity: "uncommon", defaultUnlocked: false, facePlacement: { width: "55%", top: "38%", left: "48%" } },
  { id: "hocus", name: "Hocus", imagePath: "/avatars/skins/hocus.png", unlockType: "achievement", futureTicketCost: null, rarity: "epic", defaultUnlocked: false, facePlacement: { width: "56%", top: "39%", left: "49%" } },
  { id: "ninjin", name: "Ninjin", imagePath: "/avatars/skins/ninjin.png", unlockType: "ticket", futureTicketCost: 600, rarity: "rare", defaultUnlocked: false, facePlacement: { width: "56%", top: "37%", left: "49%" } },
  { id: "magnifico", name: "Magnifico", imagePath: "/avatars/skins/magnifico.png", unlockType: "limited", futureTicketCost: 900, rarity: "epic", defaultUnlocked: false, facePlacement: { width: "58%", top: "40%", left: "49%" } },
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
