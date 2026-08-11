# Native App Foundation Notes

## Scope

This pass creates a separate native Expo app under `flim-mobile/`.

It reuses the existing Flim API surface for:

- Auth/session
- Profile
- My playlists
- Public playlists
- Search
- Title details
- Add to playlist
- Title trivia
- Arcade challenge metadata

## Authentication

The web backend currently issues an HTTP cookie named `flim_session`.

The native client bridges that model by:

- calling the existing auth endpoints
- reading `Set-Cookie` from successful auth responses when the runtime exposes it
- storing the session cookie in Expo SecureStore
- attaching the cookie to later API requests
- clearing secure storage on logout or `401`

This preserves one account system and one backend. It does not create mobile-only auth.

## Shared API Strategy

The first mobile API client lives in `flim-mobile/src/api/` so it can move quickly without destabilizing the web app.

After the native endpoint contract settles, the safe extraction target is a shared package such as `packages/flim-api-client` with:

- shared DTO types
- request builders
- endpoint path helpers
- no browser-only cookie assumptions
- no server secrets

## Native Navigation Pillars

- Home
- My Playlists
- Arcade
- Public Playlists
- Profile

Discover and Now Playing are intentionally not included as native pillars.

## First Vertical Slice

Implemented screens:

- launch/router shell
- sign in
- home search
- my playlists
- public playlists
- playlist details
- title details
- add title to playlist
- title trivia
- Arcade metadata
- profile/logout

## Known Follow-Ups

- Confirm `Set-Cookie` visibility on real Android/iOS builds.
- Add OAuth deep-link handlers after the web auth provider contract is confirmed.
- Replace basic Arcade challenge routing with native challenge detail/gameplay screens.
- Add native notification token registration once push credentials are ready.
- Add EAS project id after the Expo project is linked.
