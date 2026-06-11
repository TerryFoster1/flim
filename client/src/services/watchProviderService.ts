import type { MediaType, MovieAvailability, ProviderAccessType, WatchProvider, WatchProviderLink } from "../types";

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
    id: "cineplex",
    name: "Cineplex",
    icon: "Cineplex",
    searchUrlTemplate: "https://store.cineplex.com/search?query={title}",
    notes: "Cineplex rental and purchase availability varies by title.",
  },
  {
    id: "shudder",
    name: "Shudder",
    icon: "Shudder",
    searchUrlTemplate: "https://www.shudder.com/search?search={title}",
    notes: "Shudder catalog availability varies by region.",
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

interface ProviderAvailabilityApiLink {
  providerId: string;
  providerName: string;
  region: string;
  availabilityType: ProviderAccessType;
  deepLink?: string;
  searchFallbackUrl?: string;
  logoUrl?: string;
  source: string;
}

interface ProviderAvailabilityApiResponse {
  mediaType: MediaType;
  tmdbId: number;
  region: string;
  availabilityKnown: boolean;
  sourceConfigured: boolean;
  links: ProviderAvailabilityApiLink[];
  notes: string;
}

function regionOrDefault(region?: string) {
  return region?.trim().toUpperCase() || "CA";
}

function providerFromApi(link: ProviderAvailabilityApiLink): WatchProvider {
  const knownProvider = watchProviders.find((provider) => provider.id === link.providerId);
  if (knownProvider) return { ...knownProvider, logoUrl: link.logoUrl || knownProvider.logoUrl };

  return {
    id: link.providerId,
    name: link.providerName,
    icon: link.providerName,
    logoUrl: link.logoUrl,
    notes: "Confirmed provider availability.",
  };
}

function buildProviderLinkUrl(link: ProviderAvailabilityApiLink, mediaType: MediaType, tmdbId: number, title: string) {
  const params = new URLSearchParams({
    mediaType,
    region: regionOrDefault(link.region),
    linkType: link.deepLink ? "exact" : "search_fallback",
  });

  if (link.availabilityType) params.set("availabilityType", link.availabilityType);
  if (title.trim()) params.set("title", title.trim());

  return `/api/provider-link/${encodeURIComponent(link.providerId)}/${tmdbId}?${params.toString()}`;
}

export async function getProviderAvailabilityForTitle(movie: { title: string; tmdbId: number; mediaType?: MediaType }, streamingRegion?: string): Promise<MovieAvailability> {
  const region = regionOrDefault(streamingRegion);
  const mediaType = movie.mediaType || "movie";
  const params = new URLSearchParams({
    mediaType,
    tmdbId: String(movie.tmdbId),
    title: movie.title,
    region,
  });

  const response = await fetch(`/api/providers/availability?${params.toString()}`, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error("Provider availability request failed.");
  }

  const payload = (await response.json()) as ProviderAvailabilityApiResponse;
  const links: WatchProviderLink[] = payload.links.map((link) => ({
    provider: providerFromApi(link),
    linkType: link.deepLink ? "exact" : "search_fallback",
    url: buildProviderLinkUrl(link, mediaType, payload.tmdbId, movie.title),
    deepLinkUrl: link.deepLink,
    accessType: link.availabilityType,
    label: link.deepLink ? `Open ${link.providerName}` : `Search ${link.providerName}`,
    availabilityKnown: true,
  }));

  return {
    tmdbId: payload.tmdbId,
    mediaType: payload.mediaType,
    title: movie.title,
    availabilityKnown: payload.availabilityKnown,
    links,
    notes: payload.notes || "Streaming availability coming soon.",
  };
}
