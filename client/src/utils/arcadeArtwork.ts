const ARCADE_COLLECTION_ARTWORK_RULES: Array<[string[], string]> = [
  [["tom cruise"], "/arcade/art/tom-cruise.png"],
  [["time travel", "time-travel", "time loop", "back to the future"], "/arcade/art/time-travel.png"],
  [["alien"], "/arcade/art/alien.png"],
  [["sci-fi", "sci fi", "science fiction", "space", "out of this world"], "/arcade/art/sci-fi.png"],
  [["adventure", "mission"], "/arcade/art/adventure.png"],
  [["fantasy", "wizard", "harry", "lord of the rings"], "/arcade/art/fantasy.png"],
  [["anime"], "/arcade/art/anime.png"],
  [["animation", "animated", "disney", "pixar"], "/arcade/art/animation.png"],
  [["horror", "slasher"], "/arcade/art/horror.png"],
  [["comedy", "comedies"], "/arcade/art/comedy.png"],
  [["natural disaster", "disaster"], "/arcade/art/natural-disaster.png"],
  [["apocalypse", "apocalyptic"], "/arcade/art/apocalypse.png"],
  [["zombie"], "/arcade/art/zombie.png"],
  [["summer", "blockbuster"], "/arcade/art/summer.png"],
  [["christmas", "holiday"], "/arcade/art/christmas.png"],
  [["action", "hero"], "/arcade/art/action.png"],
];

export function arcadeCollectionArtworkForText(...parts: Array<string | null | undefined>) {
  const text = parts.filter(Boolean).join(" ").toLowerCase();
  if (!text) return "";
  return ARCADE_COLLECTION_ARTWORK_RULES.find(([keywords]) => keywords.some((keyword) => text.includes(keyword)))?.[1] || "";
}
