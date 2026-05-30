# Deployment Notes

These notes document future deployment direction only.

No deployment is configured in this phase. Do not treat this document as evidence that DNS, hosting, redirects, SSL, production builds, environment variables, or external services have been set up.

## Canonical Public Domain

Future production domain:

- `https://flim.ca`

Flim should use `https://flim.ca` as the canonical public domain for product, marketing, and app planning.

## Future WWW Redirect

Future redirect plan:

- `https://www.flim.ca` -> `https://flim.ca`

This redirect is documentation-only. No DNS, hosting, edge middleware, server redirect, or platform configuration has been created.

## Future Marketing Homepage

The future marketing homepage should live at:

- `https://flim.ca/`

Placeholder intent:

- Explain Flim as Spotify playlists for movies.
- Showcase poster-first movie playlist browsing.
- Provide entry points into discovery, public playlists, roulette, and provider planning.

No marketing page deployment exists yet.

## Future App Routes

Future app routes should live under the same canonical domain:

- `https://flim.ca/discover`
- `https://flim.ca/playlists`
- `https://flim.ca/playlists/:id`
- `https://flim.ca/public`
- `https://flim.ca/roulette`
- `https://flim.ca/profile`
- `https://flim.ca/profile/playlists`
- `https://flim.ca/profile/saved`
- `https://flim.ca/profile/watched`
- `https://flim.ca/providers`
- `https://flim.ca/settings`

Current local React shell routing is visual-only and local. Production routing strategy, hosting rewrites, static generation, server rendering, and deployment platform choices are future decisions.

## Explicit Non-Scope

This document does not configure:

- DNS.
- Hosting.
- SSL certificates.
- Redirects.
- CDN or edge rules.
- Deployment workflows.
- External APIs.
- Analytics.
- Authentication.
- Database services.
