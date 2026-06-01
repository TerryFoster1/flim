# Spotify Integration Strategy

## Goal

Support soundtrack discovery from movie and TV detail pages.

## Planned User Experience

Movie page card:

- Listen To Soundtrack.
- Album artwork.
- Album name.
- Spotify icon.
- Open In Spotify.

Fallback state:

- Soundtrack not available yet.
- Open Spotify search.

## Search Behavior

Preferred:

- Open the exact soundtrack album directly.

Fallback:

- Open Spotify search.

Search query examples:

- `{Movie Title} Original Motion Picture Soundtrack`
- `{TV Show Title} soundtrack`
- `{TV Show Title} theme song`

## Data Model Placeholders

- `SpotifyAlbum`.
- `Soundtrack`.
- `Artist`.
- `AlbumLink`.
- `SoundtrackAvailability`.

## Future API Strategy

Potential future endpoints:

- `GET /api/media/:mediaType/:id/soundtrack`
- `GET /api/soundtracks/search`
- `POST /api/soundtracks/:id/link`

## Boundaries

- Do not hardcode Spotify credentials.
- Do not add Spotify auth until the integration phase opens.
- Do not claim a soundtrack exists unless an exact album match is confirmed.
- Use search fallback links until direct album lookup is implemented.
