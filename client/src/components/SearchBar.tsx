// Search Bar placeholder.
// Future role: capture movie or playlist search intent before API-backed search exists.
// TODO: Keep search transport and debouncing in hooks/services, not directly in the component.

export interface SearchBarPlaceholderProps {
  scope?: "movies" | "playlists" | "all";
  architectureNote: "Input shell only; no search implementation";
}
