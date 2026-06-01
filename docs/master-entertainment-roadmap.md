# Flim Master Entertainment Roadmap

## North Star

Flim is evolving from a movie playlist app into a universal entertainment decision platform.

Core question:

> What should we watch tonight?

Flim should help answer that question across movies, TV shows, playlists, streaming providers, Plex libraries, smart TVs, and future playback targets.

After a user chooses what to watch, Flim should also help them continue exploring that title through soundtracks, trailers, trivia, and related media.

## Product Positioning

Flim is:

- Spotify playlists for movies and TV shows.
- Movie Night Roulette.
- Watch provider discovery.
- A decision layer above personal media libraries.

Flim is not:

- A replacement for Netflix, Disney+, Prime Video, Plex, Jellyfin, Emby, or Apple TV.
- A universal smart TV remote.
- A provider availability source unless availability has been confirmed.
- A playback platform.

Flim helps users decide what to watch, then opens the best available destination.

## Implementation Priority

1. Provider visibility.
2. Provider filtering.
3. Plex library integration.
4. Plex playback.
5. TV tracking.
6. Advanced smart TV integration.
7. Advanced Roulette.
8. Media extensions: soundtracks, trailers, trivia, and related experiences.

## Phase 1: Watch Providers

Goal: show users where a movie or TV show might be watched without claiming unverified availability.

Planned surfaces:

- Movie detail `Where To Watch`.
- Future TV detail `Where To Watch`.
- Playlist media cards.
- Roulette winner actions.

Initial providers:

- Plex.
- Netflix.
- Disney+.
- Prime Video.
- Apple TV.
- Crave.
- YouTube.
- Tubi.
- Paramount+.

Provider behavior:

- Prefer exact movie/show page when a confirmed URL exists.
- Fall back to provider search URLs when exact links are unknown.
- Never leave the user stuck.
- Never claim availability unless confirmed.
- Never scrape provider pages.

Provider filters:

- Show items on Netflix.
- Show items on Disney+.
- Show items on Prime Video.
- Show items available in Plex.
- Support multiple selected providers such as Netflix + Prime + Plex.

Contract placeholders:

- `MovieAvailability`.
- `WatchProvider`.
- `WatchProviderLink`.
- `ProviderRegion`.
- `ProviderDeepLink`.
- `ProviderSearchFallback`.
- `ProviderCapabilities`.

## Phase 2: Plex Integration

Goal: make Plex the first serious personal-library and remote-playback target.

Planned settings surfaces:

- Connect Plex.
- Plex Library.
- Import Plex Library.
- Plex playback targets.

Planned stages:

1. Manual Plex library import/export.
2. Connect Plex account/server.
3. Match Plex library items to TMDb media.
4. Display `In Your Plex Library`.
5. Open movie/show in Plex.
6. Send playback to supported Plex clients.

Plex badges:

- Plex icon.
- `In Your Library`.
- `Watch On Plex` when a confirmed Plex link exists.

Plex model placeholders:

- `PlexServer`.
- `PlexLibrary`.
- `PlexLibraryItem`.
- `PlexClient`.
- `PlexPlayer`.
- `PlexSession`.
- `RemotePlaybackTarget`.

Security rule:

- Do not request or store Plex passwords.
- Use token-based Plex connection only after the auth/security phase is opened.

## Phase 3: Smart TV Support

Goal: support reliable playback targets without promising universal smart TV launch behavior.

Potential targets:

- Chromecast.
- Android TV.
- Google TV.
- Plex Players.
- Supported smart TV apps where APIs are reliable.

Rules:

- Do not claim universal smart TV support.
- Do not say "Launch Netflix on your TV" unless that exact behavior is supported and verified.
- Prefer Plex remote playback as the first reliable TV target.

Device model placeholders:

- `ConnectedDevice`.
- `TVTarget`.
- `CastingTarget`.
- `PlaybackTarget`.
- `RemotePlaybackTarget`.
- `ProviderCapabilities`.

## Phase 4: TV Series Support

Goal: expand Flim from movies into movies plus TV shows and mini-series.

Media types:

- `movie`.
- `tv`.

TV playlist examples:

- Shows To Watch.
- Anime List.
- Sci-Fi Shows.
- Comedy Shows.
- Shows We Finished.

TV tracking:

- Series.
- Season.
- Episode.
- Watched status.
- Current episode.
- Current season.
- Last watched.
- Continue Watching.
- Next Episode.
- Resume Series.

TV Roulette:

- Movies only.
- TV only.
- Movies + TV.

Contract placeholders:

- `MediaType`.
- `TvSeriesDetails`.
- `TvSeason`.
- `TvEpisode`.
- `EpisodeWatchStatus`.
- `SeriesProgress`.

## Phase 5: Roulette Evolution

Goal: make Roulette a signature Flim feature that feels like a movie-night decision machine.

Roulette filters:

- Playlist.
- Provider.
- Movie.
- TV.
- Watched.
- Unwatched.
- Runtime.
- Genre.
- Decade.

Roulette modes:

- Movie Night.
- TV Night.
- Family Night.
- Date Night.
- Kids Night.
- Plex Only.
- Netflix Only.
- Disney Only.
- Unwatched Only.

Winner actions:

- Watch Now.
- Watch On Plex.
- Open Provider.
- View Details.
- Add To Playlist.
- Share Movie Night.

## Phase 6: Media Extensions

Goal: make movie and TV detail pages feel like entertainment hubs.

Planned actions:

- Watch Movie.
- Listen To Soundtrack.
- Watch Trailer.
- Trivia & Facts.
- Add To Roulette.

Integration foundations:

- Spotify soundtrack lookup.
- YouTube trailer lookup.
- Trivia, awards, production, and behind-the-scenes architecture.

## Future Product Vision

User opens Flim.

Flim understands movies, TV shows, playlists, streaming providers, Plex library availability, watched status, and current TV episodes.

The user opens a playlist or spins Roulette.

Flim chooses something.

The user presses Watch Now.

Flim opens Netflix, Disney+, Prime Video, Plex, or another supported playback target.

## Success Criteria

A user can:

- Create playlists.
- Track movies.
- Track TV shows.
- Track episodes.
- See where content is available.
- Know if a title exists in Plex.
- Use Roulette to choose something.
- Press Watch to open the best available destination.

Flim becomes the decision layer above entertainment services.
