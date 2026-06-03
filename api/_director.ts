import { ensurePlaylistMediaColumns, ensureUserProfilesTable } from "./_db.js";
import { upsertMediaItem } from "./_mediaCatalog.js";
import { fetchTmdbMovieDetails } from "./_tmdb.js";

export const directorUserId = "11111111-1111-4111-8111-111111111111";
export const directorHandle = "the-director";
export const directorDisplayName = "The Director";

interface DirectorMovieSeed {
  tmdbId: number;
  title: string;
}

interface DirectorPlaylistSeed {
  slug: string;
  name: string;
  description: string;
  movies: DirectorMovieSeed[];
}

const directorPlaylists: DirectorPlaylistSeed[] = [
  {
    slug: "directors-top-100-comedies",
    name: "Director's Top 100 Comedies",
    description: "A starter shelf of comedies selected by Flim's official editorial curator.",
    movies: [
      { tmdbId: 13, title: "Forrest Gump" },
      { tmdbId: 137, title: "Groundhog Day" },
      { tmdbId: 620, title: "Ghostbusters" },
      { tmdbId: 9377, title: "Ferris Bueller's Day Off" },
      { tmdbId: 2493, title: "The Princess Bride" },
      { tmdbId: 771, title: "Home Alone" },
      { tmdbId: 808, title: "Shrek" },
      { tmdbId: 862, title: "Toy Story" },
    ],
  },
  {
    slug: "directors-top-100-80s-movies",
    name: "Director's Top 100 80s Movies",
    description: "Neon, practical effects, big adventures, and endlessly rewatchable 1980s favorites.",
    movies: [
      { tmdbId: 105, title: "Back to the Future" },
      { tmdbId: 601, title: "E.T. the Extra-Terrestrial" },
      { tmdbId: 218, title: "The Terminator" },
      { tmdbId: 85, title: "Raiders of the Lost Ark" },
      { tmdbId: 9340, title: "The Goonies" },
      { tmdbId: 744, title: "Top Gun" },
      { tmdbId: 106, title: "Predator" },
      { tmdbId: 765, title: "Evil Dead II" },
    ],
  },
  {
    slug: "directors-family-movie-night",
    name: "Director's Family Movie Night",
    description: "Big-hearted picks for a couch full of snacks, blankets, and repeat requests.",
    movies: [
      { tmdbId: 12, title: "Finding Nemo" },
      { tmdbId: 862, title: "Toy Story" },
      { tmdbId: 14160, title: "Up" },
      { tmdbId: 116149, title: "Paddington" },
      { tmdbId: 508439, title: "Onward" },
      { tmdbId: 269149, title: "Zootopia" },
      { tmdbId: 10681, title: "WALL-E" },
      { tmdbId: 10193, title: "Toy Story 3" },
    ],
  },
  {
    slug: "directors-hidden-gems",
    name: "Director's Hidden Gems",
    description: "Movies that deserve a little more light from the projector.",
    movies: [
      { tmdbId: 843, title: "In the Mood for Love" },
      { tmdbId: 11545, title: "Rushmore" },
      { tmdbId: 194662, title: "Birdman or (The Unexpected Virtue of Ignorance)" },
      { tmdbId: 11036, title: "The Notebook" },
      { tmdbId: 264644, title: "Room" },
      { tmdbId: 1124, title: "The Prestige" },
      { tmdbId: 128, title: "Princess Mononoke" },
      { tmdbId: 46738, title: "Incendies" },
    ],
  },
  {
    slug: "directors-best-sci-fi-movies",
    name: "Director's Best Sci-Fi Movies",
    description: "Space, time, machines, memory, and the kind of questions that follow you home.",
    movies: [
      { tmdbId: 157336, title: "Interstellar" },
      { tmdbId: 27205, title: "Inception" },
      { tmdbId: 603, title: "The Matrix" },
      { tmdbId: 78, title: "Blade Runner" },
      { tmdbId: 62, title: "2001: A Space Odyssey" },
      { tmdbId: 11, title: "Star Wars" },
      { tmdbId: 1891, title: "The Empire Strikes Back" },
      { tmdbId: 329, title: "Jurassic Park" },
    ],
  },
  {
    slug: "directors-movies-everyone-should-watch-once",
    name: "Director's Movies Everyone Should Watch Once",
    description: "Landmark films for anyone building their personal movie vocabulary.",
    movies: [
      { tmdbId: 238, title: "The Godfather" },
      { tmdbId: 424, title: "Schindler's List" },
      { tmdbId: 550, title: "Fight Club" },
      { tmdbId: 680, title: "Pulp Fiction" },
      { tmdbId: 769, title: "GoodFellas" },
      { tmdbId: 510, title: "One Flew Over the Cuckoo's Nest" },
      { tmdbId: 389, title: "12 Angry Men" },
      { tmdbId: 129, title: "Spirited Away" },
    ],
  },
  {
    slug: "directors-date-night-collection",
    name: "Director's Date Night Collection",
    description: "Romance, charm, and movie-night conversation starters.",
    movies: [
      { tmdbId: 597, title: "Titanic" },
      { tmdbId: 313369, title: "La La Land" },
      { tmdbId: 194, title: "Amelie" },
      { tmdbId: 73, title: "Before Sunrise" },
      { tmdbId: 80, title: "Before Sunset" },
      { tmdbId: 38, title: "Eternal Sunshine of the Spotless Mind" },
      { tmdbId: 31011, title: "500 Days of Summer" },
      { tmdbId: 82693, title: "Silver Linings Playbook" },
    ],
  },
  {
    slug: "directors-saturday-night-action-picks",
    name: "Director's Saturday Night Action Picks",
    description: "High-energy movies built for loud speakers and bigger reactions.",
    movies: [
      { tmdbId: 245891, title: "John Wick" },
      { tmdbId: 76341, title: "Mad Max: Fury Road" },
      { tmdbId: 562, title: "Die Hard" },
      { tmdbId: 603692, title: "Extraction" },
      { tmdbId: 98, title: "Gladiator" },
      { tmdbId: 155, title: "The Dark Knight" },
      { tmdbId: 16869, title: "Inglourious Basterds" },
      { tmdbId: 5503, title: "The Fugitive" },
    ],
  },
  {
    slug: "directors-best-time-travel-movies",
    name: "Director's Best Time Travel Movies",
    description: "Loops, paradoxes, second chances, and clocks that refuse to behave.",
    movies: [
      { tmdbId: 105, title: "Back to the Future" },
      { tmdbId: 38, title: "Eternal Sunshine of the Spotless Mind" },
      { tmdbId: 137113, title: "Edge of Tomorrow" },
      { tmdbId: 1124, title: "The Prestige" },
      { tmdbId: 59967, title: "Looper" },
      { tmdbId: 141, title: "Donnie Darko" },
      { tmdbId: 264660, title: "Ex Machina" },
      { tmdbId: 168259, title: "Furious 7" },
    ],
  },
  {
    slug: "directors-summer-blockbusters",
    name: "Director's Summer Blockbusters",
    description: "The kind of big-screen movies that feel best with popcorn.",
    movies: [
      { tmdbId: 329, title: "Jurassic Park" },
      { tmdbId: 602, title: "Independence Day" },
      { tmdbId: 671, title: "Harry Potter and the Philosopher's Stone" },
      { tmdbId: 19995, title: "Avatar" },
      { tmdbId: 24428, title: "The Avengers" },
      { tmdbId: 122, title: "The Lord of the Rings: The Return of the King" },
      { tmdbId: 1771, title: "Captain America: The First Avenger" },
      { tmdbId: 22, title: "Pirates of the Caribbean: The Curse of the Black Pearl" },
    ],
  },
  {
    slug: "directors-oscar-winners",
    name: "Director's Oscar Winners",
    description: "Academy-recognized films with staying power beyond awards night.",
    movies: [
      { tmdbId: 496243, title: "Parasite" },
      { tmdbId: 68718, title: "The Artist" },
      { tmdbId: 490132, title: "Green Book" },
      { tmdbId: 376867, title: "Moonlight" },
      { tmdbId: 28178, title: "The King's Speech" },
      { tmdbId: 45269, title: "The Social Network" },
      { tmdbId: 857, title: "Saving Private Ryan" },
      { tmdbId: 14, title: "American Beauty" },
    ],
  },
  {
    slug: "directors-movie-marathon-collection",
    name: "Director's Movie Marathon Collection",
    description: "Start here when one movie is clearly not enough.",
    movies: [
      { tmdbId: 120, title: "The Lord of the Rings: The Fellowship of the Ring" },
      { tmdbId: 121, title: "The Lord of the Rings: The Two Towers" },
      { tmdbId: 122, title: "The Lord of the Rings: The Return of the King" },
      { tmdbId: 671, title: "Harry Potter and the Philosopher's Stone" },
      { tmdbId: 672, title: "Harry Potter and the Chamber of Secrets" },
      { tmdbId: 673, title: "Harry Potter and the Prisoner of Azkaban" },
      { tmdbId: 11, title: "Star Wars" },
      { tmdbId: 1891, title: "The Empire Strikes Back" },
    ],
  },
];

let directorSeedPromise: Promise<void> | null = null;

export function isDirectorPlaylist(row: any) {
  return row?.creator_handle === directorHandle || row?.owner_user_id === directorUserId;
}

export async function ensureDirectorSeed(sql: any) {
  if (!directorSeedPromise) {
    directorSeedPromise = seedDirector(sql).catch((error) => {
      directorSeedPromise = null;
      throw error;
    });
  }

  return directorSeedPromise;
}

async function seedDirector(sql: any) {
  await ensureUserProfilesTable(sql);
  await ensurePlaylistMediaColumns(sql);
  await sql`
    create table if not exists director_profile (
      id text primary key default 'the-director',
      display_name text not null default 'The Director',
      bio text not null default 'Curating movie collections for Flim.',
      tagline text not null default 'Official Flim editorial curator.',
      quote text not null default 'Some movies deserve a second watch.',
      updated_at timestamptz not null default now()
    )
  `;
  await sql`
    insert into director_profile (id)
    values ('the-director')
    on conflict (id) do nothing
  `;
  const [directorProfile] = await sql`select * from director_profile where id = 'the-director' limit 1`;

  await sql`
    insert into users (id, email, password_hash)
    values (${directorUserId}, 'director@flim.ca', 'official-flim-editorial-account')
    on conflict (id) do nothing
  `;

  await sql`
    insert into user_profiles (user_id, display_name, handle, bio)
    values (${directorUserId}, ${directorProfile?.display_name || directorDisplayName}, ${directorHandle}, ${directorProfile?.bio || "Curating movie collections for Flim."})
    on conflict (user_id) do update set
      display_name = excluded.display_name,
      handle = excluded.handle,
      bio = excluded.bio,
      updated_at = now()
  `;

  for (const playlistSeed of directorPlaylists) {
    const [playlist] = await sql`
      insert into playlists (public_slug, name, description, visibility, owner_user_id)
      values (${playlistSeed.slug}, ${playlistSeed.name}, ${playlistSeed.description}, 'public', ${directorUserId})
      on conflict (public_slug) do update set
        owner_user_id = case when playlists.owner_user_id is null or playlists.owner_user_id = ${directorUserId} then ${directorUserId} else playlists.owner_user_id end,
        updated_at = playlists.updated_at
      returning id, owner_user_id
    `;

    if (!playlist || playlist.owner_user_id !== directorUserId) continue;

    const [movieCount] = await sql`select count(*)::int as count from playlist_movies where playlist_id = ${playlist.id}`;
    if ((movieCount?.count || 0) > 0) continue;

    for (const movieSeed of playlistSeed.movies) {
      try {
        const existingMovie = await sql`
          select id from playlist_movies
          where playlist_id = ${playlist.id}
            and media_type = 'movie'
            and tmdb_id = ${movieSeed.tmdbId}
          limit 1
        `;
        if (existingMovie[0]) continue;

        const movie = await fetchTmdbMovieDetails(movieSeed.tmdbId, "movie");
        const mediaItem = await upsertMediaItem(sql, movie);
        await sql`
          insert into playlist_movies (playlist_id, media_item_id, media_type, tmdb_id, title, year, poster_url, overview, runtime_minutes, season_count, episode_count, watched)
          values (${playlist.id}, ${mediaItem?.id || null}, 'movie', ${movie.tmdbId}, ${movie.title}, ${movie.releaseYear || null}, ${movie.posterUrl || null}, ${movie.overview || ""}, ${movie.runtimeMinutes || null}, null, null, false)
          on conflict (playlist_id, media_type, tmdb_id)
          do update set
            media_item_id = coalesce(excluded.media_item_id, playlist_movies.media_item_id),
            title = excluded.title,
            year = excluded.year,
            poster_url = excluded.poster_url,
            overview = excluded.overview,
            runtime_minutes = excluded.runtime_minutes
        `;
      } catch (error) {
        console.error("director_movie_seed_failed", {
          playlist: playlistSeed.slug,
          tmdbId: movieSeed.tmdbId,
          title: movieSeed.title,
          message: error instanceof Error ? error.message : "Unknown Director seed error",
        });
      }
    }
  }
}
