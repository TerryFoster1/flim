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
  if (exactVideos.length > 0) return exactVideos;

  const mediaType = media.mediaType ?? "movie";
  return [
    {
      provider: "youtube",
      contentType: "official_trailer",
      url: buildYoutubeTrailerSearchUrl(media.title, mediaType),
      linkType: "search_fallback",
      label: "Open YouTube Search",
    },
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
