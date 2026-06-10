import {
  db,
  clearSessionCookie,
  createSessionToken,
  ensureAuthTables,
  ensureNotificationsTable,
  ensurePlaylistFollowsTable,
  ensureUserFollowsTable,
  ensureUserProfilesTable,
  getCurrentUser,
  hashPassword,
  hashSessionToken,
  mapCurrentUser,
  mapPublicUserProfile,
  mapUserProfile,
  normalizeEmail,
  normalizeHandle,
  readBody,
  sendJson,
  setSessionCookie,
  validateProfileHandle,
  verifyPassword,
} from "../_db.js";
import { directorHandle, ensureDirectorSeed } from "../_director.js";

const defaultProfile = {
  displayName: "",
  handle: "",
  bio: "",
  countryCode: "",
  region: "",
  postalCode: "",
  streamingRegion: "",
  preferredProviders: [],
  showCountryPublicly: false,
};

const exportSchemaVersion = "2026-06-01-neon-hardening";

async function safeRows(query: Promise<any[]>) {
  try {
    return await query;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("does not exist")) return [];
    throw error;
  }
}

function cleanProfileInput(body: any) {
  return {
    displayName: String(body.displayName || "").trim().slice(0, 80),
    handle: normalizeHandle(String(body.handle || "")).replace(/[^a-z0-9_]/g, ""),
    bio: String(body.bio || "").trim().slice(0, 240),
    countryCode: String(body.countryCode || "").trim().toUpperCase().slice(0, 2),
    provinceState: String(body.provinceState || body.region || "").trim().slice(0, 80),
    postalCode: String(body.postalCode || "").trim().slice(0, 20),
    streamingRegion: String(body.streamingRegion || "").trim().slice(0, 80),
    preferredProviders: Array.isArray(body.preferredProviders)
      ? body.preferredProviders.map((provider: unknown) => String(provider)).filter(Boolean).slice(0, 20)
      : [],
    showCountryPublicly: Boolean(body.showCountryPublicly),
    profileImageUrl: String(body.profileImageUrl || "").trim().slice(0, 500),
    heroImageUrl: String(body.heroImageUrl || "").trim().slice(0, 500),
    favoriteMovie: String(body.favoriteMovie || "").trim().slice(0, 120),
    favoriteGenre: String(body.favoriteGenre || "").trim().slice(0, 80),
    favoriteDirector: String(body.favoriteDirector || "").trim().slice(0, 120),
  };
}

function cleanSignupHandle(value: string) {
  return normalizeHandle(value).replace(/[^a-z0-9_]/g, "");
}

function getProfileSegment(request: any) {
  const pathname = new URL(request.url || "", "https://www.flim.ca").pathname;
  if (pathname === "/api/admin/export") return "admin/export";
  const pathSegment = pathname.split("/api/profiles/").pop()?.split("?")[0];
  if (pathSegment && pathSegment !== pathname) return pathSegment;

  const value = request.query.profile;
  const raw = Array.isArray(value) ? value.map(String).join("/") : String(value || "");
  const querySegment = raw.split("/").filter(Boolean).join("/");
  return querySegment;
}

async function handleCurrentProfile(request: any, response: any, sql: any) {
  const user = await getCurrentUser(sql, request);
  if (!user) return sendJson(response, 401, { error: "Sign in to manage your profile." });

  if (request.method === "GET") {
    const rows = await sql`select * from user_profiles where user_id = ${user.id}::text limit 1`;
    return sendJson(response, 200, rows[0] ? mapUserProfile(rows[0]) : defaultProfile);
  }

  if (request.method === "PUT") {
    const input = cleanProfileInput(await readBody(request));
    const validationMessage = validateProfileHandle(input.handle);

    if (validationMessage) {
      return sendJson(response, 400, { error: validationMessage });
    }

    const duplicate = await sql`
      select id from user_profiles
      where handle = ${input.handle} and user_id <> ${user.id}::text
      limit 1
    `;

    if (duplicate[0]) {
      return sendJson(response, 409, { error: "That username is already taken." });
    }

    const [profile] = await sql`
      insert into user_profiles (
        user_id,
        display_name,
        handle,
        bio,
        country_code,
        province_state,
        region,
        postal_code,
        streaming_region,
        preferred_providers,
        show_country_publicly,
        profile_image_url,
        hero_image_url,
        favorite_movie,
        favorite_genre,
        favorite_director
      )
      values (
          ${user.id},
        ${input.displayName},
        ${input.handle},
        ${input.bio},
        ${input.countryCode},
        ${input.provinceState},
        ${input.provinceState},
        ${input.postalCode},
        ${input.streamingRegion},
        ${JSON.stringify(input.preferredProviders)}::jsonb,
        ${input.showCountryPublicly},
        ${input.profileImageUrl || null},
        ${input.heroImageUrl || null},
        ${input.favoriteMovie || null},
        ${input.favoriteGenre || null},
        ${input.favoriteDirector || null}
      )
      on conflict (user_id) do update set
        display_name = excluded.display_name,
        handle = excluded.handle,
        bio = excluded.bio,
        country_code = excluded.country_code,
        province_state = excluded.province_state,
        region = excluded.region,
        postal_code = excluded.postal_code,
        streaming_region = excluded.streaming_region,
        preferred_providers = excluded.preferred_providers,
        show_country_publicly = excluded.show_country_publicly,
        profile_image_url = excluded.profile_image_url,
        hero_image_url = excluded.hero_image_url,
        favorite_movie = excluded.favorite_movie,
        favorite_genre = excluded.favorite_genre,
        favorite_director = excluded.favorite_director,
        updated_at = now()
      returning *
    `;

    return sendJson(response, 200, mapUserProfile(profile));
  }

  return sendJson(response, 405, { error: "Method not allowed." });
}

async function createSession(sql: any, response: any, userId: string) {
  const token = createSessionToken();
  await sql`
    insert into user_sessions (user_id, token_hash, expires_at)
    values (${userId}, ${hashSessionToken(token)}, now() + interval '30 days')
  `;
  setSessionCookie(response, token);
}

async function getUserPayload(sql: any, user: any) {
  const profiles = await sql`select * from user_profiles where user_id = ${user.id}::text limit 1`;
  return mapCurrentUser(user, profiles[0]);
}

async function handleAuth(request: any, response: any, sql: any, action: string) {
  await ensureAuthTables(sql);
  await ensureUserProfilesTable(sql);

  if (action === "session" && request.method === "GET") {
    const user = await getCurrentUser(sql, request);
    if (!user) return sendJson(response, 200, { user: null });
    return sendJson(response, 200, { user: await getUserPayload(sql, user) });
  }

  if (action === "logout" && request.method === "POST") {
    const token = request.headers?.cookie ? request.headers.cookie.match(/flim_session=([^;]+)/)?.[1] : "";
    if (token) await sql`delete from user_sessions where token_hash = ${hashSessionToken(decodeURIComponent(token))}`;
    clearSessionCookie(response);
    return sendJson(response, 200, { ok: true });
  }

  if ((action === "signup" || action === "signin") && request.method === "POST") {
    const body = await readBody(request);
    const email = normalizeEmail(String(body.email || ""));
    const password = String(body.password || "");

    if (!email.includes("@")) return sendJson(response, 400, { error: "Enter a valid email address." });
    if (password.length < 8) return sendJson(response, 400, { error: "Password must be at least 8 characters." });

    if (action === "signup") {
      const handle = cleanSignupHandle(String(body.handle || body.username || ""));
      const displayName = String(body.displayName || "").trim().slice(0, 80) || handle;
      const validationMessage = validateProfileHandle(handle);
      if (validationMessage) return sendJson(response, 400, { error: validationMessage });

      const duplicateHandle = await sql`select id from user_profiles where handle = ${handle} limit 1`;
      if (duplicateHandle[0]) return sendJson(response, 409, { error: "That username is already taken." });

      const [user] = await sql`
        insert into users (email, password_hash)
        values (${email}, ${hashPassword(password)})
        returning id, email, created_at
      `.catch((error: any) => {
        if (String(error?.message || "").includes("duplicate key")) return [];
        throw error;
      });
      if (!user) return sendJson(response, 409, { error: "An account already exists for that email." });

      await sql`
        insert into user_profiles (user_id, display_name, handle)
        values (${user.id}, ${displayName}, ${handle})
      `;

      await createSession(sql, response, user.id);
      return sendJson(response, 201, { user: await getUserPayload(sql, user) });
    }

    const users = await sql`select id, email, password_hash, created_at from users where email = ${email} limit 1`;
    const user = users[0];
    if (!user || !verifyPassword(password, user.password_hash)) {
      return sendJson(response, 401, { error: "Email or password is incorrect." });
    }

    await createSession(sql, response, user.id);
    return sendJson(response, 200, { user: await getUserPayload(sql, user) });
  }

  return sendJson(response, 405, { error: "Method not allowed." });
}

async function handleUsernameAvailability(request: any, response: any, sql: any) {
  if (request.method !== "GET") return sendJson(response, 405, { error: "Method not allowed." });
  const handle = cleanSignupHandle(Array.isArray(request.query.handle) ? String(request.query.handle[0] || "") : String(request.query.handle || ""));
  const validationMessage = validateProfileHandle(handle);
  if (validationMessage) return sendJson(response, 200, { handle, available: false, message: validationMessage });

  const rows = await sql`select id from user_profiles where handle = ${handle} limit 1`;
  return sendJson(response, 200, {
    handle,
    available: !rows[0],
    message: rows[0] ? "That username is already taken." : "Username available.",
  });
}

async function handleFollowProfile(request: any, response: any, sql: any) {
  const user = await getCurrentUser(sql, request);
  if (!user) return sendJson(response, 401, { error: "Sign in to follow creators." });

  const body = await readBody(request);
  const handle = normalizeHandle(String(body.handle || ""));
  const targetRows = await sql`
    select user_id
    from user_profiles
    where handle = ${handle}
    limit 1
  `;
  const target = targetRows[0];
  if (!target) return sendJson(response, 404, { error: "Profile not found." });
  if (String(target.user_id) === String(user.id)) return sendJson(response, 400, { error: "You cannot follow your own profile." });
  if (!/^[0-9a-f-]{36}$/i.test(String(target.user_id))) {
    return sendJson(response, 400, { error: "This profile cannot be followed yet." });
  }

  if (request.method === "POST") {
    await sql`
      insert into user_follows (follower_user_id, followed_user_id)
      values (${user.id}, ${target.user_id}::uuid)
      on conflict (follower_user_id, followed_user_id) do nothing
    `;
  } else if (request.method === "DELETE") {
    await sql`
      delete from user_follows
      where follower_user_id = ${user.id}
        and followed_user_id = ${target.user_id}::uuid
    `;
  } else {
    return sendJson(response, 405, { error: "Method not allowed." });
  }

  const counts = await sql`
    select
      (select count(*)::int from user_follows where followed_user_id = ${target.user_id}::uuid) as follower_count,
      (select count(*)::int from user_follows where follower_user_id = ${target.user_id}::uuid) as following_count,
      exists (
        select 1
        from user_follows
        where follower_user_id = ${user.id}
          and followed_user_id = ${target.user_id}::uuid
      ) as is_following
  `;

  return sendJson(response, 200, {
    ok: true,
    isFollowing: Boolean(counts[0]?.is_following),
    followerCount: Number(counts[0]?.follower_count || 0),
    followingCount: Number(counts[0]?.following_count || 0),
  });
}

async function handleAdminExport(request: any, response: any, sql: any) {
  if (request.method !== "GET") return sendJson(response, 405, { error: "Method not allowed." });

  const providedSecret = String(request.headers?.["x-admin-export-secret"] || "");
  const expectedSecret = process.env.ADMIN_EXPORT_SECRET?.trim();
  if (!providedSecret || !expectedSecret || providedSecret !== expectedSecret) {
    return sendJson(response, 401, { error: "Unauthorized." });
  }

  const [
    playlists,
    playlistMovies,
    users,
    userProfiles,
    playlistFollows,
    notifications,
    tmdbSearchCache,
    tmdbMovieCache,
  ] = await Promise.all([
    safeRows(sql`select * from playlists order by updated_at desc`),
    safeRows(sql`select * from playlist_movies order by added_at desc`),
    safeRows(sql`select id, email, created_at from users order by created_at desc`),
    safeRows(sql`select * from user_profiles order by updated_at desc`),
    safeRows(sql`select * from playlist_follows order by created_at desc`),
    safeRows(sql`select * from notifications order by created_at desc`),
    safeRows(sql`select * from tmdb_search_cache order by created_at desc`),
    safeRows(sql`select * from tmdb_movie_cache order by created_at desc`),
  ]);

  return sendJson(response, 200, {
    generated_at: new Date().toISOString(),
    schema_version: exportSchemaVersion,
    table_counts: {
      playlists: playlists.length,
      playlist_movies: playlistMovies.length,
      users: users.length,
      user_profiles: userProfiles.length,
      playlist_follows: playlistFollows.length,
      notifications: notifications.length,
      tmdb_search_cache: tmdbSearchCache.length,
      tmdb_movie_cache: tmdbMovieCache.length,
    },
    data: {
      playlists,
      playlist_movies: playlistMovies,
      users,
      user_profiles: userProfiles,
      playlist_follows: playlistFollows,
      notifications,
      tmdb_search_cache: tmdbSearchCache,
      tmdb_movie_cache: tmdbMovieCache,
    },
  });
}

export default async function handler(request: any, response: any) {
  try {
    const segment = getProfileSegment(request);
    const sql = db();
    await ensureUserProfilesTable(sql);
    await ensurePlaylistFollowsTable(sql);
    await ensureUserFollowsTable(sql);
    await ensureNotificationsTable(sql);

    if (segment === "auth") {
      const action = Array.isArray(request.query.action) ? request.query.action[0] : request.query.action;
      return handleAuth(request, response, sql, String(action || ""));
    }

    if (segment === "username") {
      return handleUsernameAvailability(request, response, sql);
    }

    if (segment === "follow") {
      return handleFollowProfile(request, response, sql);
    }

    if (segment === "admin-export" || segment === "admin/export") {
      return handleAdminExport(request, response, sql);
    }

    if (segment === "me") {
      return handleCurrentProfile(request, response, sql);
    }

    if (request.method !== "GET") {
      return sendJson(response, 405, { error: "Method not allowed." });
    }

    const viewer = await getCurrentUser(sql, request);
    const handle = normalizeHandle(segment);
    const validationMessage = validateProfileHandle(handle);
    if (validationMessage) return sendJson(response, 404, { error: "Profile not found." });

    if (handle === directorHandle) {
      await ensureDirectorSeed(sql).catch((error) => {
        console.error("director_seed_failed", error instanceof Error ? error.message : "Director seed failed");
      });
    }

    const rows = await sql`
      select
        up.*,
        ${viewer?.id || ""} = up.user_id as is_own_profile,
        exists (
          select 1
          from user_follows uf
          where uf.follower_user_id = ${viewer?.id || null}::uuid
            and uf.followed_user_id::text = up.user_id
        ) as is_following,
        json_build_object(
          'playlistCount', count(distinct p.id)::int,
          'movieCount', count(pm.id)::int,
          'followerCount', (select count(*)::int from user_follows uf where uf.followed_user_id::text = up.user_id),
          'followingCount', (select count(*)::int from user_follows uf where uf.follower_user_id::text = up.user_id)
        ) as stats,
        coalesce(
          json_agg(
            distinct jsonb_build_object(
              'id', p.id,
              'public_slug', p.public_slug,
              'name', p.name,
              'description', p.description,
              'visibility', p.visibility,
              'creator_handle', up.handle,
              'creator_display_name', up.display_name,
              'is_owner', false,
              'follower_count', coalesce(follower_rows.follower_count, 0),
              'created_at', p.created_at,
              'updated_at', p.updated_at,
              'movies', coalesce(movie_rows.movies, '[]'::jsonb)
            )
          ) filter (where p.id is not null),
          '[]'
        ) as public_playlists
      from user_profiles up
      left join playlists p on p.owner_user_id::text = up.user_id and p.visibility = 'public'
      left join playlist_movies pm on pm.playlist_id = p.id
      left join lateral (
        select jsonb_agg(to_jsonb(pm2) order by coalesce(pm2.sort_order, 2147483647), pm2.added_at desc) as movies
        from playlist_movies pm2
        where pm2.playlist_id = p.id
      ) movie_rows on true
      left join lateral (
        select count(*)::int as follower_count
        from playlist_follows pf
        where pf.playlist_id = p.id
      ) follower_rows on true
      where up.handle = ${handle}
      group by up.id
      limit 1
    `;
    if (!rows[0]) return sendJson(response, 404, { error: "Profile not found." });

    return sendJson(response, 200, mapPublicUserProfile(rows[0]));
  } catch (error) {
    return sendJson(response, 500, { error: error instanceof Error ? error.message : "Profile request failed." });
  }
}
