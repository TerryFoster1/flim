export function isNativeAdsEnabled() {
  return process.env.ENABLE_NATIVE_ADS?.trim().toLowerCase() === "true";
}

export function isTriviaGamesEnabled() {
  return process.env.ENABLE_TRIVIA_GAMES?.trim().toLowerCase() === "true";
}
