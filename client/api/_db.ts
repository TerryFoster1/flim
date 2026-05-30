import { neon } from "@neondatabase/serverless";

export function db() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured.");
  }

  return neon(databaseUrl);
}

export function sendJson(response: any, status: number, body: unknown) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(body));
}

export function readBody(request: any): Promise<any> {
  if (request.body) {
    return Promise.resolve(typeof request.body === "string" ? JSON.parse(request.body || "{}") : request.body);
  }

  return new Promise((resolve, reject) => {
    let raw = "";
    request.on("data", (chunk: Buffer) => {
      raw += chunk.toString();
    });
    request.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

export function mapPlaylist(row: any, movies: any[] = []) {
  return {
    id: row.id,
    name: row.name,
    description: row.description || "",
    visibility: row.visibility,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    movies: movies.map(mapPlaylistMovie),
  };
}

export function mapPlaylistMovie(row: any) {
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
