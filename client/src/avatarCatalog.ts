export interface FlimAvatar {
  key: string;
  name: string;
  theme: string;
  icon: string;
  colors: [string, string];
}

export const defaultAvatarKey = "director";

export const flimAvatars: FlimAvatar[] = [
  { key: "director", name: "Director", theme: "Film director with clapboard", icon: "clap", colors: ["#ffbf34", "#ff4f6d"] },
  { key: "popcorn", name: "Popcorn", theme: "Movie-night mascot", icon: "pop", colors: ["#fff0b8", "#ff8a3d"] },
  { key: "astronaut", name: "Astronaut", theme: "Sci-fi explorer", icon: "astro", colors: ["#89d9ff", "#7c6bff"] },
  { key: "film-reel", name: "Film Reel", theme: "Classic cinema", icon: "reel", colors: ["#f2f2f2", "#7a8499"] },
  { key: "retro-vhs", name: "Retro VHS", theme: "80s collector", icon: "vhs", colors: ["#ff5cc8", "#2bd9ff"] },
  { key: "detective", name: "Detective", theme: "Mystery watcher", icon: "spy", colors: ["#d2b48c", "#293447"] },
  { key: "monster-hunter", name: "Monster Hunter", theme: "Horror fan", icon: "moon", colors: ["#7fff8a", "#4b1d78"] },
  { key: "explorer", name: "Explorer", theme: "Adventure seeker", icon: "map", colors: ["#8de36f", "#d8a23c"] },
  { key: "robot", name: "Robot", theme: "Sci-fi AI", icon: "bot", colors: ["#65ffe2", "#335dff"] },
  { key: "projectionist", name: "Projectionist", theme: "Theater operator", icon: "beam", colors: ["#ffd875", "#7a4cff"] },
  { key: "film-critter", name: "Film Critter", theme: "Cute cinema mascot", icon: "star", colors: ["#ff9eb5", "#ffe36e"] },
  { key: "movie-buff", name: "Movie Buff", theme: "All-around film fan", icon: "ticket", colors: ["#ff7a45", "#ffd95a"] },
];

export function getFlimAvatar(key?: string) {
  return flimAvatars.find((avatar) => avatar.key === key) || flimAvatars[0];
}
