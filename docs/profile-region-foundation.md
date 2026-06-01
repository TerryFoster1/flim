# Profile, Vanity URL, and Streaming Region Foundation

This phase adds the first profile/settings foundation for future authenticated Flim accounts.

## Vanity URLs

Users can reserve a handle that will become their public Flim creator URL:

`https://www.flim.ca/@handle`

Handle rules:

- Lowercase only.
- Letters, numbers, hyphens, and underscores.
- Unique in `user_profiles`.
- Reserved names are blocked: `admin`, `support`, `help`, `api`, `settings`, `login`, `logout`, `plex`, `public`, `playlists`, `roulette`, and `flim`.

The public profile route intentionally exposes only creator-safe fields. Region, postal code, streaming region, and preferred services are private.

## Streaming Region

Flim asks only for the location needed to improve streaming trust:

- Country.
- Province/state optional.
- Postal/ZIP code optional.
- Primary streaming region.

Flim does not ask for a street address. Postal code stays private and should only be used later if a provider requires coarse regional disambiguation.

## Where To Watch Trust

Where To Watch messaging now avoids claiming availability unless Flim has region-confirmed data.

If region is missing, the UI prompts:

`Set your streaming region for more accurate availability.`

If provider availability is unknown, the UI says availability is coming soon and labels provider actions as search/open actions rather than confirmed availability.

## Future Ownership

The current demo app has no full authentication. The profile API uses a demo `user_id` placeholder so the data model and UX are ready for real account ownership later.

When auth is added:

- Replace the demo `user_id` with the authenticated user id.
- Scope playlist creation and profile reads/writes by user.
- Show creator handles on public playlists from the playlist owner relationship.
- Preserve private location fields in server-only data paths.
