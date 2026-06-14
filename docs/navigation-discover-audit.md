# Navigation and Discover Audit

## Profile and Settings

Profile and Settings were not identical routes, but the hamburger labels made them feel redundant.

- Profile is currently an activity summary route.
- Settings is the consolidated edit surface for avatar, bio, notifications, streaming services, region, skins, account, and legal links.
- Public profile viewing is a different action from editing profile settings.

Implemented navigation recommendation:

- Use "Profile & Settings" for the edit destination.
- Keep "View Public Profile" separate when a user has a handle.
- Remove separate "Settings" and "Connect Plex" hamburger entries because Plex already lives inside Where You Watch.

## Discover

Discover still has unique functionality, but its ownership overlaps with Public Playlists and broad search.

### Keep

- Broad discovery search grouped by playlists, collections, hubs, curators, movies, TV, and actors.
- Browse by Genre, Browse by Decade, and Browse by Franchise entry points.
- Available on my services prioritization.
- Discovery hub routes for genre, decade, and franchise exploration.

### Move

- Playlist recommendation shelves should primarily live in Public Playlists, where playlists are the product.
- Curator-first discovery should stay lower priority or live behind curator/profile flows, not lead the Discover page.

### Remove Later

- Any generic recommendation shelf on Discover that duplicates Public Playlists without adding search or hub context.
- Any standalone curator promotion that makes Discover feel creator-first instead of content-first.

## Recommendation

Keep Discover for now, but narrow its purpose:

Discover should be the broad exploration and structured search hub. Public Playlists should remain the playlist-first discovery destination. Upcoming Releases should own release discovery. Trivia & Games should own challenges and arcade discovery.

Future implementation plan:

1. Rename Discover to "Explore" if the product needs a clearer distinction from Public Playlists.
2. Move generic playlist shelves out of Discover unless tied to a query, genre, decade, or franchise.
3. Promote structured hubs and broad search as Discover's primary value.
4. Re-evaluate removal only after Collections has a first-class destination.
