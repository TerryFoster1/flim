# Flim Project Audit

Date: June 1, 2026

This audit separates what is implemented from what is only planned or partially wired. It is intentionally direct so the next sprint can focus on demo readiness instead of assuming older roadmap language is already live.

## Phase Map

| Area | Current phase reality | Notes |
| --- | --- | --- |
| Core playlist app | Working MVP | Neon-backed playlist creation, movie/TV item persistence, watched status, public sharing, and QR sharing are implemented. |
| Movie data | Working MVP | TMDb movie search/details are proxied server-side and cached in Neon. |
| TV support | New partial MVP | TV search/details, mixed playlists, badges, and Now Playing filters are implemented; episode tracking is not. |
| Now Playing | Working visual feature | Runs from playlist items and supports filters; still named `Roulette` internally in some files. |
| Public sharing | Working MVP | Public slugs, `/p/:slug`, QR modal, copy link, and native share support exist. |
| Accounts and ownership | Partial | Email/password auth, sessions, profiles, handles, owner IDs, and owner-only UI/API checks exist. It is not production-grade auth yet. |
| Discovery | Partial | Public discovery sections exist, but rankings are derived from available playlist data rather than true saved/shared/view counts. |
| Rewind | Partial | Personalized system playlists now sit below user playlists and hide empty items. Recommendation logic is simple and local to available playlist data. |
| Provider/Plex ecosystem | Mostly documented and placeholder | Where To Watch is honest about region/availability limits. No real Plex API connection or provider availability API exists. |
| Platform polish | Partial | Footer pages, PWA manifest/icons, branding, contact form endpoint, and production domain docs exist. |

## Implementation Table

| Area | Status | Files involved | What works | What does not work | Next needed | Demo safe |
| --- | --- | --- | --- | --- | --- | --- |
| Playlists | Complete | `client/src/pages/Playlists.tsx`, `client/src/pages/PlaylistDetails.tsx`, `client/src/services/apiPlaylistStore.ts`, `client/api/playlists/**`, `client/api/_db.ts` | Create, list, open, delete, add/remove items, watched status, owner-aware actions, poster-first cards. | Rename/edit visibility UI is mostly menu/planning rather than a complete flow. | Add polished edit playlist modal and visibility management. | Yes |
| Movie search | Complete | `client/src/components/MovieSearchPanel.tsx`, `client/src/services/tmdbService.ts`, `client/api/movies/[...movie].ts`, `client/api/_tmdb.ts` | Searches TMDb through server API, returns posters/details, caches results in Neon. | Requires server TMDb env vars; no advanced filters or provider-aware search yet. | Add better loading/error affordances and provider/genre filters later. | Yes, if env vars are present |
| TV support | Partial | `client/src/types.ts`, `client/src/components/MovieSearchPanel.tsx`, `client/src/pages/MovieDetails.tsx`, `client/api/_tmdb.ts`, `client/api/movies/[...movie].ts`, `server/sql/neon-setup.sql`, `docs/tv-support-roadmap.md` | Search movies/TV/both, add TV to playlists, show TV badges, open `/tv/:tmdbId`, store season/episode/runtime fields when available. | No episode progress, season detail pages, TV provider season availability, or notifications. | Run the Neon migration, then add episode tracking in a later phase. | Partial, good for mixed movie/show demo |
| Now Playing | Complete | `client/src/pages/Roulette.tsx`, `client/src/components/RouletteAssets.tsx`, `client/src/components/RouletteButton.tsx`, `client/src/App.tsx` | Full-screen overlay, poster cycling, countdown, reveal, movie/TV/watched/runtime filters, shared playlist launch path. | Internal names still say Roulette; no audio, no provider-aware results, no persistent history. | Rename internal modules when convenient and add history only after ownership model stabilizes. | Yes |
| Public playlist sharing | Complete | `client/src/pages/PublicPlaylist.tsx`, `client/src/components/SharePlaylistButton.tsx`, `client/api/public/playlists/[slug].ts`, `client/api/public/playlists/[slug]/movies.ts`, `api/public-page/[slug].ts` | Clean `/p/:slug` route, copy link, native share, QR code, QR download, visitor-safe public browsing. | Public visibility/access is intentionally permissive for direct-link demo. | Add visibility enforcement once privacy/auth policy is finalized. | Yes |
| QR codes | Complete | `client/src/components/SharePlaylistButton.tsx`, `client/package.json` | Generates QR code data URLs, displays QR modal, supports download. | No server-rendered QR or analytics. | Keep client QR unless social preview images require server rendering. | Yes |
| User accounts/auth | Partial | `client/src/pages/AuthPage.tsx`, `client/src/services/authService.ts`, `client/api/profiles/[...profile].ts`, `client/api/_db.ts` | Email/password sign up/sign in/logout, HTTP-only session cookie, current session endpoint. | No password reset, email verification, rate limiting, account deletion, or full security review. | Add rate limits, password reset, email verification, and session hardening. | Safe for controlled demo, not final production auth |
| User ownership | Partial | `client/api/playlists/**`, `client/api/_db.ts`, `client/src/App.tsx`, `client/src/pages/PlaylistDetails.tsx` | Playlists can have `owner_user_id`; owners can edit/delete through API checks; anonymous/demo data still exists. | Legacy unowned playlists remain; public/private enforcement is incomplete. | Backfill ownership, decide guest mode, enforce visibility rules in all read paths. | Partial |
| Vanity URLs | Partial | `client/src/pages/PublicProfile.tsx`, `client/src/pages/Settings.tsx`, `client/src/services/profileService.ts`, `client/api/profiles/[...profile].ts`, `client/api/_db.ts` | Handles are validated, reserved names are blocked, `/@handle` route displays profile and public playlists. | No avatar upload, profile SEO polish, or full public/privacy controls. | Add avatar, profile metadata, and better public/private field policy. | Yes for basic profile demo |
| Discovery | Partial | `client/src/pages/PublicPlaylists.tsx`, `client/src/App.tsx` | Public discovery shelves render from available public playlists. | Top 100, trending, most shared, most viewed, and recommended are not backed by real analytics/saves/views. | Add event/count tables and real discovery ranking jobs. | Partial |
| Rewind section | Partial | `client/src/pages/Playlists.tsx`, `client/src/App.tsx`, `client/src/services/systemPlaylists.ts` | User playlists appear first; Rewind sits below; empty system playlists are hidden; Plex Library is hidden until connected. | Recommendations are simple and based on current playlist/watched signals only. | Add a persistent recommendation table and explainable recommendation reasons. | Yes |
| Where To Watch | Partial | `client/src/components/WhereToWatch.tsx`, `client/src/services/watchProviderService.ts`, `docs/streaming-provider-strategy.md` | Region-aware trust copy, provider buttons/search fallbacks, Plex placeholder, no false availability claims. | No real availability API; buttons may open provider search, not exact playback. | Choose provider data source and store confirmed regional availability. | Yes if framed as placeholder |
| Region settings | Partial | `client/src/pages/Settings.tsx`, `client/src/services/profileService.ts`, `client/api/profiles/[...profile].ts`, `server/sql/neon-setup.sql` | Country, region, postal code, streaming region, preferred providers can be saved to profile. | No onboarding enforcement and no provider availability lookup uses region yet. | Add onboarding prompt and use region in real provider API requests. | Yes |
| Plex integration | Documented Only | `docs/plex-integration.md`, `docs/master-entertainment-roadmap.md`, `client/src/components/WhereToWatch.tsx`, `client/src/pages/Settings.tsx` | Plex is presented as a future first-class target; Settings and Where To Watch have honest placeholders. | No Plex auth, no API calls, no library import, no matching, no playback control. | Build a safe Plex connection spike with token handling and import-only first. | Safe because it is clearly placeholder |
| TMDb caching | Complete | `client/api/_tmdb.ts`, `client/api/movies/[...movie].ts`, `server/sql/neon-setup.sql`, `docs/neon-setup.md` | Search and details cache to Neon with expiry; movie and TV cache keys are media-type aware. | No admin cache purge or cache hit metrics. | Add basic cache observability and purge tooling. | Yes |
| Neon database usage | Complete | `client/api/_db.ts`, `client/api/**`, `server/sql/neon-setup.sql`, `docs/neon-setup.md` | Playlist, item, auth/profile, TMDb cache, and recommendation foundation use server-side `DATABASE_URL`. | Schema migrations are SQL/manual rather than a formal migration runner. | Add migration versioning and backup/export scripts. | Yes |
| Database backup/export | Not Started | `docs/neon-setup.md`, `server/sql/neon-setup.sql` | Schema setup is documented. | No backup scripts, scheduled exports, restore drill, or runbook. | Add `pg_dump` runbook, Vercel/Neon backup policy, and restore test. | No, not for production operations |
| Footer pages | Complete | `client/src/components/Footer.tsx`, `client/src/pages/PrivacyPolicy.tsx`, `client/src/pages/TermsOfUse.tsx`, `client/src/pages/Contact.tsx` | Footer is user-facing; Privacy, Terms, and Contact routes exist. | Policies are startup-grade, not lawyer-reviewed. | Legal review before broad public launch. | Yes |
| Contact form | Partial | `client/src/pages/Contact.tsx`, `client/api/contact.ts`, `api/contact.ts` | Form submits to backend endpoint without exposing destination email. | Endpoint records/logs response only; no real email delivery configured. | Add Resend or email forwarding env vars and spam protection. | Partial |
| PWA/mobile install | Partial | `client/public/manifest.json`, `client/public/sw.js`, `client/src/components/InstallFlimPrompt.tsx`, `client/index.html` | Manifest, icons, service worker, install prompt, iOS instructions, standalone metadata exist. | True Android/iOS install behavior must be device-tested; service worker is simple. | Test on real Android/iPhone and tune icon/maskable assets. | Partial |
| Branding/logo/favicon | Complete | `client/public/assets/flim-logo.png`, `client/public/assets/flim-icon.png`, `client/public/favicon.ico`, `client/index.html`, `client/src/components/BrandMark.tsx` | Official logo/icon are used in UI and metadata; favicon/PWA icons exist. | Social preview images are static and may not be playlist-specific. | Add generated playlist Open Graph images later. | Yes |

## Plex Readiness Check

| Question | Current answer |
| --- | --- |
| Is there any real Plex API connection? | No. There are no Plex API calls, Plex auth flows, Plex tokens, or Plex server requests. |
| Is there a Plex settings screen? | Partial. Settings includes Plex-oriented placeholders/menu language, but not a working connection flow. |
| Is there a Plex library placeholder? | Yes. `My Plex Library` exists as a system playlist concept and is intentionally hidden from homepage Rewind until a real connection exists. |
| Is there a data model for Plex library items? | Documented only. Roadmap/docs mention `PlexLibraryItem`, `PlexServer`, `PlexClient`, and related models, but no implemented tables/API. |
| Is there a "Watch on Plex" button? | Placeholder only. `WhereToWatch` can show Plex copy/actions, but they do not connect or launch Plex content. |
| Is playback to Plex client implemented? | No. Playback to Plex clients/smart TVs is documented as future work only. |
| What is needed to test Plex later? | A Plex Media Server, a small library, a token-safe connection flow, import/match logic against TMDb IDs, and one reliable open/playback target. |

### Future Plex Test Checklist

1. Install Plex Media Server on a computer.
2. Add a small Movies library.
3. Confirm the movies appear in Plex Web.
4. Confirm the same movies appear in a Plex TV app.
5. Create a Flim Plex connection spike that never stores Plex passwords.
6. Import the Plex library metadata into a staging table.
7. Match imported Plex titles to TMDb movies/TV shows.
8. Verify Flim can show `In Your Plex Library`.
9. Verify `Watch on Plex` opens the correct Plex item.
10. Only after that, test remote playback to one known Plex client.

## Risk List

1. Auth is functional but not production hardened: no password reset, email verification, rate limiting, or account recovery.
2. Visibility/privacy is incomplete: public URLs work well, but private/shared playlist access rules need stronger server-side enforcement.
3. Discovery metrics are not real yet: trending, most shared, most viewed, and top saved need tracking tables and ranking logic.
4. Plex/provider claims must stay conservative: no confirmed provider availability or Plex ownership should be shown until integration data exists.
5. Database operations are manual: there is no migration runner, backup/export routine, or restore drill.
6. Existing unowned/demo playlists may need a migration/ownership policy before a public account launch.
7. Contact form delivery is not implemented; it needs an email provider and abuse protection.

## Demo Readiness Checklist

- [x] Create an account.
- [x] Sign in and log out.
- [x] Create a playlist.
- [x] Search for a movie.
- [x] Search for a TV show.
- [x] Add movie and TV items to the same playlist.
- [x] Refresh and confirm playlist items persist from Neon.
- [x] Mark items watched/unwatched.
- [x] Share a public playlist link.
- [x] Show and download a QR code.
- [x] Open public playlist without signing in.
- [x] Open movie detail pages from public playlists.
- [x] Open TV detail pages from public playlists.
- [x] Launch Now Playing from playlist content.
- [ ] Verify on a real phone after deployment.
- [ ] Run the latest Neon SQL setup against production if columns are missing.
- [ ] Confirm production TMDb server env vars are present.

## Next Recommended Sprint

Focus the next sprint on trust and demo stability, not new feature breadth.

1. Run and verify the Neon schema update for TV fields and media-type-aware cache keys.
2. Regression-test the complete share flow on mobile: create playlist, add movie, add TV show, copy link, QR scan, public view, Now Playing.
3. Harden playlist visibility and ownership server-side.
4. Add basic migration/backup runbooks for Neon.
5. Add contact delivery through a real email provider.
6. Keep Plex in discovery/spike mode: import-only proof of concept before playback.
