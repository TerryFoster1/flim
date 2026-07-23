const ARCADE_COLLECTION_ARTWORK_RULES: Array<[string[], string]> = [
  [["tom cruise"], "/arcade/art/tom-cruise.webp"],
  [["time travel", "time-travel", "time loop", "back to the future"], "/arcade/art/time-travel.webp"],
  [["alien"], "/arcade/art/alien.webp"],
  [["sci-fi", "sci fi", "science fiction", "space", "out of this world"], "/arcade/art/sci-fi.webp"],
  [["adventure", "mission"], "/arcade/art/adventure.webp"],
  [["fantasy", "wizard", "harry", "lord of the rings"], "/arcade/art/fantasy.webp"],
  [["anime"], "/arcade/art/anime.webp"],
  [["animation", "animated", "disney", "pixar"], "/arcade/art/animation.webp"],
  [["horror", "slasher"], "/arcade/art/horror.webp"],
  [["comedy", "comedies"], "/arcade/art/comedy.webp"],
  [["natural disaster", "disaster"], "/arcade/art/natural-disaster.webp"],
  [["apocalypse", "apocalyptic"], "/arcade/art/apocalypse.webp"],
  [["zombie"], "/arcade/art/zombie.webp"],
  [["summer", "blockbuster"], "/arcade/art/summer.webp"],
  [["christmas", "holiday"], "/arcade/art/christmas.webp"],
  [["action", "hero"], "/arcade/art/action.webp"],
];

export function arcadeCollectionArtworkForText(...parts: Array<string | null | undefined>) {
  const text = parts.filter(Boolean).join(" ").toLowerCase();
  if (!text) return "";
  return ARCADE_COLLECTION_ARTWORK_RULES.find(([keywords]) => keywords.some((keyword) => text.includes(keyword)))?.[1] || "";
}
