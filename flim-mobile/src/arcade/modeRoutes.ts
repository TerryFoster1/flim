export const arcadeModeRoutes = {
  trivia: "/arcade/trivia",
  quote: "/arcade/quotes",
  poster: "/arcade/poster-guess",
  group: "/arcade/group-play",
  leaderboards: "/arcade/leaderboards",
  rewards: "/arcade/rewards"
} as const;

export const visibleArcadeModes = [
  { id: "trivia", iconKey: "trivia", title: "Movie Trivia", subtitle: "Browse title packs", route: arcadeModeRoutes.trivia },
  { id: "quote", iconKey: "quote", title: "Quote Challenge", subtitle: "Browse quote packs", route: arcadeModeRoutes.quote },
  { id: "poster", iconKey: "poster", title: "Poster Guess", subtitle: "Reveal the movie", route: arcadeModeRoutes.poster },
  { id: "group", iconKey: "group", title: "Group Play", subtitle: "Movie night rooms", route: arcadeModeRoutes.group },
  { id: "leaderboards", iconKey: "leaderboards", title: "Leaderboards", subtitle: "See standings", route: arcadeModeRoutes.leaderboards },
  { id: "rewards", iconKey: "rewards", title: "Rewards", subtitle: "Tickets and badges", route: arcadeModeRoutes.rewards }
] as const;

export function resolveChallengeRoute(challenge: { id?: string; slug?: string }) {
  return `/arcade/challenge/${encodeURIComponent(challenge.slug || challenge.id || "featured")}`;
}
