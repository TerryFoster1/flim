import type { MediaExtensions, MediaType, MediaVideoLink, SoundtrackAvailability, TriviaEntry } from "../types";

function encodeQuery(value: string) {
  return encodeURIComponent(value.trim());
}

export function buildSpotifySoundtrackSearchUrl(title: string) {
  return `https://open.spotify.com/search/${encodeQuery(`${title} Original Motion Picture Soundtrack`)}`;
}

export function buildYoutubeTrailerSearchUrl(title: string, mediaType: MediaType = "movie") {
  const suffix = mediaType === "tv" ? "official trailer series" : "official trailer";
  return `https://www.youtube.com/results?search_query=${encodeQuery(`${title} ${suffix}`)}`;
}

export function buildYoutubeExtraSearchUrl(title: string, contentType: "recap" | "behind_the_scenes", mediaType: MediaType = "movie") {
  const suffix = contentType === "recap"
    ? mediaType === "tv" ? "season recap" : "movie recap before watching sequel"
    : "behind the scenes interview director featurette";
  return `https://www.youtube.com/results?search_query=${encodeQuery(`${title} ${suffix}`)}`;
}

export function getSoundtrackAvailability(media: { tmdbId: number; title: string; mediaType?: MediaType }): SoundtrackAvailability {
  const mediaType = media.mediaType ?? "movie";
  const query = mediaType === "tv" ? `${media.title} soundtrack theme` : `${media.title} Original Motion Picture Soundtrack`;

  return {
    tmdbId: media.tmdbId,
    mediaType,
    title: media.title,
    availabilityKnown: false,
    soundtrack: {
      mediaType,
      tmdbId: media.tmdbId,
      title: media.title,
      query,
      links: [
        {
          provider: "spotify",
          url: `https://open.spotify.com/search/${encodeQuery(query)}`,
          linkType: "search_fallback",
          label: "Open Spotify Search",
        },
      ],
    },
    notes: "Find soundtrack albums and playlists on Spotify.",
  };
}

export function getTrailerLinks(media: { tmdbId: number; title: string; mediaType?: MediaType; videos?: MediaVideoLink[] }): MediaVideoLink[] {
  const exactVideos = Array.isArray(media.videos) ? media.videos.filter((video) => Boolean(video?.url)) : [];
  const mediaType = media.mediaType ?? "movie";
  const extraFallbacks: MediaVideoLink[] = [
    {
      provider: "youtube",
      contentType: "recap",
      url: buildYoutubeExtraSearchUrl(media.title, "recap", mediaType),
      linkType: "search_fallback",
      label: mediaType === "tv" ? "Find Season Recaps" : "Find Movie Recaps",
    },
    {
      provider: "youtube",
      contentType: "behind_the_scenes",
      url: buildYoutubeExtraSearchUrl(media.title, "behind_the_scenes", mediaType),
      linkType: "search_fallback",
      label: "Find Bonus Features",
    },
  ];

  if (exactVideos.length > 0) {
    const hasCuratedExtra = exactVideos.some((video) => !["official_trailer", "teaser_trailer"].includes(video.contentType));
    return hasCuratedExtra ? exactVideos : [...exactVideos, ...extraFallbacks];
  }

  return [
    {
      provider: "youtube",
      contentType: "official_trailer",
      url: buildYoutubeTrailerSearchUrl(media.title, mediaType),
      linkType: "search_fallback",
      label: "Find Official Trailer",
    },
    ...extraFallbacks,
  ];
}

export function getTriviaPlaceholders(media: { tmdbId: number; title: string; mediaType?: MediaType }): TriviaEntry[] {
  return [
    {
      mediaType: media.mediaType ?? "movie",
      tmdbId: media.tmdbId,
      category: "trivia",
      title: "Trivia & facts coming soon",
    },
  ];
}

export function getMediaExtensions(media: { tmdbId: number; title: string; mediaType?: MediaType; videos?: MediaVideoLink[] }): MediaExtensions {
  return {
    mediaType: media.mediaType ?? "movie",
    tmdbId: media.tmdbId,
    title: media.title,
    soundtrack: getSoundtrackAvailability(media),
    videos: getTrailerLinks(media),
    trivia: getTriviaPlaceholders(media),
    notes: "Explore more ways to enjoy this title.",
  };
}

