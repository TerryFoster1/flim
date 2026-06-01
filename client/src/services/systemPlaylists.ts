import type { Playlist, PlaylistMovie } from "../types";

function uniqueMovies(movies: PlaylistMovie[]) {
  const seen = new Set<number>();
  return movies.filter((movie) => {
    if (seen.has(movie.tmdbId)) return false;
    seen.add(movie.tmdbId);
    return true;
  });
}

function systemPlaylist(input: Pick<Playlist, "id" | "name" | "description" | "movies" | "systemType">): Playlist {
  const now = new Date().toISOString();
  return {
    ...input,
    publicSlug: input.id,
    visibility: "private",
    createdAt: now,
    updatedAt: now,
    isSystem: true,
  };
}

export function createSystemPlaylists(playlists: Playlist[]) {
  const allMovies = uniqueMovies(playlists.flatMap((playlist) => playlist.movies));
  const watchedMovies = allMovies.filter((movie) => movie.watchStatus === "watched");
  const savedGenres = new Set(allMovies.flatMap((movie) => movie.genres || []));
  const watchedGenres = new Set(watchedMovies.flatMap((movie) => movie.genres || []));
  const recommendationGenres = watchedGenres.size > 0 ? watchedGenres : savedGenres;

  const recommendedMovies = allMovies
    .filter((movie) => movie.watchStatus !== "watched")
    .map((movie) => {
      const matchedGenre = (movie.genres || []).find((genre) => recommendationGenres.has(genre));
      const fallbackSource = watchedMovies[0] || allMovies.find((saved) => saved.tmdbId !== movie.tmdbId);
      return {
        ...movie,
        recommendationReason: matchedGenre
          ? `Because you like ${matchedGenre}`
          : fallbackSource
            ? `Because you saved ${fallbackSource.title}`
            : "Because it is in your movie playlists",
      };
    })
    .slice(0, 24);

  return [
    systemPlaylist({
      id: "system-most-watched",
      name: "My Most Watched",
      description: "Movies you have marked watched across your playlists.",
      movies: watchedMovies,
      systemType: "most_watched",
    }),
    systemPlaylist({
      id: "system-recommended",
      name: "Recommended Movies",
      description: "Simple picks based on saved movies, watched movies, and genre signals.",
      movies: recommendedMovies,
      systemType: "recommended",
    }),
    systemPlaylist({
      id: "system-plex-library",
      name: "My Plex Library",
      description: "Connect Plex later to turn this into your Plex-owned movie shelf.",
      movies: [],
      systemType: "plex_library",
    }),
  ];
}
