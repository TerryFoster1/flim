# Playlist Visibility Rules

These rules are the source of truth for Flim playlist access.

## Private

- Only the owner can view the playlist.
- Only the owner can add or remove titles.
- Only the owner can edit, rename, delete, or change visibility.
- No public link is exposed.
- No QR sharing is exposed.

Current behavior: private playlists are owner-only through the authenticated playlist routes. The share modal prompts the owner to make the playlist public before showing a link or QR code.

## Shared

- Owner can view, edit, delete, and change visibility.
- Anyone with the shared link or QR code can view.
- Anyone with the shared link or QR code can add or remove titles.
- Shared visitors cannot delete the playlist.
- Shared visitors cannot rename the playlist.
- Shared visitors cannot change visibility.

Current behavior: shared collaboration is not enabled yet. The database accepts the `shared` visibility value, but Flim does not currently expose shared edit links, QR links, or visitor mutation routes for shared playlists. Until shared collaboration is implemented safely, shared playlists must not expose public-style links.

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
- Shared collaboration requires explicit shared-link access control before it is presented as a working user feature.
- Owner-only mutation checks belong in API routes, not just hidden UI controls.
- Public discovery should never include private or non-public shared playlists.
