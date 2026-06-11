export function isTriviaGamesEnabled() {
  return import.meta.env.VITE_ENABLE_TRIVIA_GAMES?.trim().toLowerCase() === "true";
}
