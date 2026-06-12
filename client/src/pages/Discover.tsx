import { useEffect, useMemo, useState, type FormEvent } from "react";
import { DiscoveryRecommendationShelf } from "../components/DiscoveryRecommendationShelf";
import { FlimAvatar } from "../components/FlimAvatar";
import { PlaylistGrid } from "../components/PlaylistGrid";
import { searchDiscovery } from "../services/discoveryService";
import { getCurrentProfile } from "../services/profileService";
import { getProviderAvailabilityForTitle, normalizeStreamingRegion } from "../services/watchProviderService";
import type { DiscoveryCollectionResult, DiscoveryHubLink, DiscoverySearchResults, MovieSearchResult } from "../types";

interface DiscoverProps {
  onNavigate: (path: string) => void;
}

const starterSearches = ["Anime", "Horror", "Sci-Fi", "Christmas Movies", "Marvel", "Pixar"];
const browseGenres: DiscoveryHubLink[] = [
  { kind: "genre", key: "sci-fi", title: "Sci-Fi", path: "/genre/sci-fi" },
  { kind: "genre", key: "horror", title: "Horror", path: "/genre/horror" },
  { kind: "genre", key: "fantasy", title: "Fantasy", path: "/genre/fantasy" },
  { kind: "genre", key: "thriller", title: "Thriller", path: "/genre/thriller" },
  { kind: "genre", key: "comedy", title: "Comedy", path: "/genre/comedy" },
  { kind: "genre", key: "action", title: "Action", path: "/genre/action" },
  { kind: "genre", key: "family", title: "Family", path: "/genre/family" },
  { kind: "genre", key: "drama", title: "Drama", path: "/genre/drama" },
];
const browseDecades: DiscoveryHubLink[] = ["1970s", "1980s", "1990s", "2000s", "2010s", "2020s"].map((title) => ({
  kind: "decade",
  key: title.toLowerCase(),
  title,
  path: `/decade/${title.toLowerCase()}`,
}));
const browseFranchises: DiscoveryHubLink[] = [
  { kind: "franchise", key: "star-wars", title: "Star Wars", path: "/franchise/star-wars" },
  { kind: "franchise", key: "marvel", title: "Marvel", path: "/franchise/marvel" },
  { kind: "franchise", key: "back-to-the-future", title: "Back to the Future", path: "/franchise/back-to-the-future" },
  { kind: "franchise", key: "jurassic-park", title: "Jurassic Park", path: "/franchise/jurassic-park" },
  { kind: "franchise", key: "lord-of-the-rings", title: "Lord of the Rings", path: "/franchise/lord-of-the-rings" },
  { kind: "franchise", key: "mission-impossible", title: "Mission: Impossible", path: "/franchise/mission-impossible" },
  { kind: "franchise", key: "harry-potter", title: "Harry Potter", path: "/franchise/harry-potter" },
  { kind: "franchise", key: "pixar", title: "Pixar", path: "/franchise/pixar" },
];

function titlePath(title: MovieSearchResult) {
  return title.mediaType === "tv" ? `/tv/${title.tmdbId}` : `/movies/${title.tmdbId}`;
}

function titleTypeLabel(title: MovieSearchResult) {
  return title.mediaType === "tv" ? "TV Show" : "Movie";
}

function titleCountLabel(collection: DiscoveryCollectionResult) {
  if (collection.titleCount > 0) return `${collection.titleCount} title${collection.titleCount === 1 ? "" : "s"}`;
  if (collection.movieCount > 0) return `${collection.movieCount} movie${collection.movieCount === 1 ? "" : "s"}`;
  return "Collection";
}

function TitleRow({
  titles,
  emptyMessage,
  onNavigate,
  availabilityMatches = {},
}: {
  titles: MovieSearchResult[];
  emptyMessage: string;
  onNavigate: (path: string) => void;
  availabilityMatches?: Record<string, string[]>;
}) {
  if (titles.length === 0) return <p className="empty-state">{emptyMessage}</p>;

  return (
    <div className="discovery-title-row">
      {titles.map((title) => (
        <article className="discovery-title-card" key={`${title.mediaType}-${title.tmdbId}`}>
          <button className="reset-button" onClick={() => onNavigate(titlePath(title))} type="button">
            {title.posterUrl ? <img alt={`${title.title} poster`} decoding="async" loading="lazy" src={title.posterUrl} /> : <span className="discovery-poster-placeholder" />}
            <strong>{title.title}</strong>
            <small>{title.releaseYear || "Year"} / {titleTypeLabel(title)}</small>
            {availabilityMatches[`${title.mediaType || "movie"}-${title.tmdbId}`]?.length ? (
              <small>On {availabilityMatches[`${title.mediaType || "movie"}-${title.tmdbId}`].slice(0, 2).join(", ")}</small>
            ) : null}
          </button>
        </article>
      ))}
    </div>
  );
}

function CollectionResultGrid({ collections, onNavigate }: { collections: DiscoveryCollectionResult[]; onNavigate: (path: string) => void }) {
  if (collections.length === 0) return <p className="empty-state">No matching collections yet.</p>;

  return (
    <div className="collection-discovery-row discovery-collection-results">
      {collections.map((collection) => (
        <button className="collection-discovery-card" key={collection.slug} onClick={() => onNavigate(`/collection/${collection.slug}`)} type="button">
          {collection.posterUrl ? <img alt={`${collection.title} poster`} decoding="async" loading="lazy" src={collection.posterUrl} /> : <span className="actor-credit-placeholder" />}
          <strong>{collection.title}</strong>
          <small>{collection.category || "Flim collection"} / {titleCountLabel(collection)}</small>
        </button>
      ))}
    </div>
  );
}

function HubGrid({ hubs, onNavigate }: { hubs: DiscoveryHubLink[]; onNavigate: (path: string) => void }) {
  if (hubs.length === 0) return <p className="empty-state">No matching discovery hubs yet.</p>;

  return (
    <div className="discovery-browse-grid">
      {hubs.map((hub) => (
        <button className="discovery-browse-card" key={`${hub.kind}-${hub.key}`} onClick={() => onNavigate(hub.path)} type="button">
          <span>{hub.kind === "genre" ? "Genre" : hub.kind === "decade" ? "Decade" : "Franchise"}</span>
          <strong>{hub.title}</strong>
          {hub.description ? <small>{hub.description}</small> : null}
        </button>
      ))}
    </div>
  );
}

export function Discover({ onNavigate }: DiscoverProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DiscoverySearchResults | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [message, setMessage] = useState("");
  const [availableOnMyServices, setAvailableOnMyServices] = useState(false);
  const [availabilityMatches, setAvailabilityMatches] = useState<Record<string, string[]>>({});
  const [availabilityStatus, setAvailabilityStatus] = useState("");
  const [profilePreferences, setProfilePreferences] = useState<{ providers: string[]; region: string }>({ providers: [], region: "CA" });

  const hasResults = useMemo(
    () => Boolean(results && (
      results.playlists.length > 0 ||
      results.profiles.length > 0 ||
      results.collections.length > 0 ||
      results.hubs.length > 0 ||
      results.titles.length > 0 ||
      results.actors.length > 0
    )),
    [results],
  );
  const movieResults = useMemo(() => (results?.titles || []).filter((title) => title.mediaType !== "tv"), [results]);
  const tvResults = useMemo(() => (results?.titles || []).filter((title) => title.mediaType === "tv"), [results]);

  useEffect(() => {
    let active = true;
    getCurrentProfile()
      .then((profile) => {
        if (!active) return;
        setProfilePreferences({
          providers: profile.preferredProviders || [],
          region: normalizeStreamingRegion(profile.streamingRegion || profile.countryCode || "CA"),
        });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  function titleKey(title: MovieSearchResult) {
    return `${title.mediaType || "movie"}-${title.tmdbId}`;
  }

  async function prioritizeAvailableTitles(payload: DiscoverySearchResults) {
    if (!availableOnMyServices) {
      setAvailabilityMatches({});
      setAvailabilityStatus("");
      return payload;
    }

    if (profilePreferences.providers.length === 0) {
      setAvailabilityStatus("Choose your services in Settings to prioritize watchable title results.");
      return payload;
    }

    if (payload.availabilityPrioritized && payload.availabilityMatches) {
      setAvailabilityMatches(payload.availabilityMatches);
      setAvailabilityStatus(
        Object.keys(payload.availabilityMatches).length
          ? "Titles with cached availability on your services are shown first."
          : "No cached matches found on your selected services yet. Showing all results.",
      );
      return payload;
    }

    setAvailabilityStatus("Checking title availability on your services...");
    const limited = (payload.titles || []).slice(0, 10);
    const checked = await Promise.allSettled(
      limited.map(async (title) => {
        const availability = await getProviderAvailabilityForTitle(title, profilePreferences.region);
        const matches = availability.links
          .filter((link) => link.availabilityKnown && profilePreferences.providers.includes(link.provider.id))
          .map((link) => link.provider.name);
        return { key: titleKey(title), matches };
      }),
    );
    const matchMap: Record<string, string[]> = {};
    checked.forEach((result) => {
      if (result.status === "fulfilled" && result.value.matches.length > 0) {
        matchMap[result.value.key] = result.value.matches;
      }
    });
    setAvailabilityMatches(matchMap);
    setAvailabilityStatus(Object.keys(matchMap).length ? "Titles on your services are shown first." : "No title matches found on your selected services yet. Showing all results.");
    return {
      ...payload,
      titles: [...(payload.titles || [])].sort((a, b) => Number(Boolean(matchMap[titleKey(b)])) - Number(Boolean(matchMap[titleKey(a)]))),
    };
  }

  async function submit(event?: FormEvent<HTMLFormElement>, nextQuery = query) {
    event?.preventDefault();
    const cleanQuery = nextQuery.trim();
    if (!cleanQuery) return;

    setQuery(cleanQuery);
    setStatus("loading");
    setMessage("");
    try {
      setResults(await prioritizeAvailableTitles(await searchDiscovery(cleanQuery, {
        availableOnMyServices,
        providers: profilePreferences.providers,
        region: profilePreferences.region,
      })));
      setStatus("ready");
    } catch {
      setStatus("error");
      setMessage("Discovery search is unavailable right now.");
    }
  }

  return (
    <section className="route-page discover-page">
      <section className="discover-hero">
        <div>
          <h1>Discover</h1>
          <p>Search playlists first, then collections, curators, movies, and TV shows.</p>
          <button className="secondary-button discover-hero-link" onClick={() => onNavigate("/public")} type="button">
            Browse Public Playlists
          </button>
        </div>
        <form className="discover-search-form" onSubmit={submit}>
          <label>
            <span>Search Flim</span>
            <input
              autoComplete="off"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Try Anime, Horror, Sci-Fi, Marvel..."
              type="search"
              value={query}
            />
          </label>
          <button className="primary-button" disabled={!query.trim() || status === "loading"} type="submit">
            {status === "loading" ? "Searching..." : "Search"}
          </button>
          <label className="checkbox-row search-provider-filter">
            <input
              checked={availableOnMyServices}
              onChange={(event) => setAvailableOnMyServices(event.target.checked)}
              type="checkbox"
            />
            Available on my services
          </label>
        </form>
        <div className="discovery-chip-row" aria-label="Suggested searches">
          {starterSearches.map((item) => (
            <button key={item} onClick={() => submit(undefined, item)} type="button">
              {item}
            </button>
          ))}
        </div>
      </section>

      {message ? <p className="error-message">{message}</p> : null}
      {availabilityStatus ? <p className="helper-text">{availabilityStatus}</p> : null}

      {!results ? <DiscoveryRecommendationShelf onNavigate={onNavigate} /> : null}

      {results ? (
        <div className="discovery-results-stack">
          <section className="discovery-results-section">
            <div className="discovery-results-heading">
              <h2>Playlists</h2>
              <span>{results.playlists.length} found</span>
            </div>
            <PlaylistGrid onNavigate={onNavigate} playlists={results.playlists} emptyMessage="No matching public playlists yet." />
          </section>

          <section className="discovery-results-section">
            <div className="discovery-results-heading">
              <h2>Collections</h2>
              <span>{results.collections.length} found</span>
            </div>
            <CollectionResultGrid collections={results.collections} onNavigate={onNavigate} />
          </section>

          <section className="discovery-results-section">
            <div className="discovery-results-heading">
              <h2>Discovery Hubs</h2>
              <span>{results.hubs.length} found</span>
            </div>
            <HubGrid hubs={results.hubs} onNavigate={onNavigate} />
          </section>

          <section className="discovery-results-section">
            <div className="discovery-results-heading">
              <h2>Curators</h2>
              <span>{results.profiles.length} found</span>
            </div>
            {results.profiles.length > 0 ? (
              <div className="curator-result-grid">
                {results.profiles.map((profile) => (
                  <button className="curator-result-card" key={profile.handle} onClick={() => onNavigate(`/@${profile.handle}`)} type="button">
                    <FlimAvatar avatarKey={profile.avatarKey} label={profile.displayName} size="sm" />
                    <strong>{profile.displayName}</strong>
                    <small>@{profile.handle}</small>
                    {profile.bio ? <p>{profile.bio}</p> : null}
                    <span>
                      {profile.playlistCount} public playlist{profile.playlistCount === 1 ? "" : "s"} / {profile.followerCount || 0} follower{profile.followerCount === 1 ? "" : "s"}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="empty-state">No matching curators yet.</p>
            )}
          </section>

          <section className="discovery-results-section">
            <div className="discovery-results-heading">
              <h2>Movies</h2>
              <span>{movieResults.length} found</span>
            </div>
            <TitleRow titles={movieResults} emptyMessage="No matching movies yet." onNavigate={onNavigate} availabilityMatches={availabilityMatches} />
          </section>

          <section className="discovery-results-section">
            <div className="discovery-results-heading">
              <h2>TV Shows</h2>
              <span>{tvResults.length} found</span>
            </div>
            <TitleRow titles={tvResults} emptyMessage="No matching TV shows yet." onNavigate={onNavigate} availabilityMatches={availabilityMatches} />
          </section>

          <section className="discovery-results-section">
            <div className="discovery-results-heading">
              <h2>Actors</h2>
              <span>{results.actors.length} found</span>
            </div>
            {results.actors.length > 0 ? (
              <div className="actor-result-grid">
                {results.actors.map((actor) => (
                  <button className="actor-result-card" key={actor.tmdbId} onClick={() => onNavigate(`/actor/${actor.tmdbId}`)} type="button">
                    {actor.profileUrl ? <img alt={`${actor.name} profile`} decoding="async" loading="lazy" src={actor.profileUrl} /> : <span className="cast-avatar-fallback">{actor.name.slice(0, 1)}</span>}
                    <strong>{actor.name}</strong>
                    {actor.knownForDepartment ? <small>{actor.knownForDepartment}</small> : null}
                    {actor.knownFor?.length ? <span>{actor.knownFor.join(", ")}</span> : null}
                  </button>
                ))}
              </div>
            ) : (
              <p className="empty-state">No matching actors yet.</p>
            )}
          </section>
        </div>
      ) : (
        <>
          <section className="discovery-results-section">
            <div className="discovery-results-heading">
              <h2>Browse by Genre</h2>
            </div>
            <HubGrid hubs={browseGenres} onNavigate={onNavigate} />
          </section>
          <section className="discovery-results-section">
            <div className="discovery-results-heading">
              <h2>Browse by Decade</h2>
            </div>
            <HubGrid hubs={browseDecades} onNavigate={onNavigate} />
          </section>
          <section className="discovery-results-section">
            <div className="discovery-results-heading">
              <h2>Browse by Franchise</h2>
            </div>
            <HubGrid hubs={browseFranchises} onNavigate={onNavigate} />
          </section>
          <section className="discovery-empty-panel">
            <h2>Find what is worth watching.</h2>
            <p>Start with a playlist, collection, mood, genre, title, or curator.</p>
          </section>
        </>
      )}

      {results && !hasResults ? (
        <section className="discovery-empty-panel">
          <h2>No matches yet.</h2>
          <p>Try a broader playlist theme like anime, horror, sci-fi, Christmas, Marvel, or Pixar.</p>
        </section>
      ) : null}
    </section>
  );
}
