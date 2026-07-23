import { clearSessionCookie, getSessionCookie, saveSessionCookieFromHeaders } from "./cookieStore";
import type { ChallengePack, CurrentUser, MediaType, MovieDetails, MovieSearchResult, Playlist, TriviaFeed } from "./types";

const DEFAULT_API_BASE_URL = "https://www.flim.ca";

type RequestOptions = RequestInit & {
  useSession?: boolean;
};

function normalizeBaseUrl(value?: string) {
  return (value || DEFAULT_API_BASE_URL).replace(/\/+$/, "");
}

function toQuery(params: Record<string, string | number | boolean | undefined | null>) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") query.set(key, String(value));
  });
  const text = query.toString();
  return text ? `?${text}` : "";
}

async function parseJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) return {} as T;
  return JSON.parse(text) as T;
}

export class FlimApiClient {
  readonly baseUrl: string;

  constructor(baseUrl = process.env.EXPO_PUBLIC_FLIM_API_BASE_URL) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const headers = new Headers(options.headers);
    headers.set("Accept", "application/json");
    if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

    if (options.useSession !== false) {
      const cookie = await getSessionCookie();
      if (cookie) headers.set("Cookie", cookie);
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers,
      credentials: "include"
    });

    await saveSessionCookieFromHeaders(response.headers);

    if (response.status === 401) await clearSessionCookie();
    if (!response.ok) {
      const errorBody: { error?: string } = await parseJson<{ error?: string }>(response).catch(() => ({}));
      throw new Error(errorBody.error || `Flim request failed with ${response.status}`);
    }

    return parseJson<T>(response);
  }

  getSession() {
    return this.request<{ user: CurrentUser | null }>("/api/profiles/auth?action=session");
  }

  signIn(email: string, password: string) {
    return this.request<{ user: CurrentUser }>("/api/profiles/auth?action=signin", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });
  }

  signUp(email: string, password: string, handle: string, displayName?: string) {
    return this.request<{ user: CurrentUser }>("/api/profiles/auth?action=signup", {
      method: "POST",
      body: JSON.stringify({ email, password, handle, displayName })
    });
  }

  async logout() {
    await this.request<{ ok: boolean }>("/api/profiles/auth?action=logout", { method: "POST" }).catch(() => ({ ok: true }));
    await clearSessionCookie();
  }

  async searchTitles(query: string, mediaType: "both" | MediaType = "both") {
    const payload = await this.request<MovieSearchResult[] | { results?: MovieSearchResult[] }>(
      `/api/movies/search${toQuery({ q: query, type: mediaType })}`,
      { useSession: false }
    );
    return Array.isArray(payload) ? payload : payload.results || [];
  }

  getMovieDetails(tmdbId: number, mediaType: MediaType) {
    return this.request<MovieDetails>(`/api/movies/${tmdbId}${toQuery({ type: mediaType })}`, { useSession: false });
  }

  getMyPlaylists() {
    return this.request<Playlist[]>("/api/playlists");
  }

  getPlaylist(id: string) {
    return this.request<Playlist>(`/api/playlists/${encodeURIComponent(id)}`);
  }

  createPlaylist(name: string, description = "", visibility: Playlist["visibility"] = "private") {
    return this.request<Playlist>("/api/playlists", {
      method: "POST",
      body: JSON.stringify({ name, description, visibility })
    });
  }

  addTitleToPlaylist(playlistId: string, title: MovieSearchResult | MovieDetails) {
    return this.request<{ ok: boolean }>(`/api/playlist-movies${toQuery({ id: playlistId })}`, {
      method: "POST",
      body: JSON.stringify({
        tmdbId: title.tmdbId,
        mediaType: title.mediaType,
        title: title.title,
        posterUrl: title.posterUrl,
        releaseYear: title.releaseYear,
        overview: title.overview
      })
    });
  }

  async getPublicPlaylists() {
    const payload = await this.request<{ playlists?: Playlist[] } | Playlist[]>("/api/public/playlists", { useSession: false });
    return Array.isArray(payload) ? payload : payload.playlists || [];
  }

  getTriviaPack(tmdbId: number, mediaType: MediaType, questionCount = 25) {
    return this.request<TriviaFeed>(`/api/trivia${toQuery({ tmdbId, mediaType, questionCount })}`);
  }

  enqueueTrivia(tmdbId: number, mediaType: MediaType, title?: string) {
    return this.request<{ ok: boolean; status?: string }>("/api/trivia/interest", {
      method: "POST",
      body: JSON.stringify({ tmdbId, mediaType, title, reason: "mobile_title_interest" })
    });
  }

  async getChallenges() {
    const payload = await this.request<ChallengePack[] | { challenges?: ChallengePack[]; packs?: ChallengePack[] }>("/api/challenges", {
      useSession: false
    });
    if (Array.isArray(payload)) return payload;
    return payload.challenges || payload.packs || [];
  }
}

export const flimApi = new FlimApiClient();
