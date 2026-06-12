import { ensurePgCrypto } from "./_db.js";

type TicketRuleKey =
  | "trivia_completed"
  | "perfect_trivia_score"
  | "easter_egg_found"
  | "friend_challenge_created"
  | "friend_challenge_won"
  | "weekly_challenge_completed"
  | "seasonal_challenge_completed";

const ticketEarningRuleSeeds: Array<{
  ruleKey: TicketRuleKey;
  name: string;
  description: string;
  ticketAmount: number;
  triggerType: string;
}> = [
  {
    ruleKey: "trivia_completed",
    name: "Trivia Completed",
    description: "Complete a title trivia question.",
    ticketAmount: 25,
    triggerType: "trivia",
  },
  {
    ruleKey: "perfect_trivia_score",
    name: "Perfect Score",
    description: "Complete a trivia pack with every answer correct.",
    ticketAmount: 100,
    triggerType: "trivia",
  },
  {
    ruleKey: "easter_egg_found",
    name: "Easter Egg Found",
    description: "Complete an Easter Egg Hunt.",
    ticketAmount: 25,
    triggerType: "trivia",
  },
  {
    ruleKey: "friend_challenge_created",
    name: "Friend Challenge Created",
    description: "Create a friend challenge from a completed trivia pack.",
    ticketAmount: 25,
    triggerType: "friend_challenge",
  },
  {
    ruleKey: "friend_challenge_won",
    name: "Friend Challenge Won",
    description: "Beat a friend's score on a shared trivia challenge.",
    ticketAmount: 50,
    triggerType: "friend_challenge",
  },
  {
    ruleKey: "weekly_challenge_completed",
    name: "Weekly Challenge Completed",
    description: "Complete an active weekly challenge.",
    ticketAmount: 75,
    triggerType: "seasonal_challenge",
  },
  {
    ruleKey: "seasonal_challenge_completed",
    name: "Seasonal Challenge Completed",
    description: "Complete an active seasonal or special event challenge.",
    ticketAmount: 250,
    triggerType: "seasonal_challenge",
  },
];

export async function ensureTicketTables(sql: any) {
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
    create table if not exists ticket_earning_rules (
      id uuid primary key default gen_random_uuid(),
      rule_key text not null unique,
      name text not null,
      description text not null default '',
      ticket_amount integer not null check (ticket_amount >= 0),
      trigger_type text not null,
      status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'archived')),
      starts_at timestamptz,
      ends_at timestamptz,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;
  await sql`create index if not exists ticket_earning_rules_status_trigger_idx on ticket_earning_rules (status, trigger_type)`;

  for (const rule of ticketEarningRuleSeeds) {
    await sql`
      insert into ticket_earning_rules (
        rule_key,
        name,
        description,
        ticket_amount,
        trigger_type,
        status,
        updated_at
      )
      values (
        ${rule.ruleKey},
        ${rule.name},
        ${rule.description},
        ${rule.ticketAmount},
        ${rule.triggerType},
        'active',
        now()
      )
      on conflict (rule_key) do update set
        name = excluded.name,
        description = excluded.description,
        trigger_type = excluded.trigger_type,
        updated_at = now()
    `;
  }

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

export async function ensureArcadeEconomyTables(sql: any) {
  await ensureTicketTables(sql);

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
    create table if not exists ticket_earning_rules (
      id uuid primary key default gen_random_uuid(),
      rule_key text not null unique,
      name text not null,
      description text not null default '',
      ticket_amount integer not null check (ticket_amount >= 0),
      trigger_type text not null,
      status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'archived')),
      starts_at timestamptz,
      ends_at timestamptz,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;
  await sql`create index if not exists ticket_earning_rules_status_trigger_idx on ticket_earning_rules (status, trigger_type)`;

  for (const rule of ticketEarningRuleSeeds) {
    await sql`
      insert into ticket_earning_rules (
        rule_key,
        name,
        description,
        ticket_amount,
        trigger_type,
        status,
        updated_at
      )
      values (
        ${rule.ruleKey},
        ${rule.name},
        ${rule.description},
        ${rule.ticketAmount},
        ${rule.triggerType},
        'active',
        now()
      )
      on conflict (rule_key) do update set
        name = excluded.name,
        description = excluded.description,
        trigger_type = excluded.trigger_type,
        updated_at = now()
    `;
  }

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

export async function readTicketEarningRules(sql: any) {
  await ensureTicketTables(sql);
  const rows = await sql`
    select rule_key, name, description, ticket_amount, trigger_type, status
    from ticket_earning_rules
    where status = 'active'
      and (starts_at is null or starts_at <= now())
      and (ends_at is null or ends_at >= now())
    order by trigger_type asc, ticket_amount asc, name asc
  `;
  return rows.map((row: any) => ({
    ruleKey: row.rule_key,
    name: row.name,
    description: row.description || "",
    ticketAmount: Number(row.ticket_amount || 0),
    triggerType: row.trigger_type,
    status: row.status,
  }));
}

export async function readTicketWallet(sql: any, userId: string) {
  await ensureTicketTables(sql);
  await sql`
    insert into arcade_wallets (user_id)
    values (${userId})
    on conflict (user_id) do nothing
  `;
  const [wallet] = await sql`
    select ticket_balance, lifetime_tickets_earned, lifetime_tickets_spent, updated_at
    from arcade_wallets
    where user_id = ${userId}
    limit 1
  `;
  return {
    ticketBalance: Number(wallet?.ticket_balance || 0),
    lifetimeTicketsEarned: Number(wallet?.lifetime_tickets_earned || 0),
    lifetimeTicketsSpent: Number(wallet?.lifetime_tickets_spent || 0),
    updatedAt: wallet?.updated_at,
  };
}

export async function readTicketHistory(sql: any, userId: string, limit = 20) {
  await ensureTicketTables(sql);
  const rows = await sql`
    select
      id,
      direction,
      amount,
      balance_before,
      balance_after,
      transaction_type,
      source_type,
      source_id,
      metadata,
      created_at
    from arcade_transactions
    where user_id = ${userId}
      and currency = 'ticket'
      and status = 'posted'
    order by created_at desc
    limit ${Math.max(1, Math.min(100, limit))}
  `;
  return rows.map((row: any) => ({
    id: row.id,
    direction: row.direction,
    amount: Number(row.amount || 0),
    balanceBefore: Number(row.balance_before || 0),
    balanceAfter: Number(row.balance_after || 0),
    transactionType: row.transaction_type,
    sourceType: row.source_type || undefined,
    sourceId: row.source_id || undefined,
    metadata: row.metadata || {},
    createdAt: row.created_at,
  }));
}

export async function awardTickets(sql: any, input: {
  userId: string;
  ruleKey: TicketRuleKey;
  sourceType: string;
  sourceId: string;
  metadata?: Record<string, unknown>;
}) {
  await ensureTicketTables(sql);
  const [rule] = await sql`
    select rule_key, name, ticket_amount
    from ticket_earning_rules
    where rule_key = ${input.ruleKey}
      and status = 'active'
      and (starts_at is null or starts_at <= now())
      and (ends_at is null or ends_at >= now())
    limit 1
  `;
  const amount = Number(rule?.ticket_amount || 0);
  if (!rule || amount <= 0) {
    return { awarded: false, duplicate: false, amount: 0, wallet: await readTicketWallet(sql, input.userId) };
  }

  const idempotencyKey = `${input.ruleKey}:${input.sourceType}:${input.sourceId}`.slice(0, 240);
  await sql`
    insert into arcade_wallets (user_id)
    values (${input.userId})
    on conflict (user_id) do nothing
  `;

  const inserted = await sql`
    insert into arcade_transactions (
      user_id,
      currency,
      direction,
      amount,
      balance_before,
      balance_after,
      transaction_type,
      source_type,
      source_id,
      idempotency_key,
      metadata
    )
    select
      ${input.userId},
      'ticket',
      'credit',
      ${amount},
      aw.ticket_balance,
      aw.ticket_balance + ${amount},
      case
        when ${input.ruleKey} in ('trivia_completed', 'perfect_trivia_score', 'easter_egg_found') then 'trivia_reward'
        when ${input.ruleKey} in ('friend_challenge_created', 'friend_challenge_won') then 'challenge_reward'
        else 'seasonal_reward'
      end,
      ${input.sourceType},
      ${input.sourceId},
      ${idempotencyKey},
      ${JSON.stringify({ ruleKey: input.ruleKey, ruleName: rule.name, ...(input.metadata || {}) })}::jsonb
    from arcade_wallets aw
    where aw.user_id = ${input.userId}
    on conflict (user_id, idempotency_key) where idempotency_key is not null do nothing
    returning id, balance_after
  `;

  if (!inserted[0]) {
    return { awarded: false, duplicate: true, amount, wallet: await readTicketWallet(sql, input.userId) };
  }

  await sql`
    update arcade_wallets
    set
      ticket_balance = ticket_balance + ${amount},
      lifetime_tickets_earned = lifetime_tickets_earned + ${amount},
      updated_at = now()
    where user_id = ${input.userId}
  `;

  await sql`
    insert into arcade_economy_daily_metrics (metric_date, metric_type, metric_key, metric_value, metadata, updated_at)
    values ((now() at time zone 'America/Toronto')::date, 'tickets_earned', ${input.ruleKey}, ${amount}, ${JSON.stringify({ sourceType: input.sourceType })}::jsonb, now())
    on conflict (metric_date, metric_type, metric_key)
    do update set
      metric_value = arcade_economy_daily_metrics.metric_value + excluded.metric_value,
      updated_at = now()
  `;

  return { awarded: true, duplicate: false, amount, transactionId: inserted[0].id, wallet: await readTicketWallet(sql, input.userId) };
}
