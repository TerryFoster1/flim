// Central placeholder content for the Phase 1C React visual shell.
// Future implementation note: replace these arrays with API-backed view models
// after movie search, provider availability, auth, and persistence scopes open.

export type PosterTone = "red" | "blue" | "green" | "gold" | "violet";

export interface PlaceholderMovie {
  id: string;
  title: "Movie Title";
  year: string;
  runtime: string;
  genre: "Genre Name";
  status: string;
  tone: PosterTone;
}

export interface PlaceholderPlaylist {
  id: string;
  title: "Playlist Name";
  creator: "User Name";
  description: string;
  followers: string;
  movieCount: string;
  tone: PosterTone;
}

export interface PlaceholderProvider {
  id: string;
  name: "Provider Name";
  tone: PosterTone;
}

export interface PlaceholderStat {
  label: string;
  value: string;
}

const tones: PosterTone[] = ["red", "blue", "green", "gold", "violet"];

export const placeholderMovies: PlaceholderMovie[] = Array.from({ length: 14 }, (_, index) => ({
  id: `placeholder-movie-${index + 1}`,
  title: "Movie Title",
  year: String(1980 + index),
  runtime: `${92 + index * 4} min`,
  genre: "Genre Name",
  status: index % 3 === 0 ? "Watched" : index % 3 === 1 ? "Want to watch" : "Queued",
  tone: tones[index % tones.length],
}));

export const placeholderPlaylists: PlaceholderPlaylist[] = Array.from({ length: 8 }, (_, index) => ({
  id: `placeholder-playlist-${index + 1}`,
  title: "Playlist Name",
  creator: "User Name",
  description: "A poster-first placeholder playlist for planning the future Flim experience.",
  followers: `${index + 2}.${index}k followers`,
  movieCount: `${10 + index} movies`,
  tone: tones[index % tones.length],
}));

export const placeholderProviders: PlaceholderProvider[] = [
  { id: "provider-1", name: "Provider Name", tone: "red" },
  { id: "provider-2", name: "Provider Name", tone: "blue" },
  { id: "provider-3", name: "Provider Name", tone: "violet" },
  { id: "provider-4", name: "Provider Name", tone: "green" },
  { id: "provider-5", name: "Provider Name", tone: "gold" },
  { id: "provider-6", name: "Provider Name", tone: "blue" },
  { id: "provider-7", name: "Provider Name", tone: "green" },
  { id: "provider-8", name: "Provider Name", tone: "violet" },
  { id: "provider-9", name: "Provider Name", tone: "gold" },
  { id: "provider-10", name: "Provider Name", tone: "red" },
];

export const placeholderGenres = ["Genre Name", "Genre Name", "Genre Name", "Genre Name", "Genre Name"];

export const profileStats: PlaceholderStat[] = [
  { label: "Playlists", value: "24" },
  { label: "Watched", value: "128" },
  { label: "Followers", value: "2.4k" },
  { label: "Roulette Spins", value: "18" },
];
