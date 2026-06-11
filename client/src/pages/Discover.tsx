import { useMemo, useState, type FormEvent } from "react";
import { DiscoveryRecommendationShelf } from "../components/DiscoveryRecommendationShelf";
import { PlaylistGrid } from "../components/PlaylistGrid";
import { searchDiscovery } from "../services/discoveryService";
import type { DiscoveryCollectionResult, DiscoverySearchResults, MovieSearchResult } from "../types";

interface DiscoverProps {
  onNavigate: (path: string) => void;
}

const starterSearches = ["Anime", "Horror", "Sci-Fi", "Christmas Movies", "Marvel", "Pixar"];

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

function TitleRow({ titles, emptyMessage, onNavigate }: { titles: MovieSearchResult[]; emptyMessage: string; onNavigate: (path: string) => void }) {
  if (titles.length === 0) return <p className="empty-state">{emptyMessage}</p>;

  return (
    <div className="discovery-title-row">
      {titles.map((title) => (
        <article className="discovery-title-card" key={`${title.mediaType}-${title.tmdbId}`}>
          <button className="reset-button" onClick={() => onNavigate(titlePath(title))} type="button">
            {title.posterUrl ? <img alt={`${title.title} poster`} src={title.posterUrl} /> : <span className="discovery-poster-placeholder" />}
            <strong>{title.title}</strong>
            <small>{title.releaseYear || "Year"} / {titleTypeLabel(title)}</small>
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
          {collection.posterUrl ? <img alt={`${collection.title} poster`} src={collection.posterUrl} /> : <span className="actor-credit-placeholder" />}
          <strong>{collection.title}</strong>
          <small>{collection.category || "Flim collection"} / {titleCountLabel(collection)}</small>
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

  const hasResults = useMemo(
    () => Boolean(results && (
      results.playlists.length > 0 ||
      results.profiles.length > 0 ||
      results.collections.length > 0 ||
      results.titles.length > 0 ||
      results.actors.length > 0
    )),
    [results],
  );
  const movieResults = useMemo(() => (results?.titles || []).filter((title) => title.mediaType !== "tv"), [results]);
  const tvResults = useMemo(() => (results?.titles || []).filter((title) => title.mediaType === "tv"), [results]);

  async function submit(event?: FormEvent<HTMLFormElement>, nextQuery = query) {
    event?.preventDefault();
    const cleanQuery = nextQuery.trim();
    if (!cleanQuery) return;

    setQuery(cleanQuery);
    setStatus("loading");
    setMessage("");
    try {
      setResults(await searchDiscovery(cleanQuery));
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
          <p>Search playlists, curators, collections, movies, and TV shows.</p>
          <button className="secondary-button discover-hero-link" onClick={() => onNavigate("/curators")} type="button">
            Browse Curators
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
              <h2>Curators</h2>
              <span>{results.profiles.length} found</span>
            </div>
            {results.profiles.length > 0 ? (
              <div className="curator-result-grid">
                {results.profiles.map((profile) => (
                  <button className="curator-result-card" key={profile.handle} onClick={() => onNavigate(`/@${profile.handle}`)} type="button">
                    {profile.profileImageUrl ? (
                      <img className="curator-avatar curator-avatar-image" alt={`${profile.displayName} profile`} src={profile.profileImageUrl} />
                    ) : (
                      <span className="curator-avatar">{profile.displayName.slice(0, 1).toUpperCase()}</span>
                    )}
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
              <h2>Collections</h2>
              <span>{results.collections.length} found</span>
            </div>
            <CollectionResultGrid collections={results.collections} onNavigate={onNavigate} />
          </section>

          <section className="discovery-results-section">
            <div className="discovery-results-heading">
              <h2>Movies</h2>
              <span>{movieResults.length} found</span>
            </div>
            <TitleRow titles={movieResults} emptyMessage="No matching movies yet." onNavigate={onNavigate} />
          </section>

          <section className="discovery-results-section">
            <div className="discovery-results-heading">
              <h2>TV Shows</h2>
              <span>{tvResults.length} found</span>
            </div>
            <TitleRow titles={tvResults} emptyMessage="No matching TV shows yet." onNavigate={onNavigate} />
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
                    {actor.profileUrl ? <img alt={`${actor.name} profile`} src={actor.profileUrl} /> : <span className="cast-avatar-fallback">{actor.name.slice(0, 1)}</span>}
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
        <section className="discovery-empty-panel">
          <h2>Find what is worth watching.</h2>
          <p>Start with a playlist, mood, genre, collection, title, or curator.</p>
        </section>
      )}

      {results && !hasResults ? (
        <section className="discovery-empty-panel">
          <h2>No matches yet.</h2>
          <p>Try a broader search like anime, horror, sci-fi, Christmas, Marvel, Pixar, or a favorite curator.</p>
        </section>
      ) : null}
    </section>
  );
}
