import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ContinueWatchingRow } from "../components/ContinueWatchingRow";
import { DiscoveryRecommendationShelf } from "../components/DiscoveryRecommendationShelf";
import { PlaylistGrid } from "../components/PlaylistGrid";
import { NowPlayingTicketIcon } from "../components/RouletteAssets";
import { landingPosterSeeds } from "../data/landingPosterSeeds";
import type { CurrentUser, Playlist } from "../types";

interface PlaylistsProps {
  onNavigate: (path: string) => void;
  playlists: Playlist[];
  rewindPlaylists: Playlist[];
  onCreatePlaylist: (input: Pick<Playlist, "name" | "description" | "visibility">) => Promise<Playlist>;
  onOpenRoulette?: (playlists?: Playlist[]) => void;
  currentUser: CurrentUser | null;
  notice?: string;
  initialView?: PlaylistView;
}

type PlaylistView = "my" | "public";

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

function byFollowerCount(playlists: Playlist[]) {
  return [...playlists].sort((a, b) => {
    const followerDelta = (b.followerCount || 0) - (a.followerCount || 0);
    if (followerDelta !== 0) return followerDelta;
    const likeDelta = (b.likeCount || 0) - (a.likeCount || 0);
    if (likeDelta !== 0) return likeDelta;
    const titleDelta = b.movies.length - a.movies.length;
    if (titleDelta !== 0) return titleDelta;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}

function byUpdated(playlists: Playlist[]) {
  return [...playlists].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

function playlistSignalScore(playlist: Playlist) {
  return (playlist.followerCount || 0) * 4 + (playlist.likeCount || 0) * 3 + playlist.movies.length;
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

export function Playlists({ onNavigate, playlists, rewindPlaylists, onCreatePlaylist, onOpenRoulette, currentUser, notice, initialView = "my" }: PlaylistsProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<Playlist["visibility"]>("private");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<PlaylistView>(initialView);
  const [showCreate, setShowCreate] = useState(false);
  const [visibleCount, setVisibleCount] = useState(7);
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
  }, [query, view]);

  useEffect(() => {
    if (!currentUser) {
      setShowCreate(false);
    }
  }, [currentUser]);

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

  const visiblePagePlaylists = visiblePlaylists.slice(0, visibleCount);
  const hasMorePlaylists = visiblePlaylists.length > visibleCount;

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

  function searchPublicPlaylists() {
    const search = query.trim();
    onNavigate(search ? `/public?q=${encodeURIComponent(search)}` : "/public");
  }

  const normalizedQuery = query.trim();
  const ownedPreview = ownedPlaylists.slice(0, visibleCount);
  const searchStatusLabel = normalizedQuery
    ? visiblePlaylists.length > 0
      ? `${visiblePlaylists.length} ${visiblePlaylists.length === 1 ? "result" : "results"} for ${normalizedQuery}`
      : `No matches found for ${normalizedQuery}`
    : view === "public"
      ? "Browse curated and community playlist discovery."
      : "Search your saved playlist world.";

  return (
    <section className="route-page collections-page">
      {notice ? <p className="success-message">{notice}</p> : null}
      {error ? <p className="error-message">{error}</p> : null}

      <section className={`playlist-landing-hero playlist-landing-hero-${view}`} aria-label={view === "public" ? "Public Playlists" : "My Playlists"}>
        <picture className="playlist-landing-hero-picture" aria-hidden="true">
          <img
            alt=""
            decoding="async"
            src={view === "public" ? "/playlist-heroes/public-playlists-hero.png" : "/playlist-heroes/my-playlists-hero.png"}
          />
        </picture>
        <div className="playlist-landing-hero-content">
          <h1>{view === "public" ? "Public Playlists" : "My Playlists"}</h1>
          <p>
            {view === "public"
              ? "Discover collections created by movie fans."
              : "Organize, discover, and revisit your collections."}
          </p>
          <label className="collection-search playlist-title-search playlist-hero-search">
            <span>{view === "public" ? "Search Public Playlists" : "Search Playlists"}</span>
            <input onChange={(event) => setQuery(event.target.value)} placeholder="Search playlists, titles, actors, or genres" type="search" value={query} />
          </label>
          <p className="playlist-search-state" aria-live="polite">{searchStatusLabel}</p>
        </div>
      </section>

      {view === "my" ? (
        <div className="playlist-page-actions">
          <button className="primary-button" onClick={requestCreatePlaylist} type="button">
            {!currentUser ? "Create Account" : showCreate ? "Close" : "Create Playlist"}
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
          <label>
            <span>Visibility</span>
            <select onChange={(event) => setVisibility(event.target.value as Playlist["visibility"])} value={visibility}>
              <option value="private">private</option>
              <option value="shared">shared</option>
              <option value="public">public</option>
            </select>
          </label>
          <button className="primary-button" disabled={isSaving} type="submit">
            {isSaving ? "Creating..." : "Create Playlist"}
          </button>
        </form>
      ) : null}

      {view === "public" ? (
        <>
          <PublicDiscovery
            onNavigate={onNavigate}
            playlists={sourcePlaylists}
            query={query}
            searchResults={visiblePlaylists}
            visibleCount={visibleCount}
            onLoadMore={() => setVisibleCount((count) => count + 7)}
          />
          <section className="playlist-roulette-launcher playlist-roulette-compact" aria-label="Movie roulette">
            <div className="playlist-roulette-icon" aria-hidden="true">
              <NowPlayingTicketIcon />
            </div>
            <div>
              <span>Movie Roulette</span>
              <h2>Can't decide what to watch?</h2>
              <p>Spin across public playlists and curator collections.</p>
            </div>
            <button className="secondary-button" onClick={() => onOpenRoulette?.(sourcePlaylists)} type="button">
              Spin
            </button>
          </section>
        </>
      ) : normalizedQuery ? (
        <>
          <section className="discovery-section">
            <div className="discovery-section-heading">
              <h2>My Playlist Results</h2>
            </div>
            <PlaylistGrid onNavigate={onNavigate} playlists={visiblePagePlaylists} emptyMessage="No matching playlists yet." />
          </section>
          {hasMorePlaylists ? (
            <div className="load-more-row">
              <button className="secondary-button" onClick={() => setVisibleCount((count) => count + 7)} type="button">
                Load More
              </button>
            </div>
          ) : null}
          {visiblePagePlaylists.length === 0 ? (
            <section className="playlist-public-search-prompt" aria-label="Search Public Playlists">
              <div>
                <span>Not seeing what you're looking for?</span>
                <h2>Search across Public Playlists</h2>
                <p>Look for curated and community collections that match this search.</p>
              </div>
              <button className="secondary-button" onClick={searchPublicPlaylists} type="button">
                Search Public Playlists
              </button>
            </section>
          ) : null}
        </>
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
              {currentUser ? "Create Playlist" : "Create Account"}
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

      {view === "my" && sourcePlaylists.length > 0 ? (
        <section className="playlist-roulette-launcher playlist-roulette-compact" aria-label="Movie roulette">
          <div className="playlist-roulette-icon" aria-hidden="true">
            <NowPlayingTicketIcon />
          </div>
          <div>
            <span>Movie Roulette</span>
            <h2>Can't decide what to watch?</h2>
            <p>Spin across your playlists when movie night needs a nudge.</p>
          </div>
          <button className="secondary-button" onClick={() => onOpenRoulette?.(sourcePlaylists)} type="button">
            Spin
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
