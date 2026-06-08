# Playlist Visibility Rules

These rules are the source of truth for Flim playlist access.

## Private

- Only the owner can view the playlist.
- Only the owner can add or remove titles.
- Only the owner can edit, rename, delete, or change visibility.
- No public link is exposed.
- No QR sharing is exposed.

Current behavior: private playlists are owner-only through the authenticated playlist routes. The share modal lets the owner create a private shared link without making the playlist public, or make the playlist public as a separate action.

## Shared

- Owner can view, edit, delete, and change visibility.
- Anyone with the shared link or QR code can view.
- Anyone with the shared link or QR code can add or remove titles.
- Shared visitors cannot delete the playlist.
- Shared visitors cannot rename the playlist.
- Shared visitors cannot change visibility.

Current behavior: shared collaboration uses an unguessable `/s/:token` link backed by `playlists.shared_slug`. Shared-link visitors can view the playlist and add or remove titles through shared-token API routes. They cannot rename, delete, reorder, change visibility, or follow the playlist through public discovery.

## Public

- Everyone can view.
- Only the owner can add or remove titles.
- Only the owner can edit, rename, delete, or change visibility.
- Everyone can follow.
- Everyone can share.
- Public playlists appear in public discovery.
- Following public playlists makes them easier to find and available to Now Playing.

Current behavior: public playlist pages are available at `/p/:slug`, public playlists can be followed by signed-in users, and the share modal exposes the public URL and QR code.

## Implementation Notes

- Public URLs must not be shown for private playlists before the owner makes the playlist public.
- Shared playlist links must use `/s/:token`, not `/p/:slug`.
- Owner-only mutation checks belong in API routes, not just hidden UI controls.
- Public discovery should never include private or non-public shared playlists.
