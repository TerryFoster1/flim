import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { PlaylistGrid } from "../components/PlaylistGrid";
import {
  addMovieToDirectorPlaylist,
  createDirectorPlaylist,
  deleteDirectorPlaylist,
  getDirectorAdminSession,
  getDirectorAnalytics,
  getDirectorPlaylist,
  getDirectorPlaylists,
  getDirectorProfile,
  loginDirectorAdmin,
  logoutDirectorAdmin,
  removeMovieFromDirectorPlaylist,
  reorderDirectorPlaylistMovies,
  updateDirectorPlaylist,
  updateDirectorProfile,
  type DirectorAnalytics,
  type DirectorProfile,
} from "../services/directorAdminService";
import { searchMovies } from "../services/tmdbService";
import type { MediaSearchMode } from "../services/tmdbService";
import type { MovieSearchResult, Playlist } from "../types";

interface DirectorAdminProps {
  page: "login" | "dashboard" | "playlists" | "playlist" | "analytics";
  playlistId?: string;
  onNavigate: (path: string) => void;
}

function useDirectorGate(page: DirectorAdminProps["page"], onNavigate: (path: string) => void) {
  const [checking, setChecking] = useState(page !== "login");
  const [authenticated, setAuthenticated] = useState(page === "login" ? false : null);

  useEffect(() => {
    if (page === "login") return;
    let active = true;
    getDirectorAdminSession()
      .then((session) => {
        if (!active) return;
        setAuthenticated(session.authenticated);
        if (!session.authenticated) onNavigate("/director-admin/login");
      })
      .catch(() => {
        if (!active) return;
        setAuthenticated(false);
        onNavigate("/director-admin/login");
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, [page, onNavigate]);

  return { checking, authenticated };
}

function AdminShell({ children, onNavigate }: { children: ReactNode; onNavigate: (path: string) => void }) {
  async function logout() {
    await logoutDirectorAdmin().catch(() => undefined);
    onNavigate("/director-admin/login");
  }

  return (
    <section className="route-page director-admin-page">
      <header className="director-admin-header">
        <div>
          <span className="eyebrow">Internal editorial</span>
          <h1>Director Admin</h1>
        </div>
        <nav className="director-admin-tabs" aria-label="Director admin">
          <button onClick={() => onNavigate("/director-admin/dashboard")} type="button">Dashboard</button>
          <button onClick={() => onNavigate("/director-admin/playlists")} type="button">Playlists</button>
          <button onClick={() => onNavigate("/director-admin/analytics")} type="button">Analytics</button>
          <button onClick={() => onNavigate("/@the-director")} type="button">Public Profile</button>
          <button className="danger-button subtle" onClick={logout} type="button">Logout</button>
        </nav>
      </header>
      {children}
    </section>
  );
}

export function DirectorAdminLogin({ onNavigate }: Pick<DirectorAdminProps, "onNavigate">) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError("");
    try {
      await loginDirectorAdmin(username, password);
      onNavigate("/director-admin/dashboard");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Director admin sign-in failed.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="route-page director-admin-login">
      <form className="director-login-card" onSubmit={submit}>
        <span className="eyebrow">The Director</span>
        <h1>Editorial Login</h1>
        <p>Private access for managing Flim's official curated playlists.</p>
        {error ? <p className="error-message">{error}</p> : null}
        <label>
          <span>Username</span>
          <input autoComplete="username" onChange={(event) => setUsername(event.target.value)} placeholder="Enter username" required value={username} />
        </label>
        <label>
          <span>Password</span>
          <input autoComplete="current-password" onChange={(event) => setPassword(event.target.value)} required type="password" value={password} />
        </label>
        <button className="primary-button" disabled={isSaving} type="submit">
          {isSaving ? "Signing in..." : "Sign In"}
        </button>
      </form>
    </section>
  );
}

function DirectorProfileEditor() {
  const [profile, setProfile] = useState<DirectorProfile | null>(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    getDirectorProfile().then(setProfile).catch(() => setStatus("Could not load Director profile."));
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile) return;
    setStatus("");
    try {
      setProfile(await updateDirectorProfile(profile));
      setStatus("Director profile saved.");
    } catch {
      setStatus("Could not save profile.");
    }
  }

  if (!profile) return <article className="director-admin-card"><p>{status || "Loading Director profile..."}</p></article>;

  return (
    <form className="director-admin-card director-profile-form" onSubmit={submit}>
      <div>
        <span className="eyebrow">Profile</span>
        <h2>The Director</h2>
      </div>
      {status ? <p className={status.includes("saved") ? "success-message" : "error-message"}>{status}</p> : null}
      <label>
        <span>Display name</span>
        <input onChange={(event) => setProfile({ ...profile, display_name: event.target.value })} value={profile.display_name} />
      </label>
      <label>
        <span>Bio</span>
        <textarea onChange={(event) => setProfile({ ...profile, bio: event.target.value })} value={profile.bio} />
      </label>
      <label>
        <span>Tagline</span>
        <input onChange={(event) => setProfile({ ...profile, tagline: event.target.value })} value={profile.tagline} />
      </label>
      <label>
        <span>Quote</span>
        <input onChange={(event) => setProfile({ ...profile, quote: event.target.value })} value={profile.quote} />
      </label>
      <button className="primary-button" type="submit">Save Profile</button>
    </form>
  );
}

function DirectorAnalyticsCards() {
  const [analytics, setAnalytics] = useState<DirectorAnalytics | null>(null);

  useEffect(() => {
    getDirectorAnalytics().then(setAnalytics).catch(() => setAnalytics(null));
  }, []);

  const cards = [
    ["Total playlists", analytics?.totalPlaylists],
    ["Public playlists", analytics?.totalPublicPlaylists],
    ["Director titles", analytics?.totalMovies],
    ["Public playlist views", analytics?.publicPlaylistViews ?? "Coming soon"],
    ["Shares", analytics?.shares ?? "Coming soon"],
    ["QR opens", analytics?.qrOpens ?? "Coming soon"],
    ["Now Playing uses", analytics?.nowPlayingUses ?? "Coming soon"],
  ];

  return (
    <div className="director-analytics-grid">
      {cards.map(([label, value]) => (
        <article className="director-admin-card analytics-card" key={label}>
          <span>{label}</span>
          <strong>{value ?? "Loading..."}</strong>
        </article>
      ))}
    </div>
  );
}

export function DirectorAdminDashboard({ onNavigate }: Pick<DirectorAdminProps, "onNavigate">) {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);

  useEffect(() => {
    getDirectorPlaylists().then(setPlaylists).catch(() => setPlaylists([]));
  }, []);

  return (
    <AdminShell onNavigate={onNavigate}>
      <div className="director-admin-dashboard">
        <DirectorProfileEditor />
        <section className="director-admin-card">
          <div className="director-card-heading">
            <div>
              <span className="eyebrow">Playlists</span>
              <h2>Recently updated</h2>
            </div>
            <button className="primary-button" onClick={() => onNavigate("/director-admin/playlists")} type="button">Manage Playlists</button>
          </div>
          <PlaylistGrid onNavigate={(path) => onNavigate(path.replace("/playlists/", "/director-admin/playlists/"))} playlists={playlists.slice(0, 4)} />
        </section>
      </div>
    </AdminShell>
  );
}

export function DirectorAdminAnalytics({ onNavigate }: Pick<DirectorAdminProps, "onNavigate">) {
  return (
    <AdminShell onNavigate={onNavigate}>
      <DirectorAnalyticsCards />
    </AdminShell>
  );
}

export function DirectorAdminPlaylists({ onNavigate }: Pick<DirectorAdminProps, "onNavigate">) {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [query, setQuery] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<Playlist["visibility"]>("public");
  const [status, setStatus] = useState("");

  async function refresh() {
    setPlaylists(await getDirectorPlaylists());
  }

  useEffect(() => {
    refresh().catch(() => setStatus("Could not load Director playlists."));
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return playlists;
    return playlists.filter((playlist) => [playlist.name, playlist.description].some((value) => value.toLowerCase().includes(needle)));
  }, [playlists, query]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("");
    try {
      const playlist = await createDirectorPlaylist({ name, description, visibility });
      setName("");
      setDescription("");
      setVisibility("public");
      onNavigate(`/director-admin/playlists/${playlist.id}`);
    } catch {
      setStatus("Could not create Director playlist.");
    }
  }

  return (
    <AdminShell onNavigate={onNavigate}>
      {status ? <p className="error-message">{status}</p> : null}
      <div className="playlist-shelf-heading playlist-shelf-heading-with-search">
        <h2>Director Playlists</h2>
        <label className="collection-search playlist-title-search">
          <span>Search playlists</span>
          <input onChange={(event) => setQuery(event.target.value)} placeholder="Search Director playlists..." type="search" value={query} />
        </label>
      </div>
      <form className="collection-create-panel director-create-panel" onSubmit={submit}>
        <label>
          <span>Playlist title</span>
          <input onChange={(event) => setName(event.target.value)} placeholder="Director's Weekend Picks" required value={name} />
        </label>
        <label>
          <span>Description</span>
          <textarea onChange={(event) => setDescription(event.target.value)} placeholder="A curated shelf for Flim." value={description} />
        </label>
        <label>
          <span>Visibility</span>
          <select onChange={(event) => setVisibility(event.target.value as Playlist["visibility"])} value={visibility}>
            <option value="public">public</option>
            <option value="shared">shared</option>
            <option value="private">private</option>
          </select>
        </label>
        <button className="primary-button" type="submit">Create Director Playlist</button>
      </form>
      <PlaylistGrid onNavigate={(path) => onNavigate(path.replace("/playlists/", "/director-admin/playlists/"))} playlists={filtered} />
    </AdminShell>
  );
}

export function DirectorAdminPlaylistEditor({ playlistId, onNavigate }: Pick<DirectorAdminProps, "playlistId" | "onNavigate">) {
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [movieQuery, setMovieQuery] = useState("");
  const [mediaType, setMediaType] = useState<MediaSearchMode>("both");
  const [results, setResults] = useState<MovieSearchResult[]>([]);
  const [status, setStatus] = useState("");
  const [isSearching, setIsSearching] = useState(false);

  async function refresh() {
    if (!playlistId) return;
    setPlaylist(await getDirectorPlaylist(playlistId));
  }

  useEffect(() => {
    refresh().catch(() => setStatus("Could not load Director playlist."));
  }, [playlistId]);

  async function savePlaylist(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!playlistId || !playlist) return;
    setStatus("");
    try {
      setPlaylist(await updateDirectorPlaylist(playlistId, {
        name: playlist.name,
        description: playlist.description,
        visibility: playlist.visibility,
      }));
      setStatus("Playlist saved.");
    } catch {
      setStatus("Could not save playlist.");
    }
  }

  async function regenerateSlug() {
    if (!playlistId || !playlist) return;
    if (!window.confirm("Regenerate this public slug? Existing shared links will change.")) return;
    setPlaylist(await updateDirectorPlaylist(playlistId, { name: playlist.name, description: playlist.description, visibility: playlist.visibility, regenerateSlug: true }));
  }

  async function deletePlaylist() {
    if (!playlistId || !window.confirm("Delete this Director playlist? This cannot be undone.")) return;
    await deleteDirectorPlaylist(playlistId);
    onNavigate("/director-admin/playlists");
  }

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSearching(true);
    setStatus("");
    try {
      setResults(await searchMovies(movieQuery, mediaType));
    } catch {
      setStatus("Could not search movies right now.");
    } finally {
      setIsSearching(false);
    }
  }

  async function addMovie(movie: MovieSearchResult) {
    if (!playlistId) return;
    setStatus("");
    try {
      await addMovieToDirectorPlaylist(playlistId, movie);
      await refresh();
      setStatus(`${movie.title} added.`);
    } catch {
      setStatus("Could not add this title.");
    }
  }

  async function removeMovie(movieId?: string) {
    if (!playlistId || !movieId) return;
    await removeMovieFromDirectorPlaylist(playlistId, movieId);
    await refresh();
  }

  async function moveMovie(index: number, direction: -1 | 1) {
    if (!playlist || !playlistId) return;
    const next = [...playlist.movies];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setPlaylist({ ...playlist, movies: next });
    await reorderDirectorPlaylistMovies(playlistId, next.map((movie) => movie.id || "").filter(Boolean));
    await refresh();
  }

  if (!playlist) {
    return <AdminShell onNavigate={onNavigate}><p className="empty-state">{status || "Loading playlist..."}</p></AdminShell>;
  }

  return (
    <AdminShell onNavigate={onNavigate}>
      {status ? <p className={status.includes("saved") || status.includes("added") ? "success-message" : "error-message"}>{status}</p> : null}
      <section className="director-editor-layout">
        <form className="director-admin-card director-playlist-form" onSubmit={savePlaylist}>
          <span className="eyebrow">Director playlist</span>
          <label>
            <span>Title</span>
            <input onChange={(event) => setPlaylist({ ...playlist, name: event.target.value })} value={playlist.name} />
          </label>
          <label>
            <span>Description</span>
            <textarea onChange={(event) => setPlaylist({ ...playlist, description: event.target.value })} value={playlist.description} />
          </label>
          <label>
            <span>Visibility</span>
            <select onChange={(event) => setPlaylist({ ...playlist, visibility: event.target.value as Playlist["visibility"] })} value={playlist.visibility}>
              <option value="public">public</option>
              <option value="shared">shared</option>
              <option value="private">private</option>
            </select>
          </label>
          <div className="button-row">
            <button className="primary-button" type="submit">Save Playlist</button>
            <button className="secondary-button" onClick={() => onNavigate(`/p/${playlist.publicSlug}`)} type="button">Preview Public Page</button>
          </div>
          <div className="button-row">
            <button className="secondary-button" onClick={regenerateSlug} type="button">Regenerate Slug</button>
            <button className="danger-button" onClick={deletePlaylist} type="button">Delete Playlist</button>
          </div>
          <p className="helper-text">Public URL: /p/{playlist.publicSlug}</p>
        </form>

        <section className="director-admin-card">
          <div className="director-card-heading">
            <div>
              <span className="eyebrow">Add title</span>
              <h2>Search movies</h2>
            </div>
          </div>
          <form className="director-search-form" onSubmit={search}>
            <label>
              <span>Search</span>
              <input onChange={(event) => setMovieQuery(event.target.value)} placeholder="Back to the Future" required value={movieQuery} />
            </label>
            <label>
              <span>Type</span>
              <select onChange={(event) => setMediaType(event.target.value as MediaSearchMode)} value={mediaType}>
                <option value="both">Both</option>
                <option value="movie">Movies</option>
                <option value="tv">TV Shows</option>
              </select>
            </label>
            <button className="primary-button" disabled={isSearching} type="submit">{isSearching ? "Searching..." : "Search"}</button>
          </form>
          <div className="director-search-results">
            {results.map((movie) => (
              <article className="director-search-result" key={`${movie.mediaType}-${movie.tmdbId}`}>
                {movie.posterUrl ? <img alt="" src={movie.posterUrl} /> : <span className="poster-fallback" />}
                <div>
                  <strong>{movie.title}</strong>
                  <p>{movie.releaseYear || (movie.mediaType === "tv" ? "TV Show" : "Movie")}</p>
                </div>
                <button className="secondary-button" onClick={() => addMovie(movie)} type="button">Add</button>
              </article>
            ))}
          </div>
        </section>
      </section>

      <section className="director-admin-card">
        <div className="director-card-heading">
          <div>
            <span className="eyebrow">Movie order</span>
            <h2>{playlist.movies.length} titles</h2>
          </div>
        </div>
        <div className="director-movie-list">
          {playlist.movies.map((movie, index) => (
            <article className="director-movie-row" key={movie.id || `${movie.mediaType}-${movie.tmdbId}`}>
              {movie.posterUrl ? <img alt="" src={movie.posterUrl} /> : <span className="poster-fallback" />}
              <div>
                <strong>{movie.title}</strong>
                <p>{movie.releaseYear || ""} {movie.mediaType === "tv" ? "TV Show" : "Movie"}</p>
              </div>
              <div className="director-row-actions">
                <button className="secondary-button" disabled={index === 0} onClick={() => moveMovie(index, -1)} type="button">Up</button>
                <button className="secondary-button" disabled={index === playlist.movies.length - 1} onClick={() => moveMovie(index, 1)} type="button">Down</button>
                <button className="danger-button subtle" onClick={() => removeMovie(movie.id)} type="button">Remove</button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </AdminShell>
  );
}

export function DirectorAdmin({ page, playlistId, onNavigate }: DirectorAdminProps) {
  const gate = useDirectorGate(page, onNavigate);

  if (page === "login") return <DirectorAdminLogin onNavigate={onNavigate} />;
  if (gate.checking) return <section className="route-page director-admin-page"><p className="empty-state">Checking Director admin access...</p></section>;
  if (!gate.authenticated) return <DirectorAdminLogin onNavigate={onNavigate} />;
  if (page === "analytics") return <DirectorAdminAnalytics onNavigate={onNavigate} />;
  if (page === "playlists") return <DirectorAdminPlaylists onNavigate={onNavigate} />;
  if (page === "playlist") return <DirectorAdminPlaylistEditor playlistId={playlistId} onNavigate={onNavigate} />;
  return <DirectorAdminDashboard onNavigate={onNavigate} />;
}
