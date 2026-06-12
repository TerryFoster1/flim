import { db, errorStatus, getCurrentUser, sendJson } from "./_db.js";
import { readTicketEarningRules, readTicketHistory, readTicketWallet } from "./_arcadeEconomy.js";

export default async function handler(request: any, response: any) {
  if (request.method !== "GET") return sendJson(response, 405, { error: "Method not allowed." });

  try {
    const sql = db();
    const user = await getCurrentUser(sql, request);
    if (!user?.id) return sendJson(response, 401, { error: "Sign in to view Tickets." });

    const url = new URL(request.url || "/api/tickets", "https://www.flim.ca");
    const limit = Number(url.searchParams.get("limit") || 20);
    const [wallet, history, earningRules] = await Promise.all([
      readTicketWallet(sql, user.id),
      readTicketHistory(sql, user.id, limit),
      readTicketEarningRules(sql),
    ]);

    return sendJson(response, 200, {
      wallet,
      history,
      earningRules,
      rules: {
        ticketsAreEarned: true,
        ticketsArePurchasable: false,
        concessionStandEnabled: false,
        rewardRedemptionsEnabled: false,
      },
    });
  } catch (error) {
    return sendJson(response, errorStatus(error), { error: error instanceof Error ? error.message : "Tickets are unavailable right now." });
  }
}
