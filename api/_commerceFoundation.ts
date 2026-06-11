export async function ensureTicketAffiliateTables(sql: any) {
  await sql`
    create table if not exists ticket_providers (
      id uuid primary key default gen_random_uuid(),
      provider_key text not null unique,
      provider_name text not null,
      region text not null default 'CA',
      website_url text,
      status text not null default 'inactive',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;
  await sql`create index if not exists ticket_providers_region_status_idx on ticket_providers (region, status)`;

  await sql`
    create table if not exists title_ticket_availability (
      id uuid primary key default gen_random_uuid(),
      media_item_id uuid not null references media_items(id) on delete cascade,
      provider_id uuid references ticket_providers(id) on delete set null,
      provider_name text not null,
      region text not null default 'CA',
      city text,
      theater_chain text,
      ticket_url text,
      available_from timestamptz,
      showtime_date timestamptz,
      source text not null default 'manual',
      status text not null default 'unknown',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;
  await sql`create index if not exists title_ticket_availability_media_region_idx on title_ticket_availability (media_item_id, region, status)`;
  await sql`create index if not exists title_ticket_availability_showtime_idx on title_ticket_availability (showtime_date)`;

  await sql`
    create table if not exists ticket_affiliate_links (
      id uuid primary key default gen_random_uuid(),
      ticket_availability_id uuid references title_ticket_availability(id) on delete cascade,
      provider_id uuid references ticket_providers(id) on delete set null,
      media_item_id uuid not null references media_items(id) on delete cascade,
      destination_url text not null,
      affiliate_url text,
      region text not null default 'CA',
      city text,
      theater_chain text,
      active boolean not null default false,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;
  await sql`create index if not exists ticket_affiliate_links_media_region_idx on ticket_affiliate_links (media_item_id, region, active)`;

  await sql`
    create table if not exists ticket_clicks (
      id uuid primary key default gen_random_uuid(),
      media_item_id uuid references media_items(id) on delete set null,
      provider_id uuid references ticket_providers(id) on delete set null,
      ticket_affiliate_link_id uuid references ticket_affiliate_links(id) on delete set null,
      region text not null default 'CA',
      city text,
      theater_chain text,
      destination_url text not null,
      referrer text,
      user_agent text,
      clicked_at timestamptz not null default now()
    )
  `;
  await sql`create index if not exists ticket_clicks_media_clicked_idx on ticket_clicks (media_item_id, clicked_at desc)`;
  await sql`create index if not exists ticket_clicks_provider_clicked_idx on ticket_clicks (provider_id, clicked_at desc)`;
}

export async function ensureTvReleaseFoundationTables(sql: any) {
  await sql`
    create table if not exists season_release_tracking (
      id uuid primary key default gen_random_uuid(),
      media_item_id uuid not null references media_items(id) on delete cascade,
      tmdb_show_id integer not null,
      season_number integer not null,
      release_date date,
      status text,
      episode_count integer,
      released_episode_count integer not null default 0,
      change_hash text,
      last_checked_at timestamptz,
      source text not null default 'tmdb',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;
  await sql`create unique index if not exists season_release_tracking_show_season_unique on season_release_tracking (tmdb_show_id, season_number)`;
  await sql`create index if not exists season_release_tracking_media_idx on season_release_tracking (media_item_id, last_checked_at)`;

  await sql`
    create table if not exists episode_release_tracking (
      id uuid primary key default gen_random_uuid(),
      media_item_id uuid not null references media_items(id) on delete cascade,
      tmdb_show_id integer not null,
      season_number integer not null,
      episode_number integer not null,
      release_date date,
      status text,
      change_hash text,
      last_checked_at timestamptz,
      source text not null default 'tmdb',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;
  await sql`create unique index if not exists episode_release_tracking_show_episode_unique on episode_release_tracking (tmdb_show_id, season_number, episode_number)`;
  await sql`create index if not exists episode_release_tracking_release_idx on episode_release_tracking (release_date, status)`;
}

export async function ensureNativeAdTables(sql: any) {
  await sql`
    create table if not exists ad_campaigns (
      id uuid primary key default gen_random_uuid(),
      brand_name text not null,
      campaign_name text not null,
      status text not null default 'draft',
      start_date timestamptz,
      end_date timestamptz,
      budget_cents integer,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;
  await sql`create index if not exists ad_campaigns_status_dates_idx on ad_campaigns (status, start_date, end_date)`;

  await sql`
    create table if not exists ad_creatives (
      id uuid primary key default gen_random_uuid(),
      campaign_id uuid not null references ad_campaigns(id) on delete cascade,
      creative_title text not null,
      creative_image_url text not null,
      destination_url text not null,
      affiliate_url text,
      sponsor_label text not null default 'Sponsored',
      status text not null default 'draft',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;
  await sql`create index if not exists ad_creatives_campaign_status_idx on ad_creatives (campaign_id, status)`;

  await sql`
    create table if not exists ad_targeting_rules (
      id uuid primary key default gen_random_uuid(),
      campaign_id uuid not null references ad_campaigns(id) on delete cascade,
      playlist_context text,
      genre_context text,
      media_type_context text check (media_type_context in ('movie', 'tv') or media_type_context is null),
      region text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;
  await sql`create index if not exists ad_targeting_rules_campaign_idx on ad_targeting_rules (campaign_id)`;

  await sql`
    create table if not exists ad_placements (
      id uuid primary key default gen_random_uuid(),
      campaign_id uuid not null references ad_campaigns(id) on delete cascade,
      creative_id uuid not null references ad_creatives(id) on delete cascade,
      placement_type text not null,
      playlist_context text,
      genre_context text,
      media_type_context text check (media_type_context in ('movie', 'tv') or media_type_context is null),
      start_date timestamptz,
      end_date timestamptz,
      status text not null default 'draft',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;
  await sql`create index if not exists ad_placements_type_status_dates_idx on ad_placements (placement_type, status, start_date, end_date)`;

  await sql`
    create table if not exists ad_impressions (
      id uuid primary key default gen_random_uuid(),
      placement_id uuid references ad_placements(id) on delete set null,
      campaign_id uuid references ad_campaigns(id) on delete set null,
      creative_id uuid references ad_creatives(id) on delete set null,
      playlist_id uuid references playlists(id) on delete set null,
      placement_type text not null,
      context jsonb not null default '{}'::jsonb,
      user_id uuid references users(id) on delete set null,
      session_id text,
      occurred_at timestamptz not null default now()
    )
  `;
  await sql`create index if not exists ad_impressions_campaign_time_idx on ad_impressions (campaign_id, occurred_at desc)`;
  await sql`create index if not exists ad_impressions_placement_time_idx on ad_impressions (placement_id, occurred_at desc)`;

  await sql`
    create table if not exists ad_clicks (
      id uuid primary key default gen_random_uuid(),
      placement_id uuid references ad_placements(id) on delete set null,
      campaign_id uuid references ad_campaigns(id) on delete set null,
      creative_id uuid references ad_creatives(id) on delete set null,
      playlist_id uuid references playlists(id) on delete set null,
      destination_url text not null,
      user_id uuid references users(id) on delete set null,
      session_id text,
      referrer text,
      user_agent text,
      clicked_at timestamptz not null default now()
    )
  `;
  await sql`create index if not exists ad_clicks_campaign_time_idx on ad_clicks (campaign_id, clicked_at desc)`;
}
