# Monetization Foundations

This phase prepares Flim for revenue without changing the product experience. It does not add ads, paywalls, tokens, tickets, concession mechanics, or premium games.

## Principle

Discovery first. Monetization second.

The free product must remain excellent across:

- Playlists
- Discovery
- Tracking
- Curators
- Release Intelligence

Monetization should be mostly invisible until a user intentionally clicks an outbound provider or future ticket partner link.

## Streaming Affiliate Foundation

Where To Watch links continue to route through Flim:

```text
Provider logo
-> /api/provider-link/:providerId/:tmdbId
-> provider destination
```

The redirect service now supports:

- active partner URL overrides from `provider_partner_links`
- raw provider destinations when no active partner override exists
- click tracking in `provider_clicks`
- signed-in user attribution when available
- conversion-opportunity flags for future reporting

Rules:

- Do not fake affiliate relationships.
- Do not inject affiliate URLs unless an active, HTTPS-safe partner row exists.
- Do not change Where To Watch visual ranking solely for monetization.
- Do not block provider links when affiliate rows are absent.

## Ticket Affiliate Foundation

Future ticket links use:

```text
/api/ticket-link/:ticketLinkId
```

The redirect service only works for active `ticket_affiliate_links` rows. It records clicks in `ticket_clicks` and redirects to the affiliate URL only when one is active and HTTPS-safe. Otherwise it uses the stored destination URL.

Prepared providers:

- Cineplex
- Landmark Cinemas
- Fandango
- Atom Tickets
- Future regional theater partners

Rules:

- Do not display ticket CTAs until real ticket availability exists.
- Do not create fake ticket links.
- Keep ticket CTAs contextual to theater releases or advance-ticket availability.

## Affiliate Analytics

Prepared analytics:

- provider outbound clicks
- ticket outbound clicks
- conversion-opportunity flags
- signed-in user attribution where available
- referrer and user-agent capture

No analytics dashboard is implemented yet. Future reports can aggregate by provider, region, media title, click type, and conversion opportunity.

## Flim Pro Foundation

Flim Pro is architecture-only. No subscriptions are launched and no core feature is gated.

Prepared tables:

- `pro_plan_definitions`
- `user_pro_access`

Potential future Pro features:

- advanced release-alert controls
- advanced curator tools
- enhanced profile customization
- deeper personal tracking analytics
- premium profile themes
- export tools for curators

Do not gate:

- creating playlists
- following playlists
- title discovery
- Where To Watch fallback behavior
- basic release tracking
- basic TV progress
- public profiles

## Monetization Opportunities Review

Good fits:

- provider affiliate links from confirmed Where To Watch availability
- ticket affiliate links from confirmed advance-ticket availability
- optional Pro tools for power curators and heavy trackers
- future curator analytics that help users improve playlists

Bad fits:

- interruptive banners
- paywalls around discovery
- fake provider availability
- sponsored content blended into playlists without clear labeling
- aggressive upsells during title browsing

## Explicitly Not Implemented

- Ads
- Native sponsored playlist cards
- Payment checkout
- Subscription billing
- Token economy
- Ticket/concession game economy
- Premium games
- Developer APIs
