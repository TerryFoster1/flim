import type { MediaType, MovieAvailability, ProviderAccessType, TicketAvailabilityLink, WatchProvider, WatchProviderLink } from "../types";

export const watchProviders: WatchProvider[] = [
  {
    id: "plex",
    name: "Plex",
    icon: "Plex",
    aliases: ["personal library", "media server"],
    categories: ["library", "owned"],
    searchUrlTemplate: "https://watch.plex.tv/search?q={title}",
    notes: "Connect Plex from Settings when library linking becomes available.",
  },
  {
    id: "netflix",
    name: "Netflix",
    icon: "N",
    aliases: ["netflix canada"],
    categories: ["streaming", "subscription"],
    searchUrlTemplate: "https://www.netflix.com/search?q={title}",
    notes: "Netflix deep-link behavior varies by device, region, browser, and app support.",
  },
  {
    id: "prime",
    name: "Prime Video",
    icon: "Prime",
    aliases: ["Amazon", "Amazon Prime", "Amazon Prime Video"],
    categories: ["streaming", "subscription", "rent", "buy"],
    searchUrlTemplate: "https://www.primevideo.com/search/ref=atv_nb_sr?phrase={title}",
    notes: "Availability varies by region and device.",
  },
  {
    id: "disney",
    name: "Disney+",
    icon: "D+",
    aliases: ["Disney Plus", "DisneyPlus", "Disney"],
    categories: ["streaming", "subscription", "family"],
    searchUrlTemplate: "https://www.disneyplus.com/search?q={title}",
    notes: "Disney+ links open search because exact title deep links require confirmed provider data.",
  },
  {
    id: "apple",
    name: "Apple TV",
    icon: "TV",
    aliases: ["Apple TV+", "iTunes"],
    categories: ["streaming", "subscription", "rent", "buy"],
    searchUrlTemplate: "https://tv.apple.com/search?term={title}",
    notes: "Apple TV search links may open the web experience or native app depending on device.",
  },
  {
    id: "crave",
    name: "Crave",
    icon: "Crave",
    aliases: ["CraveTV"],
    categories: ["streaming", "subscription", "canada"],
    searchUrlTemplate: "https://www.crave.ca/en/search?query={title}",
    notes: "Availability varies by region.",
  },
  {
    id: "cineplex",
    name: "Cineplex",
    icon: "Cineplex",
    aliases: ["Cineplex Store"],
    categories: ["rent", "buy", "canada"],
    searchUrlTemplate: "https://store.cineplex.com/search?query={title}",
    notes: "Cineplex rental and purchase availability varies by title.",
  },
  {
    id: "shudder",
    name: "Shudder",
    icon: "Shudder",
    aliases: ["Shudder Canada"],
    categories: ["streaming", "subscription", "horror"],
    searchUrlTemplate: "https://www.shudder.com/search?search={title}",
    notes: "Shudder catalog availability varies by region.",
  },
  {
    id: "youtube",
    name: "YouTube",
    icon: "YT",
    aliases: ["YouTube Movies", "YouTube Movies & TV"],
    categories: ["rent", "buy", "free"],
    searchUrlTemplate: "https://www.youtube.com/results?search_query={title}+movie",
    notes: "Availability varies by region.",
  },
  {
    id: "tubi",
    name: "Tubi",
    icon: "Tubi",
    aliases: ["Tubi TV"],
    categories: ["streaming", "free"],
    searchUrlTemplate: "https://tubitv.com/search/{title}",
    notes: "Tubi catalog availability varies by region and is not confirmed yet.",
  },
  {
    id: "paramount",
    name: "Paramount+",
    icon: "P+",
    aliases: ["Paramount Plus", "ParamountPlus", "Paramount"],
    categories: ["streaming", "subscription"],
    searchUrlTemplate: "https://www.paramountplus.com/search/?query={title}",
    notes: "Availability varies by region.",
  },
  {
    id: "hulu",
    name: "Hulu",
    icon: "Hulu",
    aliases: ["Hulu streaming"],
    categories: ["streaming", "subscription"],
    searchUrlTemplate: "https://www.hulu.com/search?q={title}",
    notes: "Availability varies by region.",
  },
  {
    id: "max",
    name: "Max",
    icon: "Max",
    aliases: ["HBO Max"],
    categories: ["streaming", "subscription"],
    searchUrlTemplate: "https://www.max.com/search?q={title}",
    notes: "Availability varies by region.",
  },
  {
    id: "hoopla",
    name: "Hoopla",
    icon: "Hoopla",
    aliases: ["Hoopla Digital"],
    categories: ["library", "free"],
    searchUrlTemplate: "https://www.hoopladigital.com/search?q={title}&scope=everything&type=direct",
    notes: "Availability varies by library and region.",
  },
  {
    id: "cbc_gem",
    name: "CBC Gem",
    icon: "Gem",
    aliases: ["CBCGem"],
    categories: ["streaming", "free", "canada"],
    searchUrlTemplate: "https://gem.cbc.ca/search?query={title}",
    notes: "Availability varies by region.",
  },
  {
    id: "google_tv",
    name: "Google TV",
    icon: "GTV",
    aliases: ["Google Play", "Google Play Movies", "Google Play Movies & TV"],
    categories: ["rent", "buy"],
    searchUrlTemplate: "https://play.google.com/store/search?q={title}&c=movies",
    notes: "Rental and purchase availability varies by region.",
  },
  {
    id: "criterion",
    name: "Criterion Channel",
    icon: "Criterion",
    aliases: ["The Criterion Channel"],
    categories: ["streaming", "subscription", "classic", "arthouse"],
    searchUrlTemplate: "https://www.criterionchannel.com/search?q={title}",
    notes: "Availability varies by region.",
  },
  {
    id: "hollywood_suite",
    name: "Hollywood Suite",
    icon: "HS",
    aliases: ["HollywoodSuite", "Hollywood Suite Canada"],
    categories: ["streaming", "subscription", "canada", "classic"],
    searchUrlTemplate: "https://hollywoodsuite.ca/?s={title}",
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
  ticketLinks?: TicketAvailabilityLink[];
  notes: string;
}

const regionAliases: Record<string, string> = {
  "": "CA",
  ca: "CA",
  can: "CA",
  canada: "CA",
  us: "US",
  usa: "US",
  "united states": "US",
  "united states of america": "US",
  gb: "GB",
  uk: "GB",
  "united kingdom": "GB",
  au: "AU",
  australia: "AU",
};

export const supportedStreamingRegions = [
  { code: "CA", label: "Canada" },
  { code: "US", label: "United States" },
  { code: "GB", label: "United Kingdom" },
  { code: "AU", label: "Australia" },
] as const;

export function normalizeStreamingRegion(region?: string) {
  const normalized = String(region || "").trim().toLowerCase();
  return regionAliases[normalized] || normalized.toUpperCase() || "CA";
}

export function streamingRegionLabel(region?: string) {
  const code = normalizeStreamingRegion(region);
  return supportedStreamingRegions.find((item) => item.code === code)?.label || code;
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
    region: normalizeStreamingRegion(link.region),
    linkType: link.deepLink ? "exact" : "search_fallback",
  });

  if (link.availabilityType) params.set("availabilityType", link.availabilityType);
  if (title.trim()) params.set("title", title.trim());

  return `/api/provider-link/${encodeURIComponent(link.providerId)}/${tmdbId}?${params.toString()}`;
}

export async function getProviderAvailabilityForTitle(movie: { title: string; tmdbId: number; mediaType?: MediaType }, streamingRegion?: string): Promise<MovieAvailability> {
  const region = normalizeStreamingRegion(streamingRegion);
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
    ticketLinks: Array.isArray(payload.ticketLinks) ? payload.ticketLinks : [],
    notes: payload.notes || "Streaming availability coming soon.",
  };
}
