import { redis } from "./redis.js";
import { hashSecret } from "./crypto-util.js";

// The Open 2026 pool — 4 teams (Grant=9, Will Emerson=5, Ludo=3, Dave Gregory=1). Must match public/index.html.
const TEAM_IDS = [1, 3, 5, 9];

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  // Protect with a simple admin secret
  const { secret, pins, claimCodes, clearPins, transfers, action } = req.body || {};
  if (secret !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ error: "Invalid admin secret" });
  }

  // Seed / reset single-use claim codes. Body shape:
  //   claimCodes: { "<teamId>": "CODE" }  (set, or null to clear)
  //   clearPins: [<teamId>, ...]          (optional; reset = clear PIN + new code)
  // A claim code only grants the one-time right to set a PIN; redeeming it
  // (via /api/claim) consumes the code. Use clearPins together with claimCodes
  // to fully reset a team (forgotten PIN): clears the old PIN and issues a new code.
  if (claimCodes && typeof claimCodes === "object") {
    const results = [];
    for (const id of clearPins || []) {
      await redis.del(`pin:${id}`);
    }
    for (const [teamId, code] of Object.entries(claimCodes)) {
      if (code === null) {
        await redis.del(`claim:${teamId}`);
        results.push({ teamId, status: "cleared" });
        continue;
      }
      await redis.set(`claim:${teamId}`, hashSecret(String(code).trim()));
      results.push({ teamId, status: "set" });
    }
    return res.status(200).json({ status: "claim-codes-written", clearedPins: clearPins || [], results });
  }

  // Force-write transfers (used to record swaps after the window closes,
  // e.g. when a participant forgot to submit during the window).
  // Body shape: transfers: { "<teamId>": { out, outCost, in, inCost } } or null to clear.
  if (transfers && typeof transfers === "object") {
    const results = [];
    for (const [teamId, t] of Object.entries(transfers)) {
      if (t === null) {
        await redis.del(`transfer:${teamId}`);
        results.push({ teamId, status: "cleared" });
        continue;
      }
      if (!t.out || !t.in || t.outCost == null || t.inCost == null) {
        results.push({ teamId, status: "skipped", reason: "out, outCost, in, inCost all required" });
        continue;
      }
      const record = { out: t.out, outCost: t.outCost, in: t.in, inCost: t.inCost, ts: new Date().toISOString(), source: "admin" };
      await redis.set(`transfer:${teamId}`, JSON.stringify(record));
      results.push({ teamId, status: "set", transfer: record });
    }
    return res.status(200).json({ status: "transfers-written", results });
  }

  // Wipe rosters (and optionally PINs)
  if (action === "wipe") {
    for (const id of TEAM_IDS) {
      await redis.del(`roster:${id}`);
    }
    if (req.body.wipePins) {
      for (const id of TEAM_IDS) {
        await redis.del(`pin:${id}`);
      }
    }
    if (req.body.wipeTransfers) {
      for (const id of TEAM_IDS) {
        await redis.del(`transfer:${id}`);
      }
    }
    if (req.body.wipeClaimCodes) {
      for (const id of TEAM_IDS) {
        await redis.del(`claim:${id}`);
      }
    }
    return res.status(200).json({ status: "wiped", rosters: true, pins: !!req.body.wipePins, transfers: !!req.body.wipeTransfers, claimCodes: !!req.body.wipeClaimCodes });
  }

  // Seed PINs directly — pins: { "<teamId>": "1234", ... }. Normally PINs are
  // self-set via claim codes; this is an admin override.
  if (!pins || typeof pins !== "object") {
    return res.status(400).json({ error: "pins, claimCodes, transfers object required, or use action:\"wipe\"" });
  }

  const results = [];
  for (const [teamId, pin] of Object.entries(pins)) {
    await redis.set(`pin:${teamId}`, hashSecret(pin));
    results.push({ teamId, status: "set" });
  }

  return res.status(200).json({ status: "seeded", results });
}
