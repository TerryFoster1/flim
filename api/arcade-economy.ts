import { db, getCurrentUser, sendJson } from "./_db.js";
import { arcadeEconomyArchitecture, ensureArcadeEconomyTables } from "./_arcadeEconomy.js";
import { isArcadeEconomyEnabled } from "./_featureFlags.js";

async function walletSnapshot(sql: any, userId: string) {
  const rows = await sql`
    select token_balance, ticket_balance, lifetime_tickets_earned, lifetime_tickets_spent
    from arcade_wallets
    where user_id = ${userId}
    limit 1
  `;
  const wallet = rows[0];
  return {
    tokenBalance: Number(wallet?.token_balance || 0),
    ticketBalance: Number(wallet?.ticket_balance || 0),
    lifetimeTicketsEarned: Number(wallet?.lifetime_tickets_earned || 0),
    lifetimeTicketsSpent: Number(wallet?.lifetime_tickets_spent || 0),
  };
}

async function rewardCatalog(sql: any) {
  const rows = await sql`
    select
      r.public_id,
      r.reward_type,
      r.name,
      r.description,
      r.ticket_cost,
      r.inventory_type,
      r.remaining_inventory,
      c.category_key,
      c.name as category_name
    from concession_rewards r
    left join concession_reward_categories c on c.id = r.category_id
    where r.status = 'active'
      and (r.starts_at is null or r.starts_at <= now())
      and (r.ends_at is null or r.ends_at >= now())
    order by c.display_order nulls last, r.ticket_cost asc, r.name asc
    limit 24
  `;

  return rows.map((row: any) => ({
    publicId: row.public_id,
    rewardType: row.reward_type,
    name: row.name,
    description: row.description || "",
    ticketCost: Number(row.ticket_cost || 0),
    inventoryType: row.inventory_type,
    remainingInventory: row.remaining_inventory === null || row.remaining_inventory === undefined ? undefined : Number(row.remaining_inventory),
    categoryKey: row.category_key || undefined,
    categoryName: row.category_name || undefined,
  }));
}

export default async function handler(request: any, response: any) {
  if (request.method !== "GET") return sendJson(response, 405, { error: "Method not allowed." });

  if (!isArcadeEconomyEnabled()) {
    return sendJson(response, 200, {
      ...arcadeEconomyArchitecture(),
      enabled: false,
      message: "Arcade economy architecture is prepared but not enabled.",
    });
  }

  try {
    const sql = db();
    await ensureArcadeEconomyTables(sql);
    const user = await getCurrentUser(sql, request);

    return sendJson(response, 200, {
      enabled: true,
      wallet: user ? await walletSnapshot(sql, user.id) : null,
      rewards: await rewardCatalog(sql),
      rules: {
        triviaIsFree: true,
        dailyChallengesAreFree: true,
        seasonalChallengesAreFree: true,
        purchasableTokensEnabled: false,
        realWorldRewardsEnabled: false,
      },
    });
  } catch (error) {
    console.error("arcade_economy_failed", error instanceof Error ? error.message : "Arcade economy request failed.");
    return sendJson(response, 500, { error: "Arcade economy is unavailable right now." });
  }
}
