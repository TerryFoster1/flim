// Movie Card placeholder.
// Phase 1A note: this legacy placeholder should evolve toward PosterCard; posters are the primary UI element.
// Future role: summarize a movie inside grids, playlists, and search results when a poster-first card is not enough.
// TODO: Accept shared Movie interface once UI rendering is implemented.

export interface MovieCardPlaceholderProps {
  movieId?: string;
  architectureNote: "Presentation-only component; no fetching or mutation logic";
}
