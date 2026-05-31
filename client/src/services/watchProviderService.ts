import type { MovieAvailability, WatchProvider, WatchProviderLink } from "../types";

export const watchProviders: WatchProvider[] = [
  {
    id: "plex",
    name: "Plex",
    icon: "Plex",
    searchUrlTemplate: "https://watch.plex.tv/search?q={title}",
    notes: "Plex is Flim's first planned serious library and remote playback target. Account connection is not implemented yet.",
  },
  {
    id: "netflix",
    name: "Netflix",
    icon: "N",
    searchUrlTemplate: "https://www.netflix.com/search?q={title}",
    notes: "Netflix deep-link behavior varies by device, region, browser, and app support.",
  },
  {
    id: "prime",
    name: "Prime Video",
    icon: "Prime",
    searchUrlTemplate: "https://www.primevideo.com/search/ref=atv_nb_sr?phrase={title}",
    notes: "Prime Video search links are fallbacks, not confirmed availability.",
  },
  {
    id: "disney",
    name: "Disney+",
    icon: "D+",
    searchUrlTemplate: "https://www.disneyplus.com/search?q={title}",
    notes: "Disney+ links open search because exact title deep links require confirmed provider data.",
  },
  {
    id: "apple",
    name: "Apple TV",
    icon: "TV",
    searchUrlTemplate: "https://tv.apple.com/search?term={title}",
    notes: "Apple TV search links may open the web experience or native app depending on device.",
  },
  {
    id: "crave",
    name: "Crave",
    icon: "Crave",
    searchUrlTemplate: "https://www.crave.ca/en/search?query={title}",
    notes: "Crave availability is regional and not confirmed by this placeholder link.",
  },
  {
    id: "youtube",
    name: "YouTube",
    icon: "YT",
    searchUrlTemplate: "https://www.youtube.com/results?search_query={title}+movie",
    notes: "YouTube fallback opens a movie search and does not confirm rental or purchase availability.",
  },
  {
    id: "tubi",
    name: "Tubi",
    icon: "Tubi",
    searchUrlTemplate: "https://tubitv.com/search/{title}",
    notes: "Tubi catalog availability varies by region and is not confirmed yet.",
  },
];

function encodeMovieTitle(title: string) {
  return encodeURIComponent(title.trim());
}

export function buildProviderSearchUrl(provider: WatchProvider, title: string) {
  if (!provider.searchUrlTemplate) return undefined;
  return provider.searchUrlTemplate.replace("{title}", encodeMovieTitle(title));
}

export function getProviderLinksForMovie(movie: { title: string; tmdbId: number }): MovieAvailability {
  const links: WatchProviderLink[] = watchProviders.map((provider) => {
    const url = buildProviderSearchUrl(provider, movie.title);

    return {
      provider,
      linkType: provider.id === "plex" ? "connect_placeholder" : "search_fallback",
      url,
      label: provider.id === "plex" ? "Connect Plex Library" : `Open ${provider.name}`,
      availabilityKnown: false,
    };
  });

  return {
    tmdbId: movie.tmdbId,
    title: movie.title,
    availabilityKnown: false,
    links,
    notes: "Streaming availability coming soon. Current buttons open provider search fallbacks and do not confirm availability.",
  };
}
