import { useEffect, useMemo, useState } from "react";
import { PlaylistGrid } from "../components/PlaylistGrid";
import { getActorDetails } from "../services/actorService";
import type { ActorCredit, ActorDetails } from "../types";

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

function CreditShelf({ title, credits, onNavigate }: { title: string; credits: ActorCredit[]; onNavigate: (path: string) => void }) {
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
            <button className="reset-button" onClick={() => onNavigate(creditPath(credit))} type="button">
              {credit.posterUrl ? <img alt={`${credit.title} poster`} src={credit.posterUrl} /> : <span className="actor-credit-placeholder" />}
              <strong>{credit.title}</strong>
              <small>{yearLabel(credit)} / {credit.mediaType === "tv" ? "TV" : "Movie"}</small>
              {credit.character ? <span>{credit.character}</span> : null}
            </button>
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

  const knownForText = useMemo(() => actor?.knownFor?.filter(Boolean).join(", "), [actor]);
  const biography = actor?.biography?.trim();

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

      <CreditShelf title="Movies" credits={actor.movieCredits || []} onNavigate={onNavigate} />
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
