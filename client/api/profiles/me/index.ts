import {
  db,
  demoUserId,
  ensureUserProfilesTable,
  mapUserProfile,
  normalizeHandle,
  readBody,
  sendJson,
  validateProfileHandle,
} from "../../_db.js";

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

function cleanProfileInput(body: any) {
  return {
    displayName: String(body.displayName || "").trim().slice(0, 80),
    handle: normalizeHandle(String(body.handle || "")),
    bio: String(body.bio || "").trim().slice(0, 240),
    countryCode: String(body.countryCode || "").trim().toUpperCase().slice(0, 2),
    region: String(body.region || "").trim().slice(0, 80),
    postalCode: String(body.postalCode || "").trim().slice(0, 20),
    streamingRegion: String(body.streamingRegion || "").trim().slice(0, 80),
    preferredProviders: Array.isArray(body.preferredProviders)
      ? body.preferredProviders.map((provider: unknown) => String(provider)).filter(Boolean).slice(0, 20)
      : [],
    showCountryPublicly: Boolean(body.showCountryPublicly),
  };
}

export default async function handler(request: any, response: any) {
  try {
    const sql = db();
    await ensureUserProfilesTable(sql);

    if (request.method === "GET") {
      const rows = await sql`select * from user_profiles where user_id = ${demoUserId} limit 1`;
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
        where handle = ${input.handle} and user_id <> ${demoUserId}
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
          region,
          postal_code,
          streaming_region,
          preferred_providers,
          show_country_publicly
        )
        values (
          ${demoUserId},
          ${input.displayName},
          ${input.handle},
          ${input.bio},
          ${input.countryCode},
          ${input.region},
          ${input.postalCode},
          ${input.streamingRegion},
          ${JSON.stringify(input.preferredProviders)}::jsonb,
          ${input.showCountryPublicly}
        )
        on conflict (user_id) do update set
          display_name = excluded.display_name,
          handle = excluded.handle,
          bio = excluded.bio,
          country_code = excluded.country_code,
          region = excluded.region,
          postal_code = excluded.postal_code,
          streaming_region = excluded.streaming_region,
          preferred_providers = excluded.preferred_providers,
          show_country_publicly = excluded.show_country_publicly,
          updated_at = now()
        returning *
      `;

      return sendJson(response, 200, mapUserProfile(profile));
    }

    return sendJson(response, 405, { error: "Method not allowed." });
  } catch (error) {
    return sendJson(response, 500, { error: error instanceof Error ? error.message : "Profile request failed." });
  }
}
