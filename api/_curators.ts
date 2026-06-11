import {
  ensurePlaylistFollowsTable,
  ensurePlaylistLikesTable,
  ensureUserFollowsTable,
  ensureUserProfilesTable,
  mapPlaylist,
} from "./_db.js";

const discoveryGenres = [
  { name: "Anime", terms: ["anime", "animation", "animated"] },
  { name: "Horror", terms: ["horror", "scary", "slasher", "ghost"] },
  { name: "Sci-Fi", terms: ["sci-fi", "science fiction", "space", "future"] },
  { name: "Comedy", terms: ["comedy", "funny", "comedies"] },
  { name: "Action", terms: ["action", "adventure", "superhero"] },
  { name: "Documentary", terms: ["documentary", "docuseries"] },
  { name: "Family", terms: ["family", "kids", "children"] },
  { name: "Disaster Movies", terms: ["disaster", "storm", "earthquake", "apocalypse"] },
];

function normalize(value: unknown) {
  return String(value || "").toLowerCase();
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function curatorScore(curator: any) {
  const stats = curator.stats || {};
  return (
    Number(stats.followerCount || 0) * 5 +
    Number(stats.playlistFollowerCount || 0) * 4 +
    Number(stats.playlistLikeCount || 0) * 3 +
    Number(stats.playlistCount || 0) * 2 +
    Math.min(Number(stats.titleCount || 0), 250)
  );
}

function recentActivityScore(curator: any) {
  const latest = curator.stats?.latestPlaylistUpdatedAt ? new Date(curator.stats.latestPlaylistUpdatedAt).getTime() : 0;
  const daysAgo = latest ? Math.max(0, (Date.now() - latest) / 86400000) : 999;
  return curator.trustScore + Math.max(0, 30 - daysAgo);
}

function mapCurator(row: any) {
  const publicPlaylists = Array.isArray(row.public_playlists)
    ? row.public_playlists.map((playlist: any) => mapPlaylist(playlist, playlist.movies || []))
    : [];
  const featuredPlaylist = row.featured_playlist ? mapPlaylist(row.featured_playlist, row.featured_playlist.movies || []) : undefined;
  const favoriteGenres = unique([
    row.favorite_genre || "",
    ...(Array.isArray(row.inferred_genres) ? row.inferred_genres : []),
  ]).slice(0, 5);

  const curator = {
    displayName: row.display_name || row.handle,
    handle: row.handle,
    bio: row.bio || "",
    avatarKey: row.avatar_key || "director",
    avatarCustomization: row.avatar_customization && typeof row.avatar_customization === "object" ? row.avatar_customization : {},
    profileImageUrl: row.profile_image_url || "",
    heroImageUrl: row.hero_image_url || "",
    isFollowing: Boolean(row.is_following),
    joinedAt: row.created_at,
    favoriteGenres,
    stats: {
      playlistCount: Number(row.playlist_count || 0),
      titleCount: Number(row.title_count || 0),
      followerCount: Number(row.follower_count || 0),
      followingCount: Number(row.following_count || 0),
      playlistFollowerCount: Number(row.playlist_follower_count || 0),
      playlistLikeCount: Number(row.playlist_like_count || 0),
      latestPlaylistUpdatedAt: row.latest_playlist_updated_at || undefined,
    },
    featuredPlaylist,
    publicPlaylists,
    trustBadges: row.handle === "the-director" ? ["Flim Editorial Curator"] : [],
  };

  return {
    ...curator,
    trustScore: curatorScore(curator),
  };
}

function matchesGenre(curator: any, terms: string[]) {
  const haystack = normalize([
    curator.displayName,
    curator.handle,
    curator.bio,
    curator.favoriteGenres?.join(" "),
    curator.publicPlaylists?.map((playlist: any) => `${playlist.name} ${playlist.description} ${playlist.movies?.map((movie: any) => movie.title).join(" ")}`).join(" "),
  ].join(" "));
  return terms.some((term) => haystack.includes(term));
}

function matchesQuery(curator: any, query: string) {
  const normalized = normalize(query).trim();
  if (!normalized) return true;
  const terms = normalized.split(/\s+/).filter(Boolean);
  const haystack = normalize([
    curator.displayName,
    curator.handle,
    curator.bio,
    curator.favoriteGenres?.join(" "),
    curator.publicPlaylists?.map((playlist: any) => `${playlist.name} ${playlist.description} ${playlist.movies?.map((movie: any) => `${movie.title} ${movie.overview}`).join(" ")}`).join(" "),
  ].join(" "));
  return terms.every((term) => haystack.includes(term));
}

export async function getCuratorDiscovery(sql: any, viewerUserId?: string | null, query = "") {
  await ensureUserProfilesTable(sql);
  await ensureUserFollowsTable(sql);
  await ensurePlaylistFollowsTable(sql);
  await ensurePlaylistLikesTable(sql);

  const rows = await sql`
    select
      up.*,
      exists (
        select 1
        from user_follows uf
        where uf.follower_user_id = ${viewerUserId || null}::uuid
          and uf.followed_user_id::text = up.user_id
      ) as is_following,
      (select count(*)::int from user_follows uf where uf.followed_user_id::text = up.user_id) as follower_count,
      (select count(*)::int from user_follows uf where uf.follower_user_id::text = up.user_id) as following_count,
      coalesce(profile_stats.playlist_count, 0)::int as playlist_count,
      coalesce(profile_stats.title_count, 0)::int as title_count,
      coalesce(profile_stats.playlist_follower_count, 0)::int as playlist_follower_count,
      coalesce(profile_stats.playlist_like_count, 0)::int as playlist_like_count,
      profile_stats.latest_playlist_updated_at,
      coalesce(profile_stats.inferred_genres, array[]::text[]) as inferred_genres,
      featured_playlist.playlist as featured_playlist,
      coalesce(public_playlists.playlists, '[]'::jsonb) as public_playlists
    from user_profiles up
    left join lateral (
      select
        count(*)::int as playlist_count,
        coalesce(sum(playlist_metrics.title_count), 0)::int as title_count,
        coalesce(sum(playlist_metrics.follower_count), 0)::int as playlist_follower_count,
        coalesce(sum(playlist_metrics.like_count), 0)::int as playlist_like_count,
        max(playlist_metrics.updated_at) as latest_playlist_updated_at,
        array[]::text[] as inferred_genres
      from (
        select
          p.id,
          p.updated_at,
          count(pm.id)::int as title_count,
          (select count(*)::int from playlist_follows pf where pf.playlist_id = p.id) as follower_count,
          (select count(*)::int from playlist_likes pl where pl.playlist_id = p.id) as like_count
        from playlists p
        left join playlist_movies pm on pm.playlist_id = p.id
        where p.owner_user_id::text = up.user_id
          and p.visibility = 'public'
          and not (
            lower(p.name) like '%codex vercel curl add test%'
            or lower(p.name) like '%temporary production verification%'
            or lower(p.name) like '%production verification playlist%'
          )
        group by p.id
      ) playlist_metrics
    ) profile_stats on true
    left join lateral (
      select to_jsonb(featured.*) || jsonb_build_object(
        'creator_handle', up.handle,
        'creator_display_name', up.display_name,
        'is_owner', false,
        'expose_shared_slug', false,
        'follower_count', featured.follower_count,
        'like_count', featured.like_count,
        'movies', coalesce(featured_movies.movies, '[]'::jsonb)
      ) as playlist
      from (
        select
          p.*,
          (select count(*)::int from playlist_follows pf where pf.playlist_id = p.id) as follower_count,
          (select count(*)::int from playlist_likes pl where pl.playlist_id = p.id) as like_count
        from playlists p
        where p.owner_user_id::text = up.user_id
          and p.visibility = 'public'
        order by like_count desc, follower_count desc, p.updated_at desc
        limit 1
      ) featured
      left join lateral (
        select jsonb_agg(to_jsonb(pm) order by coalesce(pm.sort_order, 2147483647), pm.added_at desc) as movies
        from playlist_movies pm
        where pm.playlist_id = featured.id
      ) featured_movies on true
    ) featured_playlist on true
    left join lateral (
      select jsonb_agg(to_jsonb(public_playlist.*) || jsonb_build_object(
        'creator_handle', up.handle,
        'creator_display_name', up.display_name,
        'is_owner', false,
        'expose_shared_slug', false,
        'follower_count', public_playlist.follower_count,
        'like_count', public_playlist.like_count,
        'movies', coalesce(public_movies.movies, '[]'::jsonb)
      ) order by public_playlist.updated_at desc) as playlists
      from (
        select
          p.*,
          (select count(*)::int from playlist_follows pf where pf.playlist_id = p.id) as follower_count,
          (select count(*)::int from playlist_likes pl where pl.playlist_id = p.id) as like_count
        from playlists p
        where p.owner_user_id::text = up.user_id
          and p.visibility = 'public'
        order by p.updated_at desc
        limit 8
      ) public_playlist
      left join lateral (
        select jsonb_agg(to_jsonb(pm) order by coalesce(pm.sort_order, 2147483647), pm.added_at desc) as movies
        from playlist_movies pm
        where pm.playlist_id = public_playlist.id
      ) public_movies on true
    ) public_playlists on true
    where up.handle <> ''
      and coalesce(profile_stats.playlist_count, 0) > 0
    order by profile_stats.playlist_count desc, profile_stats.latest_playlist_updated_at desc nulls last
    limit 80
  `;

  const curators = rows.map(mapCurator).filter((curator: any) => matchesQuery(curator, query));
  const byTrust = [...curators].sort((a, b) => b.trustScore - a.trustScore || (b.stats.latestPlaylistUpdatedAt || "").localeCompare(a.stats.latestPlaylistUpdatedAt || ""));
  const byFollowers = [...curators].sort((a, b) =>
    (b.stats.followerCount + b.stats.playlistFollowerCount) - (a.stats.followerCount + a.stats.playlistFollowerCount) ||
    b.trustScore - a.trustScore,
  );
  const byLikes = [...curators].sort((a, b) => b.stats.playlistLikeCount - a.stats.playlistLikeCount || b.trustScore - a.trustScore);
  const byRecent = [...curators].sort((a, b) => recentActivityScore(b) - recentActivityScore(a));
  const byRising = [...curators].sort((a, b) =>
    (b.stats.playlistFollowerCount + b.stats.playlistLikeCount + b.stats.playlistCount) -
    (a.stats.playlistFollowerCount + a.stats.playlistLikeCount + a.stats.playlistCount) ||
    recentActivityScore(b) - recentActivityScore(a),
  );

  return {
    query,
    curators: byTrust,
    sections: {
      topCurators: byTrust.slice(0, 12),
      trendingCurators: byRecent.slice(0, 12),
      risingCurators: byRising.slice(0, 12),
      mostFollowedCurators: byFollowers.slice(0, 12),
      mostLikedCurators: byLikes.slice(0, 12),
      recentlyFeaturedCurators: byTrust.filter((curator) => curator.trustBadges.length > 0).slice(0, 12),
    },
    genres: discoveryGenres
      .map((genre) => ({
        name: genre.name,
        curators: byTrust.filter((curator) => matchesGenre(curator, genre.terms)).slice(0, 8),
      }))
      .filter((genre) => genre.curators.length > 0),
    generatedAt: new Date().toISOString(),
  };
}
