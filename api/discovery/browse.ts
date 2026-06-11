import { db, ensurePlaylistFollowsTable, ensurePlaylistLikesTable, ensureUserFollowsTable, ensureUserProfilesTable, getCurrentUser, mapPlaylist, sendJson } from "../_db.js";

const genreHubs = [
  { key: "sci-fi", title: "Sci-Fi", aliases: ["sci-fi", "sci fi", "science fiction", "space"] },
  { key: "horror", title: "Horror", aliases: ["horror", "scary", "slasher"] },
  { key: "fantasy", title: "Fantasy", aliases: ["fantasy", "magic"] },
  { key: "thriller", title: "Thriller", aliases: ["thriller", "suspense"] },
  { key: "comedy", title: "Comedy", aliases: ["comedy", "funny"] },
  { key: "action", title: "Action", aliases: ["action", "adventure"] },
  { key: "family", title: "Family", aliases: ["family", "kids", "animation"] },
  { key: "drama", title: "Drama", aliases: ["drama"] },
];

const franchiseHubs = [
  { key: "star-wars", title: "Star Wars", collectionSlug: "star-wars", aliases: ["star wars", "jedi", "skywalker"] },
  { key: "back-to-the-future", title: "Back to the Future", collectionSlug: "back-to-the-future", aliases: ["back to the future", "marty mcfly", "time travel"] },
  { key: "jurassic-park", title: "Jurassic Park", collectionSlug: "jurassic-park", aliases: ["jurassic park", "jurassic world", "dinosaurs"] },
  { key: "marvel", title: "Marvel", collectionSlug: "avengers", aliases: ["marvel", "mcu", "avengers", "superhero"] },
  { key: "lord-of-the-rings", title: "Lord of the Rings", collectionSlug: "lord-of-the-rings", aliases: ["lord of the rings", "middle earth", "hobbit"] },
  { key: "mission-impossible", title: "Mission: Impossible", collectionSlug: "mission-impossible", aliases: ["mission impossible", "tom cruise", "spy"] },
  { key: "harry-potter", title: "Harry Potter", collectionSlug: "harry-potter", aliases: ["harry potter", "wizarding world", "hogwarts"] },
  { key: "pixar", title: "Pixar", collectionSlug: "toy-story", aliases: ["pixar", "toy story", "animation"] },
];

function firstQueryValue(value: unknown) {
  return Array.isArray(value) ? String(value[0] || "") : String(value || "");
}

function slugToTitle(value: string) {
  return value
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function hubPath(request: any) {
  const pathname = new URL(request.url || "", "https://www.flim.ca").pathname;
  const fromPath = pathname.split("/api/discovery/browse/").pop()?.split("?")[0];
  if (fromPath && fromPath !== pathname) return fromPath;
  const value = request.query.browse;
  return Array.isArray(value) ? value.map(String).join("/") : String(value || "");
}

function decadeRange(value: string) {
  const match = value.match(/(19|20)\d0/);
  if (!match) return null;
  const start = Number(match[0]);
  return { start, end: start + 9, title: `${start}s` };
}

function hubConfig(kind: string, key: string) {
  if (kind === "genre") {
    const config = genreHubs.find((item) => item.key === key || normalize(item.title) === normalize(key));
    return {
      title: config?.title || slugToTitle(key),
      aliases: config?.aliases || [slugToTitle(key), key],
      description: `Explore ${config?.title || slugToTitle(key)} titles, playlists, collections, and curators.`,
    };
  }
  if (kind === "decade") {
    const range = decadeRange(key);
    return {
      title: range?.title || slugToTitle(key),
      aliases: [range?.title || key, key],
      range,
      description: `Browse movies, TV, and playlists from the ${range?.title || slugToTitle(key)}.`,
    };
  }
  const config = franchiseHubs.find((item) => item.key === key || normalize(item.title) === normalize(key));
  return {
    title: config?.title || slugToTitle(key),
    aliases: config?.aliases || [slugToTitle(key), key],
    collectionSlug: config?.collectionSlug,
    description: `Explore ${config?.title || slugToTitle(key)} titles, collections, playlists, and curators.`,
  };
}

function patterns(aliases: string[]) {
  return aliases.map((alias) => `%${normalize(alias)}%`);
}

function mapTitle(row: any) {
  const genres = Array.isArray(row.genres) ? row.genres : [];
  return {
    tmdbId: Number(row.tmdb_id),
    mediaType: row.media_type === "tv" ? "tv" : "movie",
    title: row.title,
    releaseDate: row.release_date || undefined,
    releaseYear: row.year || (row.release_date ? String(row.release_date).slice(0, 4) : undefined),
    overview: row.overview || "",
    posterUrl: row.poster_url || undefined,
    genreIds: [],
    genres,
  };
}

async function titlesForHub(sql: any, kind: string, config: any) {
  if (kind === "decade" && config.range) {
    const rows = await sql`
      select media_type, tmdb_id, title, overview, poster_url, release_date, year, genres, popularity
      from media_items
      where (
        extract(year from release_date)::int between ${config.range.start} and ${config.range.end}
        or (case when year ~ '^[0-9]{4}$' then year::int end) between ${config.range.start} and ${config.range.end}
      )
      order by coalesce(popularity, 0) desc, title asc
      limit 24
    `;
    return rows.map(mapTitle);
  }

  const searchPatterns = patterns(config.aliases || [config.title]);
  const rows = await sql`
    select media_type, tmdb_id, title, overview, poster_url, release_date, year, genres, popularity
    from media_items
    where
      lower(title) like any(${searchPatterns})
      or lower(coalesce(overview, '')) like any(${searchPatterns})
      or lower(coalesce(genres::text, '')) like any(${searchPatterns})
    order by coalesce(popularity, 0) desc, title asc
    limit 24
  `;
  return rows.map(mapTitle);
}

async function playlistsForHub(sql: any, kind: string, config: any, userId?: string) {
  const searchPatterns = patterns(config.aliases || [config.title]);
  const decade = kind === "decade" ? config.range : null;
  const rows = await sql`
    select
      p.*,
      up.handle as creator_handle,
      coalesce(nullif(up.display_name, ''), nullif(initcap(trim(regexp_replace(split_part(u.email, '@', 1), '[^a-zA-Z0-9]+', ' ', 'g'))), '')) as creator_display_name,
      false as is_owner,
      false as expose_shared_slug,
      (select count(*)::int from playlist_follows pf where pf.playlist_id = p.id) as follower_count,
      (select count(*)::int from playlist_likes pl where pl.playlist_id = p.id) as like_count,
      exists (
        select 1 from playlist_follows my_pf
        where my_pf.playlist_id = p.id
          and ${userId || null}::uuid is not null
          and my_pf.follower_user_id = ${userId || null}::uuid
      ) as is_following,
      exists (
        select 1 from playlist_likes my_pl
        where my_pl.playlist_id = p.id
          and ${userId || null}::uuid is not null
          and my_pl.user_id = ${userId || null}::uuid
      ) as is_liked,
      coalesce(json_agg(pm order by coalesce(pm.sort_order, 2147483647), pm.added_at desc) filter (where pm.id is not null), '[]') as movies
    from playlists p
    left join user_profiles up on up.user_id = p.owner_user_id::text
    left join users u on u.id = p.owner_user_id
    left join playlist_movies pm on pm.playlist_id = p.id
    left join media_items mi on mi.media_type = coalesce(pm.media_type, 'movie') and mi.tmdb_id = pm.tmdb_id
    where p.visibility = 'public'
      and (
        lower(p.name) like any(${searchPatterns})
        or lower(coalesce(p.description, '')) like any(${searchPatterns})
        or lower(coalesce(up.display_name, '')) like any(${searchPatterns})
        or lower(coalesce(pm.title, '')) like any(${searchPatterns})
        or lower(coalesce(mi.genres::text, '')) like any(${searchPatterns})
        or (
          ${decade?.start || null}::int is not null
          and (
            (case when pm.year ~ '^[0-9]{4}$' then pm.year::int end) between ${decade?.start || null}::int and ${decade?.end || null}::int
            or extract(year from mi.release_date)::int between ${decade?.start || null}::int and ${decade?.end || null}::int
          )
        )
      )
    group by p.id, up.handle, up.display_name, u.email
    order by like_count desc, follower_count desc, p.updated_at desc
    limit 12
  `;
  return rows.map((row: any) => mapPlaylist(row, row.movies || []));
}

async function curatorsForHub(sql: any, config: any) {
  const searchPatterns = patterns(config.aliases || [config.title]);
  const rows = await sql`
    select
      up.display_name,
      up.handle,
      up.bio,
      up.avatar_key,
      up.avatar_customization,
      up.profile_image_url,
      count(distinct p.id)::int as playlist_count,
      count(pm.id)::int as title_count,
      (select count(*)::int from user_follows uf where uf.followed_user_id::text = up.user_id) as follower_count
    from user_profiles up
    left join playlists p on p.owner_user_id::text = up.user_id and p.visibility = 'public'
    left join playlist_movies pm on pm.playlist_id = p.id
    left join media_items mi on mi.media_type = coalesce(pm.media_type, 'movie') and mi.tmdb_id = pm.tmdb_id
    where up.handle <> ''
      and (
        lower(up.handle) like any(${searchPatterns})
        or lower(up.display_name) like any(${searchPatterns})
        or lower(coalesce(up.bio, '')) like any(${searchPatterns})
        or lower(coalesce(p.name, '')) like any(${searchPatterns})
        or lower(coalesce(pm.title, '')) like any(${searchPatterns})
        or lower(coalesce(mi.genres::text, '')) like any(${searchPatterns})
      )
    group by up.id
    order by count(distinct p.id) desc, follower_count desc, up.updated_at desc
    limit 8
  `;
  return rows.map((row: any) => ({
    displayName: row.display_name || row.handle,
    handle: row.handle,
    bio: row.bio || "",
    avatarKey: row.avatar_key || "director",
    avatarCustomization: row.avatar_customization && typeof row.avatar_customization === "object" ? row.avatar_customization : {},
    profileImageUrl: row.profile_image_url || "",
    playlistCount: Number(row.playlist_count || 0),
    titleCount: Number(row.title_count || 0),
    followerCount: Number(row.follower_count || 0),
  }));
}

async function collectionsForHub(sql: any, config: any) {
  const searchPatterns = patterns(config.aliases || [config.title]);
  const rows = await sql`
    select
      mc.slug,
      mc.title,
      mc.overview,
      mc.poster_url,
      mc.backdrop_url,
      mc.category,
      count(mci.id)::int as title_count,
      count(mci.id) filter (where mci.media_type = 'movie')::int as movie_count,
      count(mci.id) filter (where mci.media_type = 'tv')::int as tv_count
    from media_collections mc
    left join media_collection_items mci on mci.collection_id = mc.id
    where
      mc.slug = ${config.collectionSlug || ""}
      or lower(mc.title) like any(${searchPatterns})
      or lower(coalesce(mc.category, '')) like any(${searchPatterns})
      or lower(coalesce(mc.overview, '')) like any(${searchPatterns})
      or lower(coalesce(mci.title, '')) like any(${searchPatterns})
    group by mc.id
    order by title_count desc, mc.updated_at desc
    limit 8
  `;
  return rows.map((row: any) => ({
    slug: row.slug,
    title: row.title,
    overview: row.overview || "",
    posterUrl: row.poster_url || "",
    backdropUrl: row.backdrop_url || "",
    category: row.category || "",
    titleCount: Number(row.title_count || 0),
    movieCount: Number(row.movie_count || 0),
    tvCount: Number(row.tv_count || 0),
  }));
}

async function safe<T>(fallback: T, work: Promise<T>) {
  try {
    return await work;
  } catch (error) {
    const message = error instanceof Error ? error.message : String((error as any)?.message || "");
    if (message.includes("does not exist") || message.includes("relation") || message.includes("column")) return fallback;
    throw error;
  }
}

export default async function handler(request: any, response: any) {
  if (request.method !== "GET") return sendJson(response, 405, { error: "Method not allowed." });

  try {
    const path = hubPath(request);
    const [kind = "", rawKey = ""] = path.split("/");
    const key = rawKey.trim().toLowerCase();
    if (!["genre", "decade", "franchise"].includes(kind) || !key) {
      return sendJson(response, 400, { error: "A valid discovery hub is required." });
    }

    const sql = db();
    await ensureUserProfilesTable(sql);
    await ensurePlaylistFollowsTable(sql);
    await ensurePlaylistLikesTable(sql);
    await ensureUserFollowsTable(sql);
    const user = await getCurrentUser(sql, request);
    const config = hubConfig(kind, key);
    const [titles, playlists, profiles, collections] = await Promise.all([
      safe([], titlesForHub(sql, kind, config)),
      safe([], playlistsForHub(sql, kind, config, user?.id)),
      safe([], curatorsForHub(sql, config)),
      safe([], collectionsForHub(sql, config)),
    ]);

    return sendJson(response, 200, {
      kind,
      key,
      title: config.title,
      description: config.description,
      titles,
      playlists,
      profiles,
      collections,
      relatedHubs: {
        genres: genreHubs.filter((hub) => hub.key !== key).slice(0, 6).map((hub) => ({
          kind: "genre",
          key: hub.key,
          title: hub.title,
          path: `/genre/${hub.key}`,
        })),
        decades: ["1970s", "1980s", "1990s", "2000s", "2010s", "2020s"].map((title) => ({ kind: "decade", key: title.toLowerCase(), title, path: `/decade/${title.toLowerCase()}` })),
        franchises: franchiseHubs.filter((hub) => hub.key !== key).slice(0, 6).map((hub) => ({
          kind: "franchise",
          key: hub.key,
          title: hub.title,
          path: `/franchise/${hub.key}`,
        })),
      },
    });
  } catch (error) {
    console.error("discovery_browse_failed", error instanceof Error ? error.message : "Discovery browse failed.");
    return sendJson(response, 500, { error: "Discovery hub is unavailable right now." });
  }
}
