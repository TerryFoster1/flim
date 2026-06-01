import { readBody, sendJson } from "./_db.js";

export default async function handler(request: any, response: any) {
  if (request.method !== "POST") {
    return sendJson(response, 405, { error: "Method not allowed." });
  }

  try {
    const body = await readBody(request);
    const requiredFields = ["name", "email", "subject", "message"];
    const missing = requiredFields.filter((field) => !String(body[field] || "").trim());
    if (missing.length > 0) {
      return sendJson(response, 400, { error: "Please complete all contact fields." });
    }

    // TODO: Deliver through Resend, email forwarding, or a support inbox once
    // transactional email is configured. Keep the destination address server-side.
    return sendJson(response, 202, { ok: true, delivery: "queued_placeholder" });
  } catch (error) {
    return sendJson(response, 500, { error: error instanceof Error ? error.message : "Contact request failed." });
  }
}
