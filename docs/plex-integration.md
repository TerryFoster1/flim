# Plex Integration Foundation

Flim treats Plex as the first realistic path toward "watch from my own library" and eventual remote playback.

This document is planning only. Flim does not currently request Plex credentials, connect to Plex accounts, store Plex passwords, or control Plex players.

## Why Plex First

General streaming providers do not offer reliable universal playback launches across smart TVs, browsers, mobile operating systems, regions, and app installs. Plex is a more realistic first remote-control target because users can connect a known library and known playback clients in a later authenticated integration.

## Planned Stages

### Stage 1: Manual Plex Library Import/Export

Allow a user to import a Plex library export or manually mark movies as available in Plex.

### Stage 2: Connect Plex Account/Server

Add a secure Plex account/server connection flow. Do not store Plex passwords. Use appropriate Plex tokens only after a safe auth review.

### Stage 3: Match Plex Library Items To TMDb Movies

Match Plex library metadata to TMDb IDs so Flim can show whether a selected movie is already in the user's Plex library.

### Stage 4: Show "In Your Plex Library"

Display library availability on movie details, playlist cards, and roulette results when a match is confirmed.

### Stage 5: Open Movie In Plex

Open a confirmed Plex item using Plex web/app links when available.

### Stage 6: Remote Playback To Plex Client/Smart TV

Support "Send to Plex player" only for confirmed Plex clients that support remote playback. Do not claim universal smart TV playback.

## Current UI Language

Use:

- Open on provider
- Watch on Plex
- Connect Plex Library
- Send to Plex player

Avoid:

- Watch on any smart TV
- Launch Netflix on your TV
- Available on this provider

## Current Limitation

Provider buttons in Flim currently use search fallback URLs unless exact provider data is known in a later phase. They do not confirm streaming availability.
