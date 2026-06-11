import { useEffect, useMemo, useState } from "react";
import { PlaylistGrid } from "../components/PlaylistGrid";
import { getActorDetails } from "../services/actorService";
import { addMovieToPlaylist, createPlaylist, getPlaylists } from "../services/apiPlaylistStore";
import type { ActorCredit, ActorDetails, MovieSearchResult, Playlist } from "../types";

interface ActorDetailsPageProps {
  actorId: number;
  onNavigate: (path: string) => void;
}

function creditPath(credit: ActorCredit) {
  return credit.mediaType === "tv" ? `/tv/${credit.tmdbId}` : `/movies/${credit.tmdbId}`;
}

function yearLabel(credit: ActorCredit) {
  return credit.releaseYear || "Year";
}

function creditKey(credit: ActorCredit) {
  return `${credit.mediaType}-${credit.tmdbId}`;
}

function creditToMovieSearchResult(credit: ActorCredit): MovieSearchResult {
  return {
    tmdbId: credit.tmdbId,
    mediaType: credit.mediaType,
    title: credit.title,
    releaseYear: credit.releaseYear,
    overview: "",
    posterUrl: credit.posterUrl,
    genreIds: [],
  };
}

function CreditShelf({
  title,
  credits,
  onNavigate,
  onQuickAdd,
  quickAddState,
}: {
  title: string;
  credits: ActorCredit[];
  onNavigate: (path: string) => void;
  onQuickAdd?: (credit: ActorCredit) => void;
  quickAddState?: (credit: ActorCredit) => "idle" | "saving" | "added" | "error" | "signin";
}) {
  if (credits.length === 0) return null;

  return (
    <section className="actor-section">
      <div className="actor-section-heading">
        <h2>{title}</h2>
        <span>{credits.length}</span>
      </div>
      <div className="actor-credit-row">
        {credits.map((credit) => (
          <article className="actor-credit-card" key={`${credit.mediaType}-${credit.tmdbId}-${credit.character || ""}`}>
            <button className="reset-button actor-credit-main" onClick={() => onNavigate(creditPath(credit))} type="button">
              {credit.posterUrl ? <img alt={`${credit.title} poster`} src={credit.posterUrl} /> : <span className="actor-credit-placeholder" />}
              <strong>{credit.title}</strong>
              <small>{yearLabel(credit)} / {credit.mediaType === "tv" ? "TV" : "Movie"}</small>
              {credit.character ? <span>{credit.character}</span> : null}
            </button>
            {onQuickAdd ? (
              <button
                className={quickAddState?.(credit) === "added" ? "actor-quick-add-button is-added" : "actor-quick-add-button"}
                disabled={quickAddState?.(credit) === "saving" || quickAddState?.(credit) === "added"}
                onClick={() => onQuickAdd(credit)}
                type="button"
              >
                {quickAddState?.(credit) === "saving"
                  ? "Adding..."
                  : quickAddState?.(credit) === "added"
                    ? "Added"
                    : quickAddState?.(credit) === "signin"
                      ? "Sign in to add"
                      : quickAddState?.(credit) === "error"
                        ? "Try again"
                        : "Quick Add"}
              </button>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

export function ActorDetailsPage({ actorId, onNavigate }: ActorDetailsPageProps) {
  const [actor, setActor] = useState<ActorDetails | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("");
  const [watchlist, setWatchlist] = useState<Playlist | null>(null);
  const [watchlistKeys, setWatchlistKeys] = useState<Set<string>>(new Set());
  const [quickAddStatus, setQuickAddStatus] = useState<Record<string, "idle" | "saving" | "added" | "error" | "signin">>({});

  useEffect(() => {
    let mounted = true;
    setStatus("loading");
    setMessage("");
    setActor(null);

    getActorDetails(actorId)
      .then((result) => {
        if (!mounted) return;
        setActor(result);
        setStatus("ready");
      })
      .catch(() => {
        if (!mounted) return;
        setStatus("error");
        setMessage("Actor details are unavailable right now.");
      });

    return () => {
      mounted = false;
    };
  }, [actorId]);

  useEffect(() => {
    let mounted = true;

    getPlaylists()
      .then((playlists) => {
        if (!mounted) return;
        const target = playlists.find((playlist) => playlist.isOwner && playlist.name.trim().toLowerCase() === "movies to watch") || null;
        setWatchlist(target);
        setWatchlistKeys(new Set((target?.movies || []).map((movie) => `${movie.mediaType || "movie"}-${movie.tmdbId}`)));
      })
      .catch(() => {
        if (!mounted) return;
        setWatchlist(null);
        setWatchlistKeys(new Set());
      });

    return () => {
      mounted = false;
    };
  }, []);

  const knownForText = useMemo(() => actor?.knownFor?.filter(Boolean).join(", "), [actor]);
  const biography = actor?.biography?.trim();

  function getQuickAddState(credit: ActorCredit) {
    const key = creditKey(credit);
    if (watchlistKeys.has(key)) return "added";
    return quickAddStatus[key] || "idle";
  }

  async function quickAddToWatchlist(credit: ActorCredit) {
    const key = creditKey(credit);
    if (watchlistKeys.has(key) || quickAddStatus[key] === "saving") return;

    setQuickAddStatus((current) => ({ ...current, [key]: "saving" }));

    try {
      const target = watchlist || await createPlaylist({
        name: "Movies to Watch",
        description: "Titles saved from actor pages.",
        visibility: "private",
      });
      setWatchlist(target);
      await addMovieToPlaylist(target.id, creditToMovieSearchResult(credit));
      setWatchlistKeys((current) => new Set([...current, key]));
      setQuickAddStatus((current) => ({ ...current, [key]: "added" }));
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : "";
      setQuickAddStatus((current) => ({ ...current, [key]: message.includes("sign in") ? "signin" : "error" }));
    }
  }

  if (status === "loading") {
    return (
      <section className="route-page actor-page">
        <p className="empty-state">Loading actor details...</p>
      </section>
    );
  }

  if (!actor) {
    return (
      <section className="route-page actor-page">
        <p className="error-message">{message || "Actor details unavailable."}</p>
      </section>
    );
  }

  return (
    <section className="route-page actor-page">
      <section className="actor-hero">
        {actor.profileUrl ? <img className="actor-profile-photo" alt={`${actor.name} profile`} src={actor.profileUrl} /> : <div className="actor-profile-photo actor-profile-placeholder">{actor.name.slice(0, 1)}</div>}
        <div className="actor-hero-copy">
          <h1>{actor.name}</h1>
          <div className="meta-row">
            {actor.birthYear ? <span>Born {actor.birthYear}</span> : null}
            {actor.knownForDepartment ? <span>{actor.knownForDepartment}</span> : null}
            {actor.popularity ? <span>Popularity {Math.round(actor.popularity)}</span> : null}
          </div>
          {knownForText ? <p className="actor-known-for">Known for {knownForText}</p> : null}
          {biography ? <p>{biography.length > 720 ? `${biography.slice(0, 720).trim()}...` : biography}</p> : <p>Biography is not available yet.</p>}
        </div>
      </section>

      <CreditShelf title="Movies" credits={actor.movieCredits || []} onNavigate={onNavigate} onQuickAdd={quickAddToWatchlist} quickAddState={getQuickAddState} />
      <CreditShelf title="TV Shows" credits={actor.tvCredits || []} onNavigate={onNavigate} />

      <section className="actor-section">
        <div className="actor-section-heading">
          <h2>Featured In Playlists</h2>
          <span>{actor.featuredPlaylists?.length || 0}</span>
        </div>
        <PlaylistGrid playlists={actor.featuredPlaylists || []} onNavigate={onNavigate} emptyMessage="No public playlists featuring this actor yet." />
      </section>

      {actor.relatedActors?.length ? (
        <section className="actor-section">
          <div className="actor-section-heading">
            <h2>Frequently Appears With</h2>
            <span>{actor.relatedActors.length}</span>
          </div>
          <div className="cast-member-row">
            {actor.relatedActors.map((person) => (
              <button className="cast-member-card" key={person.tmdbId} onClick={() => onNavigate(`/actor/${person.tmdbId}`)} type="button">
                {person.profileUrl ? <img alt={`${person.name} profile`} src={person.profileUrl} /> : <span className="cast-avatar-fallback">{person.name.slice(0, 1)}</span>}
                <strong>{person.name}</strong>
                {person.knownForDepartment ? <small>{person.knownForDepartment}</small> : null}
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </section>
  );
}
