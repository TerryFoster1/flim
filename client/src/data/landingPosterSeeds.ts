interface LandingPosterSeed {
  title: string;
  mediaType: "movie" | "tv";
  posterUrl: string;
}

const tmdbPosterBaseUrl = "https://image.tmdb.org/t/p/w500";

export const landingPosterSeeds: LandingPosterSeed[] = [
  {
    title: "Interstellar",
    mediaType: "movie",
    posterUrl: `${tmdbPosterBaseUrl}/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg`,
  },
  {
    title: "The Dark Knight",
    mediaType: "movie",
    posterUrl: `${tmdbPosterBaseUrl}/qJ2tW6WMUDux911r6m7haRef0WH.jpg`,
  },
  {
    title: "E.T. the Extra-Terrestrial",
    mediaType: "movie",
    posterUrl: `${tmdbPosterBaseUrl}/an0nD6uq6byfxXCfk6lQBzdL2J1.jpg`,
  },
  {
    title: "Back to the Future",
    mediaType: "movie",
    posterUrl: `${tmdbPosterBaseUrl}/fNOH9f1aA7XRTzl1sAOx9iF553Q.jpg`,
  },
  {
    title: "Jurassic Park",
    mediaType: "movie",
    posterUrl: `${tmdbPosterBaseUrl}/b1xCNnyrPebIc7EWNZIa6jhb1Ww.jpg`,
  },
  {
    title: "The Lord of the Rings: The Fellowship of the Ring",
    mediaType: "movie",
    posterUrl: `${tmdbPosterBaseUrl}/6oom5QYQ2yQTMJIbnvbkBL9cHo6.jpg`,
  },
  {
    title: "Breaking Bad",
    mediaType: "tv",
    posterUrl: `${tmdbPosterBaseUrl}/ztkUQFLlC19CCMYHW9o1zWhJRNq.jpg`,
  },
  {
    title: "The Office",
    mediaType: "tv",
    posterUrl: `${tmdbPosterBaseUrl}/qWnJzyZhyy74gjpSjIXWmuk0ifX.jpg`,
  },
];
