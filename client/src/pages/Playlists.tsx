import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { ContinueWatchingRow } from "../components/ContinueWatchingRow";
import { DiscoveryRecommendationShelf } from "../components/DiscoveryRecommendationShelf";
import { AddToPlaylistControl } from "../components/AddToPlaylistControl";
import { PlaylistGrid } from "../components/PlaylistGrid";
import { landingPosterSeeds } from "../data/landingPosterSeeds";
import { searchDiscovery } from "../services/discoveryService";
import { getRecommendations } from "../services/recommendationService";
import type { ActorSummary, CurrentUser, DiscoveryCollectionResult, DiscoveryHubLink, DiscoverySearchResults, MovieSearchResult, Playlist, PlaylistMovie } from "../types";

interface PlaylistsProps {
  onNavigate: (path: string) => void;
  playlists: Playlist[];
  rewindPlaylists: Playlist[];
  onCreatePlaylist: (input: Pick<Playlist, "name" | "description" | "visibility">) => Promise<Playlist>;
  addToPlaylist: (playlistId: string, movie: MovieSearchResult) => void | Promise<void>;
  onOpenRoulette?: (playlists?: Playlist[]) => void;
  currentUser: CurrentUser | null;
  notice?: string;
  initialView?: PlaylistView;
  playlistLoadStatus?: "loading" | "ready" | "error";
  playlistLoadMessage?: string;
}

type PlaylistView = "my" | "public";
type SearchResultTab = "playlists" | "titles" | "actors" | "genre";
type SearchContentFilter = "both" | "movie" | "tv";
type InlineDiscoveryStatus = "loading" | "ready" | "error";

interface PlaylistSearchFilters {
  content: SearchContentFilter;
  genre: string;
  mood: string;
}

interface InlineDiscoveryState {
  status: InlineDiscoveryStatus;
  similarTitles: MovieSearchResult[];
  relatedPlaylists: Playlist[];
}

const defaultPlaylistSearchFilters: PlaylistSearchFilters = {
  content: "both",
  genre: "",
  mood: "",
};

const playlistSearchGenres = ["Comedy", "Drama", "Horror", "Sci-Fi", "Action", "Romance", "Animation", "Adventure", "Fantasy", "Thriller"];
const playlistSearchMoods = ["Funny", "Dark", "Feel Good", "Scary", "Romantic", "Mind-Bending", "Family", "Adventure"];

const PLAYLIST_VISIBILITY_OPTIONS: Array<{ value: Playlist["visibility"]; label: string; helper: string }> = [
  { value: "private", label: "Private", helper: "Only you can view and edit." },
  { value: "shared", label: "Shared", helper: "Invite collaborators to edit titles." },
  { value: "public", label: "Public", helper: "Anyone can view. Collaborators can edit." },
];

const PLAYLIST_VISIBILITY_HELP: Record<Playlist["visibility"], string> = {
  private: "Private playlists are only visible to you.",
  shared: "Shared playlists stay hidden from public discovery. Invited collaborators can add, remove, and reorder titles.",
  public: "Public playlists can be discovered by anyone. Owner and invited collaborators can edit titles.",
};

const searchResultTabs: Array<{ id: SearchResultTab; label: string }> = [
  { id: "playlists", label: "Playlists" },
  { id: "titles", label: "Titles" },
  { id: "actors", label: "Actors" },
  { id: "genre", label: "Genre" },
];

const genreIdLabels: Record<number, string> = {
  12: "Adventure",
  14: "Fantasy",
  16: "Animation",
  18: "Drama",
  27: "Horror",
  28: "Action",
  35: "Comedy",
  53: "Thriller",
  878: "Sci-Fi",
  10749: "Romance",
  10751: "Family",
  10759: "Action",
  10762: "Family",
  10765: "Sci-Fi",
};

const moodSearchTerms: Record<string, string[]> = {
  Funny: ["comedy", "funny", "hilarious", "rom-com"],
  Dark: ["dark", "thriller", "horror", "crime"],
  "Feel Good": ["feel good", "family", "comedy", "romance"],
  Scary: ["horror", "scary", "slasher", "ghost", "zombie"],
  Romantic: ["romance", "rom-com", "love"],
  "Mind-Bending": ["sci-fi", "science fiction", "mystery", "thriller", "time travel"],
  Family: ["family", "animation", "adventure"],
  Adventure: ["adventure", "quest", "action"],
};

const curatedSearchSignals: Array<{ terms: string[]; titles: string[]; genres?: string[]; label: string }> = [
  {
    terms: ["arnold", "arnold schwarzenegger", "schwarzenegger"],
    titles: ["terminator", "predator", "total recall", "running man", "commando", "true lies", "conan"],
    genres: ["action", "science fiction"],
    label: "Arnold Schwarzenegger titles",
  },
  {
    terms: ["tom cruise", "cruise"],
    titles: ["mission impossible", "top gun", "edge of tomorrow", "minority report", "jerry maguire", "collateral"],
    genres: ["action", "thriller"],
    label: "Tom Cruise titles",
  },
  {
    terms: ["time travel", "time loop", "timeline"],
    titles: ["back to the future", "terminator", "looper", "primer", "edge of tomorrow", "12 monkeys", "time machine"],
    genres: ["science fiction"],
    label: "time travel titles",
  },
  {
    terms: ["zombie", "zombies", "undead"],
    titles: ["night of the living dead", "dawn of the dead", "28 days later", "world war z", "zombieland", "train to busan"],
    genres: ["horror"],
    label: "zombie titles",
  },
  {
    terms: ["apocalypse", "post apocalypse", "post-apocalypse", "end of the world"],
    titles: ["mad max", "the road", "book of eli", "children of men", "day after tomorrow", "wall-e"],
    genres: ["science fiction", "thriller"],
    label: "apocalypse titles",
  },
  {
    terms: ["alien", "aliens", "extraterrestrial"],
    titles: ["alien", "aliens", "arrival", "the thing", "predator", "contact", "district 9", "avatar"],
    genres: ["science fiction"],
    label: "alien titles",
  },
  {
    terms: ["anime", "animation", "animated"],
    titles: ["spirited away", "akira", "princess mononoke", "your name", "toy story", "shrek", "wall-e"],
    genres: ["animation", "anime"],
    label: "animated titles",
  },
];

function isTemporaryVerificationPlaylist(playlist: Playlist) {
  const name = playlist.name.toLowerCase();
  return (
    name.includes("codex vercel curl add test") ||
    name.includes("temporary production verification") ||
    name.includes("production verification playlist")
  );
}

function isDirectorPlaylist(playlist: Playlist) {
  return playlist.creatorHandle === "the-director" || playlist.creatorDisplayName === "The Director";
}

function rankPublicPlaylist(playlist: Playlist) {
  if (isDirectorPlaylist(playlist)) return 0;
  if (playlist.isFollowing) return 1;
  return 2;
}

function scorePlaylistSearch(playlist: Playlist, normalizedQuery: string) {
  const name = playlist.name.toLowerCase();
  const description = playlist.description.toLowerCase();
  const creatorDisplayName = (playlist.creatorDisplayName || "").toLowerCase();
  const creatorHandle = (playlist.creatorHandle || "").toLowerCase();
  const matchingTitle = playlist.movies.some((movie) =>
    [movie.title, movie.releaseYear || "", ...movie.genres].some((value) => value.toLowerCase().includes(normalizedQuery)),
  );
  if (name === normalizedQuery) return 0;
  if (name.startsWith(normalizedQuery)) return 1;
  if (name.includes(normalizedQuery)) return 2;
  if (description.includes(normalizedQuery)) return 3;
  if (creatorDisplayName.includes(normalizedQuery) || creatorHandle.includes(normalizedQuery)) return 4;
  if (matchingTitle) return 5;
  return 6;
}

function matchingCuratedSignal(normalizedQuery: string) {
  return curatedSearchSignals.find((signal) => signal.terms.some((term) => term.includes(normalizedQuery) || normalizedQuery.includes(term)));
}

function playlistSearchValues(playlist: Playlist) {
  return [
    playlist.name,
    playlist.description,
    playlist.visibility,
    playlist.creatorDisplayName || "",
    playlist.creatorHandle || "",
    ...playlist.movies.map((movie) => movie.title),
    ...playlist.movies.map((movie) => movie.overview || ""),
    ...playlist.movies.flatMap((movie) => movie.genres || []),
  ];
}

function playlistMatchesQuery(playlist: Playlist, normalizedQuery: string) {
  if (!normalizedQuery) return true;
  const directMatch = playlistSearchValues(playlist).some((value) => value.toLowerCase().includes(normalizedQuery));
  if (directMatch) return true;
  const signal = matchingCuratedSignal(normalizedQuery);
  if (!signal) return false;
  return playlist.movies.some((movie) => {
    const title = movie.title.toLowerCase();
    const genres = (movie.genres || []).map((genre) => genre.toLowerCase());
    return signal.titles.some((candidate) => title.includes(candidate)) || Boolean(signal.genres?.some((genre) => genres.includes(genre)));
  });
}

function normalizeSearchTerm(value: string) {
  return value.toLowerCase().replace(/&/g, "and").replace(/sci fi|science-fiction/g, "science fiction").trim();
}

function filterTerms(filters: PlaylistSearchFilters) {
  const terms = new Set<string>();
  if (filters.genre) {
    terms.add(normalizeSearchTerm(filters.genre));
    if (filters.genre === "Sci-Fi") terms.add("science fiction");
  }
  if (filters.mood) {
    moodSearchTerms[filters.mood]?.forEach((term) => terms.add(normalizeSearchTerm(term)));
  }
  return [...terms].filter(Boolean);
}

function movieSearchValues(movie: MovieSearchResult) {
  return [
    movie.title,
    movie.overview || "",
    movie.releaseYear || "",
    movie.mediaType === "tv" ? "tv" : "movie",
    ...movie.genreIds.map((id) => genreIdLabels[id] || ""),
  ].filter(Boolean);
}

function movieMatchesFilters(movie: MovieSearchResult, filters: PlaylistSearchFilters) {
  if (filters.content !== "both" && movie.mediaType !== filters.content) return false;
  const terms = filterTerms(filters);
  if (!terms.length) return true;
  const haystack = movieSearchValues(movie).map(normalizeSearchTerm).join(" ");
  return terms.some((term) => haystack.includes(term));
}

function playlistMatchesFilters(playlist: Playlist, filters: PlaylistSearchFilters) {
  if (filters.content !== "both" && !playlist.movies.some((movie) => (movie.mediaType || "movie") === filters.content)) return false;
  const terms = filterTerms(filters);
  if (!terms.length) return true;
  const haystack = playlistSearchValues(playlist).map(normalizeSearchTerm).join(" ");
  return terms.some((term) => haystack.includes(term));
}

function discoveryLinkMatchesFilters(result: DiscoveryCollectionResult | DiscoveryHubLink, filters: PlaylistSearchFilters) {
  const terms = filterTerms(filters);
  if (!terms.length) return true;
  const values =
    "slug" in result
      ? [result.title, result.overview || "", result.category || ""]
      : [result.title, result.description || "", result.kind, result.key];
  const haystack = values.map(normalizeSearchTerm).join(" ");
  return terms.some((term) => haystack.includes(term));
}

function actorMatchesFilters(actor: ActorSummary, filters: PlaylistSearchFilters) {
  const terms = filterTerms(filters);
  if (!terms.length) return true;
  const haystack = [actor.name, actor.knownForDepartment || "", ...(actor.knownFor || [])].map(normalizeSearchTerm).join(" ");
  return terms.some((term) => haystack.includes(term));
}

function recognizedPersonContext(discoveryResults: DiscoverySearchResults, query: string) {
  const normalizedQuery = normalizeSearchTerm(query);
  if (!normalizedQuery || normalizedQuery.length < 3) return null;
  return (
    discoveryResults.actors.find((actor) => {
      const actorName = normalizeSearchTerm(actor.name);
      return actorName === normalizedQuery || actorName.includes(normalizedQuery) || normalizedQuery.includes(actorName);
    }) || null
  );
}

function hasActiveSearchFilters(filters: PlaylistSearchFilters) {
  return filters.content !== "both" || Boolean(filters.genre) || Boolean(filters.mood);
}

function isExactTitleMatch(movie: MovieSearchResult, query: string) {
  return normalizeSearchTerm(movie.title) === normalizeSearchTerm(query);
}

function playlistMatchReason(playlist: Playlist, normalizedQuery: string) {
  if (!normalizedQuery) return playlist.recommendationReason;
  const lowerName = playlist.name.toLowerCase();
  const lowerDescription = playlist.description.toLowerCase();
  if (lowerName.includes(normalizedQuery)) return "Matches playlist title";
  if (lowerDescription.includes(normalizedQuery)) return "Matches playlist description";

  const genreMatch = playlist.movies.flatMap((movie) => movie.genres || []).find((genre) => genre.toLowerCase().includes(normalizedQuery));
  if (genreMatch) return `Matches ${genreMatch}`;

  const titleMatch = playlist.movies.find((movie) => movie.title.toLowerCase().includes(normalizedQuery));
  if (titleMatch) return `Includes ${titleMatch.title}`;

  const signal = matchingCuratedSignal(normalizedQuery);
  if (signal) {
    const titleMatches = playlist.movies.filter((movie) => {
      const title = movie.title.toLowerCase();
      return signal.titles.some((candidate) => title.includes(candidate));
    });
    if (titleMatches.length > 1) return `Includes ${titleMatches.length} ${signal.label}`;
    if (titleMatches[0]) return `Includes ${titleMatches[0].title}`;
    const genre = signal.genres?.find((candidate) => playlist.movies.some((movie) => (movie.genres || []).map((item) => item.toLowerCase()).includes(candidate)));
    if (genre) return `Matches ${genre.replace(/\b\w/g, (letter) => letter.toUpperCase())}`;
  }

  return playlist.recommendationReason;
}

function decorateSearchResults(playlists: Playlist[], normalizedQuery: string) {
  return playlists.map((playlist) => ({
    ...playlist,
    recommendationReason: playlistMatchReason(playlist, normalizedQuery),
  }));
}

function playlistTitleCount(playlist: Playlist) {
  return playlist.movieCount ?? playlist.movies.length;
}

function byFollowerCount(playlists: Playlist[]) {
  return [...playlists].sort((a, b) => {
    const followerDelta = (b.followerCount || 0) - (a.followerCount || 0);
    if (followerDelta !== 0) return followerDelta;
    const likeDelta = (b.likeCount || 0) - (a.likeCount || 0);
    if (likeDelta !== 0) return likeDelta;
    const titleDelta = playlistTitleCount(b) - playlistTitleCount(a);
    if (titleDelta !== 0) return titleDelta;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}

function byUpdated(playlists: Playlist[]) {
  return [...playlists].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

function playlistSignalScore(playlist: Playlist) {
  return (playlist.followerCount || 0) * 4 + (playlist.likeCount || 0) * 3 + playlistTitleCount(playlist);
}

function byTrending(playlists: Playlist[]) {
  return [...playlists].sort((a, b) => {
    const scoreDelta = playlistSignalScore(b) - playlistSignalScore(a);
    if (scoreDelta !== 0) return scoreDelta;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}

function recommendationReasonForPlaylist(playlist: Playlist) {
  if (playlist.recommendationReason) return playlist.recommendationReason;
  if (playlist.isFollowing) return "Because you follow this playlist.";
  if (isDirectorPlaylist(playlist)) return "Because The Director recommends it.";
  if ((playlist.followerCount || 0) > 0) return "Because Flim users are following this playlist.";
  if ((playlist.likeCount || 0) > 0) return "Because Flim users liked this playlist.";
  return playlist.movies[0]?.genres[0] ? `Because it curates ${playlist.movies[0].genres[0]} titles.` : "A public playlist discovery pick.";
}

function withRecommendationReasons(playlists: Playlist[]) {
  return playlists.map((playlist) => ({
    ...playlist,
    recommendationReason: recommendationReasonForPlaylist(playlist),
  }));
}

function excludePlaylists(playlists: Playlist[], excludedIds: Set<string>) {
  return playlists.filter((playlist) => !excludedIds.has(playlist.id));
}

function DiscoveryShelf({
  title,
  playlists,
  onNavigate,
  emptyMessage,
  initialVisible = 6,
}: {
  title: string;
  playlists: Playlist[];
  onNavigate: (path: string) => void;
  emptyMessage?: string;
  initialVisible?: number;
}) {
  const [visibleCount, setVisibleCount] = useState(initialVisible);
  useEffect(() => {
    setVisibleCount(initialVisible);
  }, [initialVisible, playlists, title]);

  if (playlists.length === 0) return null;
  const visiblePlaylists = playlists.slice(0, visibleCount);
  return (
    <section className="discovery-section">
      <div className="discovery-section-heading">
        <h2>{title}</h2>
      </div>
      <PlaylistGrid onNavigate={onNavigate} playlists={visiblePlaylists} emptyMessage={emptyMessage || "Public playlists will appear here."} />
      {playlists.length > visibleCount ? (
        <div className="load-more-row">
          <button className="secondary-button" onClick={() => setVisibleCount((count) => count + 6)} type="button">
            Load More
          </button>
        </div>
      ) : null}
    </section>
  );
}


const emptyDiscoveryResults: DiscoverySearchResults = {
  query: "",
  titles: [],
  playlists: [],
  profiles: [],
  collections: [],
  hubs: [],
  actors: [],
  titleSource: "empty",
};

function titleResultKey(movie: MovieSearchResult) {
  return `${movie.mediaType || "movie"}-${movie.tmdbId}`;
}

function playlistsContainingTitle(movie: MovieSearchResult, candidatePlaylists: Playlist[]) {
  return candidatePlaylists.filter((playlist) =>
    playlist.movies.some((item) => item.tmdbId === movie.tmdbId && (item.mediaType || "movie") === (movie.mediaType || "movie")),
  );
}

function preferredAddTargets(playlists: Playlist[]) {
  return playlists.filter((playlist) => (playlist.isOwner || playlist.saved || playlist.clonedFromId) && !playlist.isSystem);
}

function playlistPath(playlist: Playlist) {
  return playlist.visibility === "public" && playlist.publicSlug ? `/p/${playlist.publicSlug}` : `/playlists/${playlist.id}`;
}

function actorPath(actor: ActorSummary) {
  return `/actors/${actor.tmdbId}`;
}

function playlistResultRank(playlist: Playlist) {
  if (playlist.isOwner) return 0;
  if (playlist.saved || playlist.clonedFromId) return 1;
  if (playlist.isFollowing) return 2;
  if (isDirectorPlaylist(playlist)) return 3;
  return 4;
}

function sortedUniversalDiscoveryPlaylists(playlists: Playlist[]) {
  return [...playlists].sort((a, b) => {
    const rankDelta = playlistResultRank(a) - playlistResultRank(b);
    if (rankDelta !== 0) return rankDelta;
    const signalDelta = playlistSignalScore(b) - playlistSignalScore(a);
    if (signalDelta !== 0) return signalDelta;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}

function sortedDiscoveryPlaylists(view: PlaylistView, playlists: Playlist[]) {
  return [...playlists].sort((a, b) => {
    if (view === "public") {
      const rankDelta = rankPublicPlaylist(a) - rankPublicPlaylist(b);
      if (rankDelta !== 0) return rankDelta;
      return playlistSignalScore(b) - playlistSignalScore(a);
    }
    if (a.isOwner !== b.isOwner) return a.isOwner ? -1 : 1;
    if (a.isFollowing !== b.isFollowing) return a.isFollowing ? -1 : 1;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}

function titlePath(movie: MovieSearchResult) {
  return movie.mediaType === "tv" ? `/tv/${movie.tmdbId}` : `/movies/${movie.tmdbId}`;
}

function recommendationToSearchResult(movie: PlaylistMovie): MovieSearchResult {
  return {
    tmdbId: movie.tmdbId,
    mediaType: movie.mediaType || "movie",
    title: movie.title,
    releaseYear: movie.releaseYear,
    overview: movie.overview,
    posterPath: movie.posterPath,
    posterUrl: movie.posterUrl,
    genreIds: [],
  };
}

function uniqueTitleResults(movies: MovieSearchResult[]) {
  const seen = new Set<string>();
  return movies.filter((movie) => {
    const key = titleResultKey(movie);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniquePlaylists(playlists: Playlist[]) {
  const seen = new Set<string>();
  return playlists.filter((playlist) => {
    if (seen.has(playlist.id)) return false;
    seen.add(playlist.id);
    return true;
  });
}

function relatedPlaylistsForTitle(movie: MovieSearchResult, candidates: Playlist[]) {
  return candidates
    .filter((playlist) => playlist.movies.some((item) => item.tmdbId === movie.tmdbId && (item.mediaType || "movie") === (movie.mediaType || "movie")))
    .sort((a, b) => (b.followerCount || 0) - (a.followerCount || 0) || (b.movieCount || b.movies.length) - (a.movieCount || a.movies.length) || a.name.localeCompare(b.name))
    .slice(0, 6);
}

function fallbackSimilarTitles(movie: MovieSearchResult, titleRows: MovieSearchResult[]) {
  const sourceGenres = new Set(movie.genreIds || []);
  return titleRows
    .filter((candidate) => titleResultKey(candidate) !== titleResultKey(movie))
    .filter((candidate) => !sourceGenres.size || (candidate.genreIds || []).some((genreId) => sourceGenres.has(genreId)))
    .slice(0, 8);
}

function InlineDiscoveryShelf({
  addTargets,
  addToPlaylist,
  discovery,
  locallyAddedKeys,
  onAdded,
  onCreatePlaylist,
  onNavigate,
  personalPlaylists,
  sourceTitle,
}: {
  addTargets: Playlist[];
  addToPlaylist: (playlistId: string, movie: MovieSearchResult) => void | Promise<void>;
  discovery?: InlineDiscoveryState;
  locallyAddedKeys: Set<string>;
  onAdded: (movie: MovieSearchResult) => void;
  onCreatePlaylist: (input: Pick<Playlist, "name" | "description" | "visibility">) => Promise<Playlist>;
  onNavigate: (path: string) => void;
  personalPlaylists: Playlist[];
  sourceTitle: MovieSearchResult;
}) {
  if (!discovery || discovery.status === "loading") {
    return (
      <div className="playlist-inline-discovery-shelf" aria-label={`More like ${sourceTitle.title}`}>
        <div className="inline-discovery-heading">
          <h4>More like {sourceTitle.title}</h4>
          <span>Finding a few good next picks...</span>
        </div>
        <div className="inline-discovery-scroll">
          {[0, 1, 2].map((item) => <div className="inline-discovery-card is-loading" key={item} />)}
        </div>
      </div>
    );
  }

  if (discovery.status === "error" || (!discovery.similarTitles.length && !discovery.relatedPlaylists.length)) return null;

  return (
    <div className="playlist-inline-discovery-shelf" aria-label={`More like ${sourceTitle.title}`}>
      {discovery.similarTitles.length ? (
        <section>
          <div className="inline-discovery-heading">
            <h4>Similar Titles</h4>
            <span>Add another without leaving results</span>
          </div>
          <div className="inline-discovery-scroll">
            {discovery.similarTitles.map((movie) => {
              const savedIn = playlistsContainingTitle(movie, personalPlaylists);
              const isAdded = savedIn.length > 0 || locallyAddedKeys.has(titleResultKey(movie));
              return (
                <article className="inline-discovery-card" key={titleResultKey(movie)}>
                  <button className="inline-discovery-poster reset-button" onClick={() => onNavigate(titlePath(movie))} type="button">
                    {movie.posterUrl ? <img alt={`${movie.title} poster`} decoding="async" loading="lazy" src={movie.posterUrl} /> : <span />}
                  </button>
                  <div>
                    <strong>{movie.title}</strong>
                    <small>{movie.releaseYear || "Year TBA"} • {movie.mediaType === "tv" ? "TV Show" : "Movie"}</small>
                  </div>
                  {isAdded ? (
                    <span className="inline-added-pill">Added</span>
                  ) : (
                    <AddToPlaylistControl
                      addToPlaylist={addToPlaylist}
                      movie={movie}
                      onAdded={() => onAdded(movie)}
                      onCreatePlaylist={onCreatePlaylist}
                      openLabel="Add"
                      playlists={addTargets}
                    />
                  )}
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      {discovery.relatedPlaylists.length ? (
        <section>
          <div className="inline-discovery-heading">
            <h4>Related Playlists</h4>
            <span>Collections that already include this title</span>
          </div>
          <div className="inline-discovery-playlists">
            {discovery.relatedPlaylists.map((playlist) => (
              <button className="inline-discovery-playlist" key={playlist.id} onClick={() => onNavigate(playlistPath(playlist))} type="button">
                <strong>{playlist.name}</strong>
                <small>{playlist.movieCount || playlist.movies.length} titles</small>
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function UniversalTitleResult({
  movie,
  savedIn,
  addTargets,
  addToPlaylist,
  discovery,
  isDiscoveryOpen,
  locallyAddedKeys,
  onAdded,
  onCreatePlaylist,
  onNavigate,
  personalPlaylists,
}: {
  movie: MovieSearchResult;
  savedIn: Playlist[];
  addTargets: Playlist[];
  addToPlaylist: (playlistId: string, movie: MovieSearchResult) => void | Promise<void>;
  discovery?: InlineDiscoveryState;
  isDiscoveryOpen: boolean;
  locallyAddedKeys: Set<string>;
  onAdded: (movie: MovieSearchResult) => void;
  onCreatePlaylist: (input: Pick<Playlist, "name" | "description" | "visibility">) => Promise<Playlist>;
  onNavigate: (path: string) => void;
  personalPlaylists: Playlist[];
}) {
  const savedNames = savedIn.slice(0, 3).map((playlist) => playlist.name).join(", ");
  const localAdd = locallyAddedKeys.has(titleResultKey(movie));
  const isAdded = savedIn.length > 0 || localAdd;
  return (
    <div className="playlist-universal-title-result">
      <article className="playlist-universal-title-card">
        <button className="poster-card-button reset-button" onClick={() => onNavigate(titlePath(movie))} type="button">
          {movie.posterUrl ? <img alt={`${movie.title} poster`} className="poster-image" decoding="async" loading="lazy" src={movie.posterUrl} /> : <div className="poster tone-blue" />}
        </button>
        <div className="playlist-universal-title-body">
          <span className={isAdded ? "result-status-pill is-saved" : "result-status-pill"}>{isAdded ? "Added" : "Not Yet Saved"}</span>
          <h3>{movie.title}</h3>
          <div className="card-meta">
            <span>{movie.releaseYear || "Year TBA"}</span>
            <span>{movie.mediaType === "tv" ? "TV Show" : "Movie"}</span>
          </div>
          {savedIn.length ? <p className="playlist-result-reason">In: {savedNames}{savedIn.length > 3 ? ` +${savedIn.length - 3} more` : ""}</p> : localAdd ? <p className="playlist-result-reason">Added. Here are a few good next picks.</p> : <p className="playlist-result-reason">Add it to a playlist when you are ready.</p>}
          <div className="button-row">
            <button className="secondary-button" onClick={() => onNavigate(titlePath(movie))} type="button">Details</button>
            <AddToPlaylistControl
              addToPlaylist={addToPlaylist}
              movie={movie}
              onAdded={() => onAdded(movie)}
              onCreatePlaylist={onCreatePlaylist}
              openLabel={isAdded ? "Add to Another Playlist" : "Add to Playlist"}
              playlists={addTargets}
            />
          </div>
        </div>
      </article>
      {isDiscoveryOpen ? (
        <InlineDiscoveryShelf
          addTargets={addTargets}
          addToPlaylist={addToPlaylist}
          discovery={discovery}
          locallyAddedKeys={locallyAddedKeys}
          onAdded={onAdded}
          onCreatePlaylist={onCreatePlaylist}
          onNavigate={onNavigate}
          personalPlaylists={personalPlaylists}
          sourceTitle={movie}
        />
      ) : null}
    </div>
  );
}

function CompactDiscoveryLink({ title, meta, description, onClick }: { title: string; meta: string; description?: string; onClick: () => void }) {
  return (
    <button className="playlist-universal-link-card" onClick={onClick} type="button">
      <span>{meta}</span>
      <strong>{title}</strong>
      {description ? <small>{description}</small> : null}
    </button>
  );
}

function UniversalPlaylistSearchResults({
  addToPlaylist,
  activeTab,
  discoveryResults,
  filters,
  isFilterOpen,
  localPlaylistResults,
  onActiveTabChange,
  onCreatePlaylist,
  onFiltersChange,
  onFilterOpenChange,
  onNavigate,
  playlists,
  query,
  status,
  view,
}: {
  addToPlaylist: (playlistId: string, movie: MovieSearchResult) => void | Promise<void>;
  activeTab: SearchResultTab;
  discoveryResults: DiscoverySearchResults;
  filters: PlaylistSearchFilters;
  isFilterOpen: boolean;
  localPlaylistResults: Playlist[];
  onActiveTabChange: (tab: SearchResultTab) => void;
  onCreatePlaylist: (input: Pick<Playlist, "name" | "description" | "visibility">) => Promise<Playlist>;
  onFiltersChange: (filters: PlaylistSearchFilters) => void;
  onFilterOpenChange: (isOpen: boolean) => void;
  onNavigate: (path: string) => void;
  playlists: Playlist[];
  query: string;
  status: "idle" | "loading" | "done" | "error";
  view: PlaylistView;
}) {
  const [expandedDiscoveryKey, setExpandedDiscoveryKey] = useState<string | null>(null);
  const [inlineDiscoveryByTitle, setInlineDiscoveryByTitle] = useState<Record<string, InlineDiscoveryState>>({});
  const [locallyAddedTitleKeys, setLocallyAddedTitleKeys] = useState<string[]>([]);
  const addTargets = preferredAddTargets(playlists);
  const personalPlaylists = playlists.filter((playlist) => (playlist.isOwner || playlist.saved || playlist.clonedFromId) && !playlist.isSystem);
  const titleRows = discoveryResults.titles
    .filter((movie) => movieMatchesFilters(movie, filters))
    .map((movie) => ({ movie, savedIn: playlistsContainingTitle(movie, personalPlaylists) }));
  const locallyAddedKeys = useMemo(() => new Set(locallyAddedTitleKeys), [locallyAddedTitleKeys]);
  const savedTitleRows = titleRows.filter((row) => row.savedIn.length > 0);
  const mergedPlaylistMap = new Map<string, Playlist>();
  [...localPlaylistResults, ...discoveryResults.playlists].forEach((playlist) => mergedPlaylistMap.set(playlist.id, playlist));
  const playlistRows = sortedUniversalDiscoveryPlaylists([...mergedPlaylistMap.values()].filter((playlist) => playlistMatchesFilters(playlist, filters)));
  const yourRows = playlistRows.filter((playlist) => (playlist.isOwner || playlist.saved || playlist.clonedFromId) && !isDirectorPlaylist(playlist));
  const followedRows = playlistRows.filter((playlist) => playlist.isFollowing && !playlist.isOwner && !isDirectorPlaylist(playlist));
  const directorRows = playlistRows.filter(isDirectorPlaylist);
  const publicRows = playlistRows.filter((playlist) => !playlist.isOwner && !playlist.saved && !playlist.clonedFromId && !playlist.isFollowing && !isDirectorPlaylist(playlist));
  const collectionRows = discoveryResults.collections.filter((collection) => discoveryLinkMatchesFilters(collection, filters));
  const hubRows = discoveryResults.hubs.filter((hub) => discoveryLinkMatchesFilters(hub, filters));
  const actorRows = discoveryResults.actors.filter((actor) => actorMatchesFilters(actor, filters));
  const genreRows = hubRows.filter((hub) => hub.kind === "genre");
  const themeRows = hubRows.filter((hub) => hub.kind !== "genre");
  const recognizedPerson = recognizedPersonContext(discoveryResults, query);
  const hasPlaylistResults = playlistRows.length || collectionRows.length || hubRows.length;
  const hasTitleResults = titleRows.length;
  const hasActorResults = actorRows.length;
  const hasGenreResults = genreRows.length || themeRows.length || collectionRows.length;
  const hasResults = hasPlaylistResults || hasTitleResults || hasActorResults || hasGenreResults;
  const exactTitleFound = titleRows.some((row) => isExactTitleMatch(row.movie, query));

  useEffect(() => {
    setExpandedDiscoveryKey(null);
  }, [query, activeTab, view]);

  const updateFilters = (nextFilters: Partial<PlaylistSearchFilters>) => onFiltersChange({ ...filters, ...nextFilters });
  const clearFilters = () => onFiltersChange(defaultPlaylistSearchFilters);
  const handleTitleAdded = async (movie: MovieSearchResult) => {
    const key = titleResultKey(movie);
    setLocallyAddedTitleKeys((current) => [...new Set([...current, key])]);
    setExpandedDiscoveryKey(key);

    if (inlineDiscoveryByTitle[key]?.status === "ready") return;

    setInlineDiscoveryByTitle((current) => ({ ...current, [key]: { status: "loading", similarTitles: [], relatedPlaylists: [] } }));

    try {
      const response = await getRecommendations({ mediaType: movie.mediaType || "movie", tmdbId: movie.tmdbId });
      const fetchedTitles = uniqueTitleResults(response.recommendations.map(recommendationToSearchResult))
        .filter((candidate) => titleResultKey(candidate) !== key)
        .slice(0, 10);
      const similarTitles = fetchedTitles.length ? fetchedTitles : fallbackSimilarTitles(movie, titleRows.map((row) => row.movie));
      const relatedPlaylists = relatedPlaylistsForTitle(movie, uniquePlaylists([...(response.playlistRecommendations || []), ...localPlaylistResults, ...discoveryResults.playlists, ...playlists]));

      setInlineDiscoveryByTitle((current) => ({
        ...current,
        [key]: {
          status: "ready",
          similarTitles,
          relatedPlaylists,
        },
      }));
    } catch {
      setInlineDiscoveryByTitle((current) => ({ ...current, [key]: { status: "error", similarTitles: [], relatedPlaylists: [] } }));
    }
  };

  const renderTitleResult = ({ movie, savedIn }: { movie: MovieSearchResult; savedIn: Playlist[] }) => (
    <UniversalTitleResult
      addTargets={addTargets}
      addToPlaylist={addToPlaylist}
      discovery={inlineDiscoveryByTitle[titleResultKey(movie)]}
      isDiscoveryOpen={expandedDiscoveryKey === titleResultKey(movie)}
      key={titleResultKey(movie)}
      locallyAddedKeys={locallyAddedKeys}
      movie={movie}
      onAdded={handleTitleAdded}
      onCreatePlaylist={onCreatePlaylist}
      onNavigate={onNavigate}
      personalPlaylists={personalPlaylists}
      savedIn={savedIn}
    />
  );

  const renderFilterPanel = () =>
    isFilterOpen ? (
      <div className="playlist-filter-panel">
        <div className="playlist-filter-group">
          <span>Content</span>
          <div className="playlist-filter-options">
            {(["both", "movie", "tv"] as SearchContentFilter[]).map((content) => (
              <button className={`playlist-filter-pill${filters.content === content ? " is-active" : ""}`} key={content} onClick={() => updateFilters({ content })} type="button">
                {content === "both" ? "Both" : content === "movie" ? "Movies" : "TV"}
              </button>
            ))}
          </div>
        </div>
        <div className="playlist-filter-group">
          <span>Genre</span>
          <div className="playlist-filter-options">
            {playlistSearchGenres.map((genre) => (
              <button className={`playlist-filter-pill${filters.genre === genre ? " is-active" : ""}`} key={genre} onClick={() => updateFilters({ genre: filters.genre === genre ? "" : genre })} type="button">
                {genre}
              </button>
            ))}
          </div>
        </div>
        <div className="playlist-filter-group">
          <span>Mood / Theme</span>
          <div className="playlist-filter-options">
            {playlistSearchMoods.map((mood) => (
              <button className={`playlist-filter-pill${filters.mood === mood ? " is-active" : ""}`} key={mood} onClick={() => updateFilters({ mood: filters.mood === mood ? "" : mood })} type="button">
                {mood}
              </button>
            ))}
          </div>
        </div>
        {hasActiveSearchFilters(filters) ? (
          <button className="playlist-filter-clear" onClick={clearFilters} type="button">
            Clear Filters
          </button>
        ) : null}
      </div>
    ) : null;

  const renderSearchShell = (children: ReactNode) => (
    <div className="playlist-universal-results">
      <div className="playlist-search-toolbar">
        <div className="playlist-result-tabs" role="tablist" aria-label="Search result type">
          {searchResultTabs.map((tab) => (
            <button
              aria-selected={activeTab === tab.id}
              className={`playlist-result-tab${activeTab === tab.id ? " is-active" : ""}`}
              key={tab.id}
              onClick={() => onActiveTabChange(tab.id)}
              role="tab"
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>
        <button className={`playlist-filter-toggle${isFilterOpen ? " is-active" : ""}`} onClick={() => onFilterOpenChange(!isFilterOpen)} type="button">
          Filter
        </button>
      </div>
      {renderFilterPanel()}
      {recognizedPerson ? (
        <div className="playlist-search-context-row">
          <strong>{recognizedPerson.name}</strong>
          <span>{recognizedPerson.knownForDepartment || "Actor"}</span>
        </div>
      ) : null}
      <div className="playlist-active-filters" aria-label="Active filters">
        {recognizedPerson ? <span className="playlist-active-chip">Person: {recognizedPerson.name}</span> : null}
        {filters.content !== "both" ? (
          <button className="playlist-active-chip" onClick={() => updateFilters({ content: "both" })} type="button">
            {filters.content === "movie" ? "Movies" : "TV"} x
          </button>
        ) : null}
        {filters.genre ? (
          <button className="playlist-active-chip" onClick={() => updateFilters({ genre: "" })} type="button">
            Genre: {filters.genre} x
          </button>
        ) : null}
        {filters.mood ? (
          <button className="playlist-active-chip" onClick={() => updateFilters({ mood: "" })} type="button">
            Mood: {filters.mood} x
          </button>
        ) : null}
      </div>
      {exactTitleFound ? <p className="playlist-exact-title-note">Exact title match found in Titles.</p> : null}
      {children}
    </div>
  );

  if (status === "loading") {
    return renderSearchShell(<p className="playlist-universal-status">Searching for {query}...</p>);
  }

  if (status === "error") {
    return renderSearchShell(<p className="empty-state">Search could not finish right now. Try again shortly.</p>);
  }

  if (!hasResults) {
    return renderSearchShell(<p className="empty-state">No matches found for {query}. Try a title, actor, genre, or playlist idea.</p>);
  }

  if (activeTab === "titles") {
    return renderSearchShell(
      <>
        {view === "my" && savedTitleRows.length ? (
          <section className="discovery-section">
            <div className="discovery-section-heading"><h2>In Your Playlists</h2></div>
            <div className="playlist-universal-title-list">
              {savedTitleRows.map(renderTitleResult)}
            </div>
          </section>
        ) : null}
        {titleRows.filter((row) => view !== "my" || row.savedIn.length === 0).length ? (
          <section className="discovery-section">
            <div className="discovery-section-heading"><h2>{view === "my" ? "Not Yet Saved" : "Title Results"}</h2></div>
            <div className="playlist-universal-title-list">
              {titleRows
                .filter((row) => view !== "my" || row.savedIn.length === 0)
                .slice(0, 14)
                .map(renderTitleResult)}
            </div>
          </section>
        ) : null}
        {!hasTitleResults ? <p className="playlist-universal-empty">No title matches for this search yet.</p> : null}
      </>,
    );
  }

  if (activeTab === "actors") {
    return renderSearchShell(
      <section className="discovery-section">
        <div className="discovery-section-heading"><h2>Actors</h2></div>
        {actorRows.length ? (
          <div className="playlist-actor-result-grid">
            {actorRows.slice(0, 18).map((actor) => (
              <button className="playlist-actor-result-card" key={actor.tmdbId} onClick={() => onNavigate(actorPath(actor))} type="button">
                {actor.profileUrl ? <img alt="" src={actor.profileUrl} loading="lazy" decoding="async" /> : <span aria-hidden="true">{actor.name.slice(0, 1)}</span>}
                <strong>{actor.name}</strong>
                <small>{actor.knownForDepartment || "Actor"}</small>
                {actor.knownFor?.length ? <em>{actor.knownFor.slice(0, 3).join(", ")}</em> : null}
              </button>
            ))}
          </div>
        ) : (
          <p className="playlist-universal-empty">No actor matches for this search yet.</p>
        )}
      </section>,
    );
  }

  if (activeTab === "genre") {
    return renderSearchShell(
      <section className="discovery-section">
        <div className="discovery-section-heading"><h2>Genres & Themes</h2></div>
        {hasGenreResults ? (
          <div className="playlist-universal-link-grid">
            {genreRows.map((hub: DiscoveryHubLink) => <CompactDiscoveryLink key={`${hub.kind}-${hub.key}`} title={hub.title} meta="Genre" description={hub.description} onClick={() => onNavigate(hub.path)} />)}
            {themeRows.map((hub: DiscoveryHubLink) => <CompactDiscoveryLink key={`${hub.kind}-${hub.key}`} title={hub.title} meta={hub.kind === "decade" ? "Era" : "Theme"} description={hub.description} onClick={() => onNavigate(hub.path)} />)}
            {collectionRows.map((collection) => <CompactDiscoveryLink key={collection.slug} title={collection.title} meta="Collection" description={collection.overview || `${collection.titleCount} titles`} onClick={() => onNavigate(`/collection/${collection.slug}`)} />)}
          </div>
        ) : (
          <p className="playlist-universal-empty">No genre or theme matches for this search yet.</p>
        )}
      </section>,
    );
  }

  return renderSearchShell(
    <>
      <DiscoveryShelf title="Your Playlists" playlists={yourRows} onNavigate={onNavigate} emptyMessage="No saved playlist matches yet." />
      <DiscoveryShelf title="Followed Playlists" playlists={followedRows} onNavigate={onNavigate} emptyMessage="No followed playlist matches yet." />
      <DiscoveryShelf title="Director's Cut" playlists={directorRows} onNavigate={onNavigate} emptyMessage="No curated collections matched." />
      <DiscoveryShelf title="Public Playlists" playlists={publicRows} onNavigate={onNavigate} emptyMessage="No public playlists matched." />
      {(collectionRows.length || hubRows.length) ? (
        <section className="discovery-section">
          <div className="discovery-section-heading"><h2>Collections & Themes</h2></div>
          <div className="playlist-universal-link-grid">
            {collectionRows.map((collection) => <CompactDiscoveryLink key={collection.slug} title={collection.title} meta="Director's Cut" description={collection.overview || `${collection.titleCount} titles`} onClick={() => onNavigate(`/collection/${collection.slug}`)} />)}
            {hubRows.map((hub: DiscoveryHubLink) => <CompactDiscoveryLink key={`${hub.kind}-${hub.key}`} title={hub.title} meta={hub.kind === "genre" ? "Genre" : hub.kind === "decade" ? "Decade" : "Theme"} description={hub.description} onClick={() => onNavigate(hub.path)} />)}
          </div>
        </section>
      ) : null}
      {!hasPlaylistResults ? <p className="playlist-universal-empty">No playlist matches yet. Titles may still have results.</p> : null}
    </>,
  );
}

function PublicDiscovery({
  onNavigate,
  playlists,
  query,
  searchResults,
  visibleCount,
  onLoadMore,
}: {
  onNavigate: (path: string) => void;
  playlists: Playlist[];
  query: string;
  searchResults: Playlist[];
  visibleCount: number;
  onLoadMore: () => void;
}) {
  const normalizedQuery = query.trim().toLowerCase();
  const followedPlaylists = playlists.filter((playlist) => playlist.isFollowing);
  const flimPicks = playlists.filter(isDirectorPlaylist);
  const userPlaylists = playlists.filter((playlist) => !isDirectorPlaylist(playlist));
  const recommendedPlaylists = withRecommendationReasons(byTrending(playlists));
  const trendingPlaylists = byTrending(userPlaylists);
  const trendingPreviewIds = new Set(trendingPlaylists.slice(0, 6).map((playlist) => playlist.id));
  const featuredPlaylists = byUpdated(excludePlaylists(userPlaylists, trendingPreviewIds));
  const publicPlaylistResults = byFollowerCount(userPlaylists);
  const playlistSearchResults = searchResults;
  const visibleSearchResults = playlistSearchResults.slice(0, visibleCount);
  const hasMoreSearchResults = playlistSearchResults.length > visibleCount;

  if (normalizedQuery) {
    return (
      <div className="discovery-grid">
        <DiscoveryShelf title="Director's Cut Results" playlists={visibleSearchResults.filter(isDirectorPlaylist)} onNavigate={onNavigate} emptyMessage="No matching curated playlists yet." />
        <DiscoveryShelf title="Public Playlist Results" playlists={visibleSearchResults.filter((playlist) => !isDirectorPlaylist(playlist))} onNavigate={onNavigate} emptyMessage="No matching playlists yet." />
        {hasMoreSearchResults ? (
          <div className="load-more-row">
            <button className="secondary-button" onClick={onLoadMore} type="button">
              Load More
            </button>
          </div>
        ) : null}
        {playlistSearchResults.length === 0 ? (
          <p className="empty-state">No playlist matches yet. Try a title, genre, or playlist name.</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="discovery-grid">
      <DiscoveryShelf title="Followed Playlists" playlists={followedPlaylists} onNavigate={onNavigate} />
      <DiscoveryRecommendationShelf fallbackPlaylists={recommendedPlaylists} includeCurators={false} onNavigate={onNavigate} />
      <DiscoveryShelf title="Trending Playlists" playlists={trendingPlaylists} onNavigate={onNavigate} />
      <DiscoveryShelf title="Director's Cut" playlists={flimPicks} onNavigate={onNavigate} />
      <DiscoveryShelf title="Featured Playlists" playlists={featuredPlaylists} onNavigate={onNavigate} />
      <DiscoveryShelf title="Public Playlists" playlists={publicPlaylistResults} onNavigate={onNavigate} />
      {playlists.length === 0 ? (
        <p className="empty-state">Public playlists will appear here.</p>
      ) : null}
    </div>
  );
}

export function Playlists({
  onNavigate,
  playlists,
  rewindPlaylists,
  onCreatePlaylist,
  addToPlaylist,
  onOpenRoulette,
  currentUser,
  notice,
  initialView = "my",
  playlistLoadStatus = "ready",
  playlistLoadMessage = "",
}: PlaylistsProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<Playlist["visibility"]>("private");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<PlaylistView>(initialView);
  const [showCreate, setShowCreate] = useState(false);
  const [visibleCount, setVisibleCount] = useState(7);
  const [discoveryResults, setDiscoveryResults] = useState<DiscoverySearchResults>(emptyDiscoveryResults);
  const [discoveryStatus, setDiscoveryStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [searchTab, setSearchTab] = useState<SearchResultTab>("playlists");
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [searchFilters, setSearchFilters] = useState<PlaylistSearchFilters>(defaultPlaylistSearchFilters);
  const [rouletteGate, setRouletteGate] = useState<"auth" | "empty" | null>(null);
  const rouletteGateRef = useRef<HTMLDivElement | null>(null);
  const heroSearchRef = useRef<HTMLInputElement | null>(null);
  const directorPlaylists = useMemo(
    () => playlists.filter(isDirectorPlaylist),
    [playlists],
  );
  const ownedPlaylists = useMemo(
    () => playlists.filter((playlist) => playlist.isOwner && !playlist.isSystem),
    [playlists],
  );
  const followedPlaylists = useMemo(
    () => playlists.filter((playlist) => playlist.isFollowing && !playlist.isOwner && !playlist.isSystem),
    [playlists],
  );
  const sourcePlaylists = useMemo(() => {
    if (view !== "public") {
      return playlists
        .filter((playlist) => (playlist.isOwner || playlist.saved || playlist.clonedFromId) && !playlist.isSystem)
        .sort((a, b) => {
          if (a.isOwner !== b.isOwner) return a.isOwner ? -1 : 1;
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        });
    }

    return playlists
      .filter((playlist) => playlist.visibility === "public" && !playlist.isSystem && !isTemporaryVerificationPlaylist(playlist))
      .sort((a, b) => {
        const rankDelta = rankPublicPlaylist(a) - rankPublicPlaylist(b);
        if (rankDelta !== 0) return rankDelta;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
  }, [playlists, view]);

  useEffect(() => {
    setView(initialView);
    setVisibleCount(7);
    const params = new URLSearchParams(window.location.search);
    setQuery(initialView === "public" ? params.get("q") || "" : "");
  }, [initialView]);

  useEffect(() => {
    setVisibleCount(7);
    setSearchTab("playlists");
    setIsFilterOpen(false);
  }, [query, view]);

  useEffect(() => {
    if (!currentUser) {
      setShowCreate(false);
    }
  }, [currentUser]);

  const normalizedQuery = query.trim();

  useEffect(() => {
    if (!normalizedQuery) {
      setDiscoveryResults(emptyDiscoveryResults);
      setDiscoveryStatus("idle");
      return;
    }

    const controller = new AbortController();
    setDiscoveryStatus("loading");
    const timer = window.setTimeout(() => {
      searchDiscovery(normalizedQuery, { signal: controller.signal })
        .then((results) => {
          setDiscoveryResults(results);
          setDiscoveryStatus("done");
        })
        .catch((error) => {
          if ((error as Error).name === "AbortError") return;
          setDiscoveryStatus("error");
        });
    }, 240);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [normalizedQuery]);

  const visiblePlaylists = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return sourcePlaylists;
    return decorateSearchResults(
      sourcePlaylists.filter((playlist) => playlistMatchesQuery(playlist, normalizedQuery)),
      normalizedQuery,
    )
      .sort((a, b) => {
        if (view === "public" && isDirectorPlaylist(a) !== isDirectorPlaylist(b)) return isDirectorPlaylist(a) ? -1 : 1;
        const scoreDelta = scorePlaylistSearch(a, normalizedQuery) - scorePlaylistSearch(b, normalizedQuery);
        if (scoreDelta !== 0) return scoreDelta;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
  }, [query, sourcePlaylists, view]);

  const universalPlaylistResults = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return [];
    return decorateSearchResults(
      playlists.filter((playlist) => !playlist.isSystem && !isTemporaryVerificationPlaylist(playlist) && playlistMatchesQuery(playlist, normalizedQuery)),
      normalizedQuery,
    ).sort((a, b) => {
      const rankDelta = playlistResultRank(a) - playlistResultRank(b);
      if (rankDelta !== 0) return rankDelta;
      const scoreDelta = scorePlaylistSearch(a, normalizedQuery) - scorePlaylistSearch(b, normalizedQuery);
      if (scoreDelta !== 0) return scoreDelta;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }, [playlists, query]);

  const visiblePagePlaylists = visiblePlaylists.slice(0, visibleCount);
  const hasMorePlaylists = visiblePlaylists.length > visibleCount;
  const isLoadingPlaylists = playlistLoadStatus === "loading";
  const playlistLoadFailed = playlistLoadStatus === "error";
  const rouletteTitleCount = useMemo(
    () => sourcePlaylists.reduce((count, playlist) => count + playlist.movies.length, 0),
    [sourcePlaylists],
  );

  useEffect(() => {
    if (!rouletteGate) return;
    const firstButton = rouletteGateRef.current?.querySelector<HTMLButtonElement>("button");
    firstButton?.focus();
  }, [rouletteGate]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentUser) {
      onNavigate("/signin");
      return;
    }
    setIsSaving(true);
    setError("");
    try {
      const created = await onCreatePlaylist({ name, description, visibility });
      setName("");
      setDescription("");
      setVisibility("private");
      setShowCreate(false);
      onNavigate(`/playlists/${created.id}`);
    } catch {
      setError("Could not create playlist right now. Please try again shortly.");
    } finally {
      setIsSaving(false);
    }
  }

  function requestCreatePlaylist() {
    if (!currentUser) {
      onNavigate("/signup");
      return;
    }
    setShowCreate((current) => !current);
  }

  function openRouletteFromCard() {
    if (!currentUser) {
      setRouletteGate("auth");
      return;
    }
    if (rouletteTitleCount === 0) {
      setRouletteGate("empty");
      return;
    }
    onOpenRoulette?.(sourcePlaylists);
  }

  function handleRouletteGateKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      setRouletteGate(null);
      return;
    }
    if (event.key !== "Tab") return;

    const focusable = Array.from(
      rouletteGateRef.current?.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ) || [],
    ).filter((element) => !element.hasAttribute("disabled"));
    if (!focusable.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function focusHeroSearch() {
    setRouletteGate(null);
    heroSearchRef.current?.focus();
  }

  const ownedPreview = ownedPlaylists.slice(0, visibleCount);
  const universalResultCount = universalPlaylistResults.length + discoveryResults.titles.length + discoveryResults.playlists.length + discoveryResults.collections.length + discoveryResults.hubs.length + discoveryResults.actors.length;
  const searchStatusLabel = normalizedQuery
    ? universalResultCount > 0 || discoveryStatus === "loading"
      ? discoveryStatus === "loading"
        ? `Searching for ${normalizedQuery}...`
        : `${universalResultCount} results for ${normalizedQuery}`
      : `No matches found for ${normalizedQuery}`
    : "";

  return (
    <section className="route-page collections-page">
      {notice ? <p className="success-message">{notice}</p> : null}
      {error ? <p className="error-message">{error}</p> : null}

      <section className={`playlist-landing-hero playlist-landing-hero-${view}`} aria-label={view === "public" ? "Public Playlists" : "My Playlists"}>
        <link
          rel="preload"
          as="image"
          href={view === "public" ? "/playlist-heroes/public-playlists-hero-mobile.webp" : "/playlist-heroes/my-playlists-hero-mobile.webp"}
          media="(max-width: 767px)"
        />
        <link
          rel="preload"
          as="image"
          href={view === "public" ? "/playlist-heroes/public-playlists-hero.webp" : "/playlist-heroes/my-playlists-hero.webp"}
          media="(min-width: 768px)"
        />
        <picture className="playlist-landing-hero-picture" aria-hidden="true">
          <source
            media="(max-width: 767px)"
            srcSet={view === "public" ? "/playlist-heroes/public-playlists-hero-mobile.webp" : "/playlist-heroes/my-playlists-hero-mobile.webp"}
            type="image/webp"
          />
          <source
            media="(min-width: 768px)"
            srcSet={view === "public" ? "/playlist-heroes/public-playlists-hero.webp" : "/playlist-heroes/my-playlists-hero.webp"}
            type="image/webp"
          />
          <img
            alt=""
            decoding="async"
            fetchPriority="high"
            loading="eager"
            src={view === "public" ? "/playlist-heroes/public-playlists-hero.png" : "/playlist-heroes/my-playlists-hero.png"}
          />
        </picture>
        <div className="playlist-landing-hero-content">
          <h1>{view === "public" ? "Public Playlists" : "My Playlists"}</h1>
          <p>
            {view === "public"
              ? "Discover curated movie and TV collections."
              : "Organize, discover, and revisit your collections."}
          </p>
          <label
            aria-label={view === "public" ? "Search movies, shows, actors, genres, or public playlists" : "Search movies, shows, actors, genres, or playlists"}
            className="collection-search playlist-title-search playlist-hero-search"
          >
            <input ref={heroSearchRef} onChange={(event) => setQuery(event.target.value)} placeholder={view === "public" ? "Search movies, shows, actors, genres, or public playlists" : "Search movies, shows, actors, genres, or playlists"} type="search" value={query} />
          </label>
          {searchStatusLabel ? <p className="playlist-search-state" aria-live="polite">{searchStatusLabel}</p> : null}
        </div>
      </section>

      <button className="playlist-roulette-hero-card" onClick={openRouletteFromCard} type="button" aria-label="Spin to pick what to watch tonight">
        <span className="playlist-roulette-mark" aria-hidden="true">
          <img alt="" src="/brand/flim-icon-mark-source.png" decoding="async" loading="eager" />
        </span>
        <span className="playlist-roulette-hero-copy">
          <strong>What Are We Watching Tonight?</strong>
          <small>Can&apos;t decide?</small>
          <small>Let Flim pick for you.</small>
        </span>
        <span className="playlist-roulette-spin-label">SPIN</span>
      </button>

      {view === "my" ? (
        <div className="playlist-page-actions">
          <button className="primary-button" onClick={requestCreatePlaylist} type="button">
            {!currentUser ? "Create Free Account" : showCreate ? "Close" : "Create Playlist"}
          </button>
        </div>
      ) : null}

      {showCreate ? (
        <form className="collection-create-panel" onSubmit={submit}>
          {!currentUser ? <p className="helper-text">Sign in to create playlists that belong to you.</p> : null}
          <label>
            <span>Playlist name</span>
            <input onChange={(event) => setName(event.target.value)} placeholder="Movie night" required value={name} />
          </label>
          <label>
            <span>Description</span>
            <textarea onChange={(event) => setDescription(event.target.value)} placeholder="A few words for the playlist" value={description} />
          </label>
          <div className="visibility-picker">
            <span className="visibility-picker-label">Visibility</span>
            <div className="visibility-options" role="radiogroup" aria-label="Playlist visibility">
              {PLAYLIST_VISIBILITY_OPTIONS.map((option) => (
                <button
                  aria-pressed={visibility === option.value}
                  className={`visibility-option ${visibility === option.value ? "active" : ""}`}
                  key={option.value}
                  onClick={() => setVisibility(option.value)}
                  type="button"
                >
                  <strong>{option.label}</strong>
                  <small>{option.helper}</small>
                </button>
              ))}
            </div>
            <p className="helper-text">{PLAYLIST_VISIBILITY_HELP[visibility]}</p>
          </div>
          <button className="primary-button" disabled={isSaving} type="submit">
            {isSaving ? "Creating..." : "Create Playlist"}
          </button>
        </form>
      ) : null}

      {rouletteGate ? (
        <div
          className="playlist-roulette-gate-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setRouletteGate(null);
          }}
          role="presentation"
        >
          <div
            aria-labelledby="playlist-roulette-gate-title"
            aria-modal="true"
            className="playlist-roulette-gate"
            onKeyDown={handleRouletteGateKeyDown}
            ref={rouletteGateRef}
            role="dialog"
          >
            <button className="playlist-roulette-gate-close" onClick={() => setRouletteGate(null)} type="button" aria-label="Close">
              X
            </button>
            <span className="playlist-roulette-gate-mark" aria-hidden="true">
              <img alt="" src="/brand/flim-icon-mark-source.png" decoding="async" loading="eager" />
            </span>
            {rouletteGate === "auth" ? (
              <>
                <h2 id="playlist-roulette-gate-title">Build your movie night first</h2>
                <p>Add movies to your playlists, then Flim can pick from the things you actually want to watch.</p>
                <div className="playlist-roulette-gate-actions">
                  <button className="primary-button" onClick={() => onNavigate("/signup")} type="button">
                    Create Free Account
                  </button>
                  <button className="secondary-button" onClick={() => onNavigate("/signin")} type="button">
                    Sign In
                  </button>
                  <button className="text-button" onClick={() => setRouletteGate(null)} type="button">
                    Maybe Later
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 id="playlist-roulette-gate-title">Nothing to spin yet</h2>
                <p>Add a few movies to your playlists and come back when you&apos;re ready to let Flim choose.</p>
                <div className="playlist-roulette-gate-actions">
                  <button className="primary-button" onClick={view === "public" ? focusHeroSearch : () => onNavigate("/public")} type="button">
                    Add Movies
                  </button>
                  <button className="text-button" onClick={() => setRouletteGate(null)} type="button">
                    Maybe Later
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}

      {playlistLoadFailed && !normalizedQuery ? (
        <p className="error-message playlist-section-message">{playlistLoadMessage || "Could not load playlists right now. Please try again shortly."}</p>
      ) : null}

      {normalizedQuery ? (
        <UniversalPlaylistSearchResults
          addToPlaylist={addToPlaylist}
          activeTab={searchTab}
          discoveryResults={discoveryResults}
          filters={searchFilters}
          isFilterOpen={isFilterOpen}
          localPlaylistResults={universalPlaylistResults}
          onActiveTabChange={setSearchTab}
          onCreatePlaylist={onCreatePlaylist}
          onFiltersChange={setSearchFilters}
          onFilterOpenChange={setIsFilterOpen}
          onNavigate={onNavigate}
          playlists={playlists}
          query={normalizedQuery}
          status={discoveryStatus}
          view={view}
        />
      ) : isLoadingPlaylists ? (
        <section className="discovery-section playlist-loading-section" aria-busy="true">
          <div className="discovery-section-heading">
            <h2>{view === "public" ? "Public Playlists" : "Your Playlists"}</h2>
          </div>
          <div className="playlist-loading-grid" aria-label="Loading playlist previews">
            {Array.from({ length: 6 }).map((_, index) => (
              <span className="playlist-loading-card" key={index} />
            ))}
          </div>
        </section>
      ) : view === "public" ? (
        <PublicDiscovery
          onNavigate={onNavigate}
          playlists={sourcePlaylists}
          query={query}
          searchResults={visiblePlaylists}
          visibleCount={visibleCount}
          onLoadMore={() => setVisibleCount((count) => count + 7)}
        />
      ) : sourcePlaylists.length > 0 ? (
        <>
          {ownedPreview.length > 0 ? (
            <section className="discovery-section">
              <div className="discovery-section-heading">
                <h2>Your Playlists</h2>
              </div>
              <PlaylistGrid onNavigate={onNavigate} playlists={ownedPreview} />
            </section>
          ) : null}
          {currentUser ? <ContinueWatchingRow includeFollowedFallback onNavigate={onNavigate} /> : null}
          {sourcePlaylists.length > visibleCount ? (
            <div className="load-more-row">
              <button className="secondary-button" onClick={() => setVisibleCount((count) => count + 7)} type="button">
                Load More
              </button>
            </div>
          ) : null}
        </>
      ) : (
        <div className="collection-empty-cinematic">
          <div className="empty-poster-wall" aria-hidden="true">
            {landingPosterSeeds.slice(0, 6).map((poster) => (
              <img
                alt=""
                className="empty-poster-art"
                decoding="async"
                key={`${poster.mediaType}-${poster.title}`}
                loading="lazy"
                src={poster.posterUrl}
              />
            ))}
          </div>
          <div>
            <h2>Create Your First Playlist</h2>
            <button className="primary-button" onClick={requestCreatePlaylist} type="button">
              {currentUser ? "Create Playlist" : "Create Free Account"}
            </button>
          </div>
        </div>
      )}

      {view === "my" && currentUser ? (
        <section className="followed-titles-playlist-link" aria-label="Followed titles">
          <div>
            <span>Release tracking</span>
            <h2>My Followed Titles</h2>
            <p>See the movies and shows you are tracking for release and streaming updates.</p>
          </div>
          <button className="secondary-button" onClick={() => onNavigate("/followed-titles")} type="button">
            View Followed Titles
          </button>
        </section>
      ) : null}

      {view === "my" && directorPlaylists.length > 0 ? (
        <section className="director-cut-section director-cut-secondary" aria-label="Director's Cut">
          <div className="director-cut-header">
            <div>
              <h2>Curated by The Director</h2>
            </div>
            <button className="secondary-button" onClick={() => onNavigate("/@the-director")} type="button">
              Meet The Director
            </button>
          </div>
          <PlaylistGrid onNavigate={onNavigate} playlists={directorPlaylists.slice(0, 6)} />
        </section>
      ) : null}

      {view === "my" && rewindPlaylists.length > 0 ? (
        <section className="rewind-section">
          <div className="playlist-shelf-heading">
            <div>
              <h2>Rewind</h2>
            </div>
          </div>
          <PlaylistGrid onNavigate={onNavigate} playlists={rewindPlaylists} />
        </section>
      ) : null}
    </section>
  );
}
