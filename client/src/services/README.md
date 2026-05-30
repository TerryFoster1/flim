# Client Services

Placeholder folder for future client-side API adapters.

Rules for future implementation:

- Keep HTTP transport isolated here.
- Do not call external movie, streaming, AI, email, or notification services directly from the client.
- Prefer shared request/response interfaces from `shared/`.
- Keep provider availability, roulette, sharing, and social operations behind planned API contracts.
