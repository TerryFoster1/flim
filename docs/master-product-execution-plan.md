# Flim Master Product Execution Plan

## Execution Rule

Work through phases in order.

Do not begin a later phase until the current phase is production-ready.

When a phase is completed:

1. Commit.
2. Push.
3. Deploy.
4. Verify production.
5. Fix any exposed bugs before moving forward.

If a phase exposes instability, stop and stabilize that phase before adding new product scope.

## Cache Strategy

This applies to every phase:

```text
Search Flim DB
Search cache
Call external source only when needed
Normalize
Store
Reuse
```

TMDb, provider APIs, Plex APIs, YouTube, Spotify, and future APIs are import sources. They should not become repeated runtime dependencies for the same search/title data.

## Phase 0: Core Stability

Goal: the core product loop must work perfectly.

Required:

- Create playlist.
- Edit playlist.
- Rename playlist.
- Delete playlist.
- Change visibility.
- Add movie.
- Remove movie.
- Reorder movies.
- Add TV show.
- Persist data.
- Share playlist.
- QR code.
- Copy link.
- Native share.
- Director Admin.
- Director playlist editing.
- Director playlist ordering.
- Director profile.

Success flow:

```text
Create Playlist
Add Movies
Share Playlist
Friend Opens Playlist
```

Success means no errors, broken routes, or data loss.

## Phase 1: UX Polish

Goal: make Flim feel premium and entertaining.

Tasks:

- Landing page cleanup.
- Hero polish.
- Floating footer.
- Playlist cards.
- Public playlist pages.
- Director's Cut placement.
- Director Admin cleanup.
- Search placement.
- Mobile-first spacing.
- Now Playing redesign.
- Movie night marquee.
- Film/ticket button.
- Film strip animation.
- Countdown.
- Winner reveal.

Success means users understand Flim in under five seconds, Now Playing feels fun, and the app feels like entertainment instead of software.

## Phase 2: Discovery

Goal: search becomes intelligent.

Search should support:

- Movie titles.
- TV shows.
- Actors.
- Directors.
- Genres.
- Decades.
- Similar movies.
- Natural language prompts such as `80s Comedies`, `Movies Like The Goonies`, or `Family Movie Night`.

Features:

- Discovery search.
- Playlist search.
- Director's Cut search.
- Natural language search.
- Refinement chips.

Success means users can discover content without knowing exact titles.

## Phase 3: Watch Providers

Goal: show users where content is available.

Movie and TV pages should show confirmed providers such as:

- Netflix.
- Prime Video.
- Disney+.
- Crave.
- Apple TV.
- YouTube.
- Tubi.
- Paramount+.
- Plex.

Features:

- Provider logos.
- Provider links.
- Provider search fallbacks.
- Region awareness.
- Cache-first provider storage.

Rules:

- Do not scrape.
- Do not fake availability.
- Do not claim provider availability unless provider data confirms it for the user's region.

Success means users know where to watch.

## Phase 4: Plex

Goal: Flim becomes a decision layer for personal libraries.

Features:

- Connect Plex.
- Import Plex library.
- Match Plex media.
- In Your Library badge.
- Watch On Plex.
- Plex library search.

Future:

- Remote playback.
- Choose TV.
- Send To Plex player.

Success means users can discover movies and launch them through Plex.

## Phase 5: Retention

Goal: give users a reason to return.

Primary feature:

- Follow Title.

Supported:

- Movies.
- TV shows.
- Future releases.
- Future seasons.

Alerts managed by Flim:

- Theater release.
- Streaming release.
- New season.
- New episode.
- Trailer release.
- Soundtrack release.
- Plex availability.

Delivery order:

1. In-app.
2. Push.
3. Email.
4. SMS later only if it makes product and business sense.

Success means Flim brings users back because it remembers what they care about.

## Phase 6: TV Shows

Goal: expand beyond lightweight TV support into full series behavior.

Features:

- Series.
- Seasons.
- Episodes.
- Watch progress.
- Continue Watching.
- TV playlists.
- TV Now Playing.

Examples:

- Shows To Watch.
- Anime List.
- Sci-Fi Shows.
- Comedy Shows.

Success means movies and TV coexist naturally.

## Phase 7: Media Extensions

Goal: turn Flim into an entertainment hub.

Features:

- Spotify soundtracks.
- YouTube trailers.
- Interviews.
- Featurettes.
- Trivia.
- Awards.
- Behind the scenes.

Movie and TV pages become:

```text
Watch
Listen
Explore
Share
```

Success means users keep engaging after choosing content.

## Phase 8: Monetization

Do not start until all earlier phases are stable.

Potential revenue:

- Flim Pro.
- Advanced Now Playing.
- Advanced Follow Title alerts.
- Plex Pro.
- AI discovery.
- Affiliate revenue.
- Provider partnerships.
- Sponsored collections.

Success means monetization does not damage growth or product clarity.

## Director's Cut

The Director is Flim's editorial account, not a fake user.

The Director manages:

- Featured playlists.
- Curated collections.
- Seasonal collections.
- Editorial picks.

Examples:

- Director's Top 100 Comedies.
- Director's Hidden Gems.
- Director's Family Movie Night.
- Director's Best Time Travel Movies.
- Director's Weekend Picks.
- Director's Halloween Collection.
- Director's Christmas Movies.

## Product Principles

- Playlists first.
- Movies and TV second.
- Discovery third.
- Natural language search first.
- Filters second.
- Mobile first.
- Posters first.
- Text second.
- Entertainment over software.
- Reduce friction.
- Reduce duplicate actions.
- Never sacrifice usability for complexity.

## Reporting Template

Every phase report should include:

- Phase.
- Tasks completed.
- Files changed.
- Commit hash.
- Deployment URL.
- Production URL.
- Remaining blockers.
