# Recommendation Foundation

Flim recommendations should stay simple, visible, and explainable.

## Current Phase

The first `Recommended Movies` system playlist is generated in the client from existing playlist data.

Signals:

- Movies saved in playlists
- Movies marked watched
- Saved genres
- Watched genres

Reason examples:

- `Because you like Science Fiction`
- `Because you saved Top Gun`
- `Because it is in your movie playlists`

## Near-Term Server Expansion

Move recommendation generation behind an API once user ownership and auth are available.

Planned inputs:

- Watch history
- Saved playlists
- Genre affinity
- TMDb similar movies
- Plex library availability

Planned stored fields:

- `playlist_id`
- `tmdb_id`
- `recommendation_reason`
- `source_signal`
- `created_at`
- `dismissed_at`

## Plex Priority

When Plex is connected, recommendations should prefer content already in `My Plex Library`.

If a recommended movie exists in Plex:

- Show `In Your Plex Library`
- Prefer `Watch On Plex`
- Use Plex as the default playback source

If it does not exist in Plex:

- Show other provider options
- Keep provider availability honest
