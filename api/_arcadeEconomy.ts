import { ensurePgCrypto } from "./_db.js";

export async function ensureArcadeEconomyTables(sql: any) {
  await ensurePgCrypto(sql);

  await sql`
    create table if not exists arcade_wallets (
      user_id uuid primary key references users(id) on delete cascade,
      token_balance integer not null default 0 check (token_balance >= 0),
      ticket_balance integer not null default 0 check (ticket_balance >= 0),
      lifetime_tokens_granted integer not null default 0 check (lifetime_tokens_granted >= 0),
      lifetime_tokens_spent integer not null default 0 check (lifetime_tokens_spent >= 0),
      lifetime_tickets_earned integer not null default 0 check (lifetime_tickets_earned >= 0),
      lifetime_tickets_spent integer not null default 0 check (lifetime_tickets_spent >= 0),
      last_daily_token_grant_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;
  await sql`create index if not exists arcade_wallets_updated_at_idx on arcade_wallets (updated_at desc)`;

  await sql`
    create table if not exists arcade_transactions (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references users(id) on delete cascade,
      currency text not null check (currency in ('token', 'ticket')),
      direction text not null check (direction in ('credit', 'debit')),
      amount integer not null check (amount > 0),
      balance_before integer not null check (balance_before >= 0),
      balance_after integer not null check (balance_after >= 0),
      transaction_type text not null check (
        transaction_type in (
          'daily_grant',
          'promotional_grant',
          'future_purchase',
          'game_entry',
          'game_reward',
          'trivia_reward',
          'challenge_reward',
          'seasonal_reward',
          'reward_redemption',
          'refund',
          'admin_adjustment'
        )
      ),
      status text not null default 'posted' check (status in ('pending', 'posted', 'reversed', 'void')),
      source_type text,
      source_id text,
      idempotency_key text,
      reversal_of_transaction_id uuid references arcade_transactions(id) on delete set null,
      metadata jsonb not null default '{}'::jsonb,
      created_by uuid references users(id) on delete set null,
      created_at timestamptz not null default now()
    )
  `;
  await sql`create unique index if not exists arcade_transactions_user_idempotency_unique on arcade_transactions (user_id, idempotency_key) where idempotency_key is not null`;
  await sql`create index if not exists arcade_transactions_user_created_idx on arcade_transactions (user_id, created_at desc)`;
  await sql`create index if not exists arcade_transactions_type_created_idx on arcade_transactions (transaction_type, created_at desc)`;
  await sql`create index if not exists arcade_transactions_source_idx on arcade_transactions (source_type, source_id)`;

  await sql`
    create table if not exists arcade_daily_token_grants (
      id uuid primary key default gen_random_uuid(),
      grant_key text not null unique,
      name text not null,
      token_amount integer not null check (token_amount >= 0),
      cadence text not null default 'daily' check (cadence in ('daily', 'weekly', 'manual')),
      status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'archived')),
      starts_at timestamptz,
      ends_at timestamptz,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;
  await sql`create index if not exists arcade_daily_token_grants_status_dates_idx on arcade_daily_token_grants (status, starts_at, ends_at)`;

  await sql`
    create table if not exists arcade_game_pricing (
      id uuid primary key default gen_random_uuid(),
      game_id uuid references games(id) on delete cascade,
      game_instance_id uuid references game_instances(id) on delete cascade,
      game_key text,
      token_cost integer not null default 0 check (token_cost >= 0),
      ticket_reward_min integer not null default 0 check (ticket_reward_min >= 0),
      ticket_reward_max integer not null default 0 check (ticket_reward_max >= ticket_reward_min),
      pricing_status text not null default 'draft' check (pricing_status in ('draft', 'active', 'paused', 'archived')),
      starts_at timestamptz,
      ends_at timestamptz,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      check (game_id is not null or game_instance_id is not null or game_key is not null)
    )
  `;
  await sql`create index if not exists arcade_game_pricing_game_status_idx on arcade_game_pricing (game_id, pricing_status)`;
  await sql`create index if not exists arcade_game_pricing_instance_status_idx on arcade_game_pricing (game_instance_id, pricing_status)`;
  await sql`create index if not exists arcade_game_pricing_key_status_idx on arcade_game_pricing (game_key, pricing_status)`;

  await sql`
    create table if not exists concession_reward_categories (
      id uuid primary key default gen_random_uuid(),
      category_key text not null unique,
      name text not null,
      description text not null default '',
      display_order integer not null default 0,
      status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;
  await sql`create index if not exists concession_reward_categories_status_order_idx on concession_reward_categories (status, display_order)`;

  await sql`
    create table if not exists concession_rewards (
      id uuid primary key default gen_random_uuid(),
      public_id text not null unique,
      category_id uuid references concession_reward_categories(id) on delete set null,
      reward_type text not null check (
        reward_type in (
          'profile_avatar',
          'poster_frame',
          'playlist_theme',
          'profile_theme',
          'seasonal_cosmetic',
          'exclusive_trivia_pack',
          'exclusive_game',
          'collectible',
          'partner_reward',
          'movie_ticket',
          'popcorn_voucher',
          'streaming_credit',
          'gift_card',
          'merchandise'
        )
      ),
      name text not null,
      description text not null default '',
      ticket_cost integer not null default 0 check (ticket_cost >= 0),
      inventory_type text not null default 'unlimited' check (inventory_type in ('unlimited', 'limited', 'manual')),
      total_inventory integer check (total_inventory is null or total_inventory >= 0),
      remaining_inventory integer check (remaining_inventory is null or remaining_inventory >= 0),
      fulfillment_type text not null default 'digital' check (fulfillment_type in ('digital', 'manual', 'partner')),
      partner_key text,
      starts_at timestamptz,
      ends_at timestamptz,
      status text not null default 'draft' check (status in ('draft', 'scheduled', 'active', 'paused', 'sold_out', 'archived')),
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;
  await sql`create index if not exists concession_rewards_status_dates_idx on concession_rewards (status, starts_at, ends_at)`;
  await sql`create index if not exists concession_rewards_type_status_idx on concession_rewards (reward_type, status)`;
  await sql`create index if not exists concession_rewards_category_idx on concession_rewards (category_id, status)`;

  await sql`
    create table if not exists user_reward_inventory (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references users(id) on delete cascade,
      reward_id uuid not null references concession_rewards(id) on delete cascade,
      reward_type text not null,
      ownership_status text not null default 'active' check (ownership_status in ('active', 'revoked', 'expired')),
      acquired_via text not null default 'redemption',
      acquired_at timestamptz not null default now(),
      expires_at timestamptz,
      metadata jsonb not null default '{}'::jsonb
    )
  `;
  await sql`create unique index if not exists user_reward_inventory_active_unique on user_reward_inventory (user_id, reward_id) where ownership_status = 'active'`;
  await sql`create index if not exists user_reward_inventory_user_status_idx on user_reward_inventory (user_id, ownership_status, acquired_at desc)`;

  await sql`
    create table if not exists reward_redemptions (
      id uuid primary key default gen_random_uuid(),
      redemption_public_id text not null unique,
      user_id uuid not null references users(id) on delete cascade,
      reward_id uuid not null references concession_rewards(id) on delete restrict,
      ticket_transaction_id uuid references arcade_transactions(id) on delete set null,
      ticket_cost integer not null check (ticket_cost >= 0),
      status text not null default 'requested' check (status in ('requested', 'fulfilled', 'cancelled', 'refunded', 'failed')),
      idempotency_key text,
      fulfillment_payload jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;
  await sql`create unique index if not exists reward_redemptions_user_idempotency_unique on reward_redemptions (user_id, idempotency_key) where idempotency_key is not null`;
  await sql`create index if not exists reward_redemptions_user_status_idx on reward_redemptions (user_id, status, created_at desc)`;
  await sql`create index if not exists reward_redemptions_reward_status_idx on reward_redemptions (reward_id, status, created_at desc)`;

  await sql`
    create table if not exists arcade_fraud_events (
      id uuid primary key default gen_random_uuid(),
      user_id uuid references users(id) on delete set null,
      event_type text not null,
      severity text not null default 'low' check (severity in ('low', 'medium', 'high', 'critical')),
      related_transaction_id uuid references arcade_transactions(id) on delete set null,
      related_redemption_id uuid references reward_redemptions(id) on delete set null,
      status text not null default 'open' check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;
  await sql`create index if not exists arcade_fraud_events_user_status_idx on arcade_fraud_events (user_id, status, created_at desc)`;
  await sql`create index if not exists arcade_fraud_events_type_severity_idx on arcade_fraud_events (event_type, severity, created_at desc)`;

  await sql`
    create table if not exists arcade_economy_daily_metrics (
      metric_date date not null,
      metric_type text not null,
      metric_key text not null,
      metric_value numeric not null default 0,
      metadata jsonb not null default '{}'::jsonb,
      updated_at timestamptz not null default now(),
      primary key (metric_date, metric_type, metric_key)
    )
  `;
  await sql`create index if not exists arcade_economy_daily_metrics_type_date_idx on arcade_economy_daily_metrics (metric_type, metric_date desc)`;
}

export function arcadeEconomyArchitecture() {
  return {
    enabled: false,
    currencies: {
      tokens: {
        purpose: "Access currency for future arcade games.",
        launchRule: "No purchasable token packs are implemented.",
      },
      tickets: {
        purpose: "Reward currency for future concession stand redemptions.",
        launchRule: "Tickets are traceable through the transaction ledger.",
      },
    },
    futureSystems: [
      "daily token grants",
      "game token pricing",
      "ticket rewards",
      "concession rewards",
      "digital reward ownership",
      "partner reward fulfillment",
      "fraud review",
      "economy analytics",
    ],
  };
}
