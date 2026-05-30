import type { MovieDetails, MovieSearchResult, Playlist, PlaylistMovie, WatchStatus } from "../types";
import { requireSupabase } from "./supabaseClient";

interface PlaylistRow {
  id: string;
  name: string;
  description: string | null;
  visibility: Playlist["visibility"];
  created_at: string;
  updated_at: string;
  playlist_movies?: PlaylistMovieRow[];
}

interface PlaylistMovieRow {
  id: string;
  playlist_id: string;
  tmdb_id: number;
  title: string;
  year: string | null;
  poster_url: string | null;
  overview: string | null;
  watched: boolean;
  added_at: string;
}

function mapMovie(row: PlaylistMovieRow): PlaylistMovie {
  return {
    id: row.id,
    playlistId: row.playlist_id,
    tmdbId: row.tmdb_id,
    title: row.title,
    releaseYear: row.year || undefined,
    posterUrl: row.poster_url || undefined,
    overview: row.overview || "",
    genres: [],
    addedAt: row.added_at,
    watchStatus: row.watched ? "watched" : "not_watched",
  };
}

function mapPlaylist(row: PlaylistRow): Playlist {
  return {
    id: row.id,
    name: row.name,
    description: row.description || "",
    visibility: row.visibility,
    movies: (row.playlist_movies || []).map(mapMovie),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const playlistSelect = `
  id,
  name,
  description,
  visibility,
  created_at,
  updated_at,
  playlist_movies (
    id,
    playlist_id,
    tmdb_id,
    title,
    year,
    poster_url,
    overview,
    watched,
    added_at
  )
`;

export async function getPlaylists(): Promise<Playlist[]> {
  const { data, error } = await requireSupabase()
    .from("playlists")
    .select(playlistSelect)
    .order("updated_at", { ascending: false })
    .order("added_at", { referencedTable: "playlist_movies", ascending: false });

  if (error) throw error;
  return ((data || []) as PlaylistRow[]).map(mapPlaylist);
}

export async function getPlaylistById(playlistId: string): Promise<Playlist | null> {
  const { data, error } = await requireSupabase()
    .from("playlists")
    .select(playlistSelect)
    .eq("id", playlistId)
    .maybeSingle();

  if (error) throw error;
  return data ? mapPlaylist(data as PlaylistRow) : null;
}

export async function getMoviesForPlaylist(playlistId: string): Promise<PlaylistMovie[]> {
  const { data, error } = await requireSupabase()
    .from("playlist_movies")
    .select("*")
    .eq("playlist_id", playlistId)
    .order("added_at", { ascending: false });

  if (error) throw error;
  return ((data || []) as PlaylistMovieRow[]).map(mapMovie);
}

export async function createPlaylist(input: Pick<Playlist, "name" | "description" | "visibility">): Promise<Playlist> {
  const { data, error } = await requireSupabase()
    .from("playlists")
    .insert({
      name: input.name.trim() || "Untitled playlist",
      description: input.description.trim(),
      visibility: input.visibility,
    })
    .select(playlistSelect)
    .single();

  if (error) throw error;
  return mapPlaylist(data as PlaylistRow);
}

export async function deletePlaylist(playlistId: string) {
  const { error } = await requireSupabase().from("playlists").delete().eq("id", playlistId);
  if (error) throw error;
}

export async function addMovieToPlaylist(playlistId: string, movie: MovieSearchResult | MovieDetails) {
  const { error } = await requireSupabase()
    .from("playlist_movies")
    .upsert(
      {
        playlist_id: playlistId,
        tmdb_id: movie.tmdbId,
        title: movie.title,
        year: movie.releaseYear || null,
        poster_url: movie.posterUrl || null,
        overview: movie.overview || null,
        watched: false,
      },
      { onConflict: "playlist_id,tmdb_id" },
    );

  if (error) throw error;
}

export async function removeMovieFromPlaylist(playlistId: string, tmdbId: number) {
  const { error } = await requireSupabase()
    .from("playlist_movies")
    .delete()
    .eq("playlist_id", playlistId)
    .eq("tmdb_id", tmdbId);

  if (error) throw error;
}

export async function toggleWatchedStatus(playlistId: string, tmdbId: number, watchStatus: WatchStatus) {
  const { error } = await requireSupabase()
    .from("playlist_movies")
    .update({ watched: watchStatus === "watched" })
    .eq("playlist_id", playlistId)
    .eq("tmdb_id", tmdbId);

  if (error) throw error;
}

export async function clonePlaylist(playlistId: string): Promise<Playlist | null> {
  const source = await getPlaylistById(playlistId);
  if (!source) return null;

  const clone = await createPlaylist({
    name: `${source.name} Copy`,
    description: source.description,
    visibility: "private",
  });

  for (const movie of source.movies) {
    await addMovieToPlaylist(clone.id, {
      tmdbId: movie.tmdbId,
      title: movie.title,
      releaseYear: movie.releaseYear,
      overview: movie.overview,
      posterUrl: movie.posterUrl,
      posterPath: movie.posterPath,
      genreIds: [],
    });
  }

  return getPlaylistById(clone.id);
}
