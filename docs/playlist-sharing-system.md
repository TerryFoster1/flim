# Playlist Sharing System

Phase 2C adds demo-ready public playlist sharing.

## Current Behavior

- Every playlist receives a unique `public_slug`.
- Share URLs use `/p/:slug`.
- The share panel displays the public URL.
- Users can copy the link.
- Browsers with `navigator.share` can open the native share sheet.
- A QR code is generated for the same public URL.
- The QR code can be downloaded as a PNG.
- Friends can open the link or QR code without logging in.

Example public URL format:

```text
https://www.flim.ca/p/my-playlist-a1b2c3
```

## Current API

- `GET /api/public/playlists/:slug`
- `GET /api/public/playlists/:slug/movies`

## Demo-Stage Access Model

For this phase, any playlist with a `public_slug` can be opened by direct link.

`private`, `shared`, and `public` visibility values are stored for future behavior, but auth and access control are not enforced yet.

## Future Sharing Capabilities

- Real private/shared/public permissions.
- Authenticated playlist ownership.
- Playlist collaborators.
- Saved playlists.
- Follower counts.
- Share analytics.
- Expiring or revocable share links.

## Architecture Diagram

```mermaid
flowchart TD
  Playlist["Playlist row"] --> Slug["Unique public_slug"]
  Slug --> URL["/p/:slug"]
  URL --> PublicAPI["/api/public/playlists/:slug"]
  URL --> QR["QR code"]
  PublicAPI --> Friend["Friend view only page"]
```
