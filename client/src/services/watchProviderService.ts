import type { MovieAvailability, WatchProvider, WatchProviderLink } from "../types";

export const watchProviders: WatchProvider[] = [
  {
    id: "plex",
    name: "Plex",
    icon: "Plex",
    searchUrlTemplate: "https://watch.plex.tv/search?q={title}",
    notes: "Connect Plex from Settings when library linking becomes available.",
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
    notes: "Availability varies by region and device.",
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
    notes: "Availability varies by region.",
  },
  {
    id: "youtube",
    name: "YouTube",
    icon: "YT",
    searchUrlTemplate: "https://www.youtube.com/results?search_query={title}+movie",
    notes: "Availability varies by region.",
  },
  {
    id: "tubi",
    name: "Tubi",
    icon: "Tubi",
    searchUrlTemplate: "https://tubitv.com/search/{title}",
    notes: "Tubi catalog availability varies by region and is not confirmed yet.",
  },
  {
    id: "paramount",
    name: "Paramount+",
    icon: "P+",
    searchUrlTemplate: "https://www.paramountplus.com/search/?query={title}",
    notes: "Availability varies by region.",
  },
];

function encodeMovieTitle(title: string) {
  return encodeURIComponent(title.trim());
}

export function buildProviderSearchUrl(provider: WatchProvider, title: string) {
  if (!provider.searchUrlTemplate) return undefined;
  return provider.searchUrlTemplate.replace("{title}", encodeMovieTitle(title));
}

export function getProviderLinksForMovie(movie: { title: string; tmdbId: number }, streamingRegion?: string): MovieAvailability {
  const links: WatchProviderLink[] = watchProviders.map((provider) => {
    const url = buildProviderSearchUrl(provider, movie.title);

    return {
      provider,
      linkType: provider.id === "plex" ? "connect_placeholder" : "search_fallback",
      url,
      label: provider.id === "plex" ? "Connect Plex Library" : `Search ${provider.name}`,
      availabilityKnown: false,
    };
  });

  const hasRegion = Boolean(streamingRegion?.trim());

  return {
    tmdbId: movie.tmdbId,
    title: movie.title,
    availabilityKnown: false,
    links,
    notes: hasRegion
      ? "Streaming availability coming soon."
      : "Set your streaming region for more accurate availability.",
    regionPrompt: hasRegion ? undefined : "Set your streaming region for more accurate availability.",
  };
}
