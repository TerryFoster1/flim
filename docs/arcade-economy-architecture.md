# Arcade Economy Architecture

This is the foundation for Flim's earned-ticket reward layer and future movie-theater-style economy.

It launches earned Ticket tracking only. It does not implement payments, purchasable token packs, sweepstakes, real-world rewards, partner fulfillment, or public concession stand UI.

## Product Model

Flim should eventually feel like a digital movie theater:

```text
Movies and TV
Arcade
Tokens
Tickets
Concession Stand
```

The model intentionally uses familiar theater language:

- Tokens are a future access currency.
- Tickets are the active earned reward currency.
- The Concession Stand is the future reward catalog.

## Participation Rules

These rules are product constraints, not implementation details:

- Trivia is always free.
- Daily Challenges are always free.
- Seasonal Challenges are always free.
- Users should always have meaningful free participation paths.
- Tickets represent earned progress and rewards.
- Tickets are not purchased.
- Every Ticket credit must be traceable through the ledger.
- Tokens may control access to future premium arcade games, but token purchases are not implemented.
- No real-world rewards may appear until partner, legal, fulfillment, and fraud controls are ready.

## Feature Flag

Server flag:

```text
ENABLE_ARCADE_ECONOMY=false
```

Ticket balance and history are exposed through `/api/tickets` for signed-in users. The broader arcade economy/concession stand remains behind `ENABLE_ARCADE_ECONOMY=false`.

## Data Model

### Wallets

`arcade_wallets`

Stores cached user balances for performance:

- `token_balance`
- `ticket_balance`
- lifetime grant/spend/earn counters
- `last_daily_token_grant_at`

Balances must be treated as derived/cached state. The transaction ledger is the source of truth.

### Transaction Ledger

`arcade_transactions`

Every token or ticket movement must create a ledger row.

Supported currencies:

- `token`
- `ticket`

Supported directions:

- `credit`
- `debit`

Supported transaction types:

- `daily_grant`
- `promotional_grant`
- `future_purchase`
- `game_entry`
- `game_reward`
- `trivia_reward`
- `challenge_reward`
- `seasonal_reward`
- `reward_redemption`
- `refund`
- `admin_adjustment`

Audit fields:

- `balance_before`
- `balance_after`
- `source_type`
- `source_id`
- `idempotency_key`
- `reversal_of_transaction_id`
- `metadata`
- `created_by`

Duplicate protection comes from `idempotency_key`.

### Ticket Earning Rules

`ticket_earning_rules`

Configures how users earn Tickets. Award calls reference a `rule_key`; they do not hardcode amounts.

Initial active rules:

- `trivia_completed`: 25 Tickets
- `perfect_trivia_score`: 100 Tickets
- `easter_egg_found`: 25 Tickets
- `friend_challenge_created`: 25 Tickets
- `friend_challenge_won`: 50 Tickets
- `weekly_challenge_completed`: 75 Tickets
- `seasonal_challenge_completed`: 250 Tickets

Each rule can be paused, archived, scheduled, or changed without rewriting reward hooks.

### Daily Token Grants

`arcade_daily_token_grants`

Defines future free token grants. This is intentionally configurable so daily grants are not hardcoded.

### Game Pricing

`arcade_game_pricing`

Connects token costs and ticket reward ranges to:

- `games`
- `game_instances`
- `game_key`

Examples:

- Movie Match: 3 tokens
- Poster Puzzle: 6 tokens
- Franchise Challenge: 10 tokens

Costs should come from this table, not code.

### Concession Stand

`concession_reward_categories`

Groups rewards into future categories such as:

- Digital Rewards
- Collectibles
- Partner Rewards
- Merchandise
- Special Events

`concession_rewards`

Defines reward catalog entries with:

- reward type
- ticket cost
- inventory behavior
- fulfillment type
- active window
- status
- metadata

### Digital Reward Ownership

`user_reward_inventory`

Tracks user ownership of digital rewards such as:

- profile avatars
- poster frames
- playlist themes
- profile themes
- seasonal cosmetics
- exclusive trivia packs
- exclusive games

### Redemptions

`reward_redemptions`

Tracks concession stand redemptions:

- user
- reward
- ticket transaction
- status
- fulfillment payload
- idempotency key

Redemptions must create ticket ledger debits when spending is implemented.

### Fraud and Audit

`arcade_fraud_events`

Supports review of:

- duplicate claims
- repeated claims
- suspicious redemption patterns
- balance manipulation attempts
- abnormal token/ticket movement

### Analytics

`arcade_economy_daily_metrics`

Prepared for reporting:

- token sources
- ticket sources
- most played games
- most redeemed rewards
- reward popularity
- engagement
- future monetization metrics

Primary source data still comes from:

- `arcade_transactions`
- `game_attempts`
- `game_scores`
- `reward_redemptions`
- `user_reward_inventory`

## Future API Boundary

Prepared endpoint:

```text
GET /api/arcade-economy
GET /api/tickets
```

Current behavior:

- `/api/tickets`: returns authenticated Ticket balance, history, earning rules, and rules stating Tickets are earned and not purchasable
- `/api/arcade-economy`: remains the future broader economy endpoint for reward catalog and concession stand readiness

Not implemented:

- token purchase
- token consume mutation
- reward redemption mutation
- partner fulfillment
- payment processing

## Fraud Prevention Rules

Future mutation endpoints must:

- require auth
- use idempotency keys
- wrap wallet update and ledger insert in one database transaction
- verify balance before debits
- never trust client-provided balances
- write fraud events for repeated or suspicious failures
- use ledger rows for reversals instead of deleting history

## Launch Blockers

Before visible launch:

- legal review of token/ticket language
- no gambling/sweepstakes interpretation
- partner reward terms and fulfillment process
- admin tools for reward catalog and pricing
- abuse and rate-limit policies
- wallet mutation tests
- reconciliation reports
- privacy review for analytics

## Explicit Non-Goals For This Phase

- No purchasable Tickets.
- No purchasable tokens.
- No payments.
- No real-world rewards.
- No sweepstakes.
- No prize drawings.
- No partner integrations.
- No concession stand UI.
- No live game access rules.
