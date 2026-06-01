# Plex Integration Foundation

Flim treats Plex as the first realistic path toward "watch from my own library" and eventual remote playback.

This document is planning only. Flim does not currently request Plex credentials, connect to Plex accounts, store Plex passwords, or control Plex players.

## Why Plex First

General streaming providers do not offer reliable universal playback launches across smart TVs, browsers, mobile operating systems, regions, and app installs. Plex is a more realistic first remote-control target because users can connect a known library and known playback clients in a later authenticated integration.

## Planned Stages

### Stage 1: Manual Plex Library Import/Export

Allow a user to import a Plex library export or manually mark movies and TV shows as available in Plex.

### Stage 2: Connect Plex Account/Server

Add a secure Plex account/server connection flow. Do not store Plex passwords. Use appropriate Plex tokens only after a safe auth review.

### Stage 3: Match Plex Library Items To TMDb Media

Match Plex library metadata to TMDb movie and TV IDs so Flim can show whether a selected title is already in the user's Plex library.

### Stage 4: Show "In Your Plex Library"

Display library availability on detail pages, playlist cards, and Roulette results when a match is confirmed.

### Stage 5: Open Media In Plex

Open a confirmed Plex item using Plex web/app links when available.

### Stage 6: Remote Playback To Plex Client/Smart TV

Support "Send to Plex player" only for confirmed Plex clients that support remote playback. Do not claim universal smart TV playback.

## Future Plex Models

- `PlexServer`.
- `PlexLibrary`.
- `PlexLibraryItem`.
- `PlexClient`.
- `PlexPlayer`.
- `PlexSession`.
- `RemotePlaybackTarget`.

## Plex Playback Flow

Planned future flow:

1. User connects a Plex server safely.
2. Flim imports or indexes Plex library items.
3. Flim matches Plex items to TMDb movies or TV shows.
4. User opens a movie, TV show, or Roulette winner.
5. Flim shows `In Your Plex Library` if a match exists.
6. User presses `Watch On Plex`.
7. If supported, user chooses a Plex client such as Living Room TV, Bedroom TV, or Office TV.
8. Flim sends playback only to confirmed supported clients.

## Current UI Language

Use:

- Open on provider.
- Watch on Plex.
- Connect Plex Library.
- Send to Plex player.

Avoid:

- Watch on any smart TV.
- Launch Netflix on your TV.
- Available on this provider unless availability is confirmed.

## Security Notes

- Do not request Plex passwords.
- Do not store Plex passwords.
- Do not expose Plex tokens to the browser unless a future security review explicitly approves a safe client-side token model.
- Treat Plex remote playback as an authenticated future phase, not a demo shortcut.

## Current Limitation

Provider buttons in Flim currently use search fallback URLs unless exact provider data is known in a later phase. They do not confirm streaming availability.
