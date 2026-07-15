import { redis } from "./redis.js";
import { hashSecret, hashEquals } from "./crypto-util.js";

// The Open 2026 pool — 4 teams (Grant=9, Will Emerson=5, Ludo=3, Dave Gregory=1). Must match public/index.html.
const TEAM_IDS = [1, 3, 5, 9];

// Redeem a single-use claim code and set the team's PIN. The claim code only
// grants the one-time right to set a PIN — it never reveals the PIN. Codes are
// consumed atomically (GETDEL) so the same code can't be redeemed twice.
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const { code, pin } = req.body || {};
  if (!code || !pin) {
    return res.status(400).json({ error: "code and pin are required" });
  }
  // PIN or passphrase: trim ends, no spaces, 4–128 characters, any other chars.
  const pinStr = String(pin).trim();
  if (/\s/.test(pinStr)) {
    return res.status(400).json({ error: "PIN/passphrase can't contain spaces" });
  }
  if (pinStr.length < 4 || pinStr.length > 128) {
    return res.status(400).json({ error: "PIN/passphrase must be 4–128 characters" });
  }

  const codeHash = hashSecret(String(code).trim());

  // Find which team this claim code belongs to.
  let teamId = null;
  for (const id of TEAM_IDS) {
    const stored = await redis.get(`claim:${id}`);
    if (stored && hashEquals(stored, codeHash)) {
      teamId = id;
      break;
    }
  }
  if (teamId === null) {
    return res.status(401).json({ status: "invalid", error: "That claim code isn't valid or has already been used." });
  }

  // Atomically consume the code. If it's already gone (someone redeemed it
  // between our scan and now), bail — no double claims.
  const consumed = await redis.getdel(`claim:${teamId}`);
  if (!consumed || !hashEquals(consumed, codeHash)) {
    return res.status(409).json({ status: "used", error: "That claim code has already been used." });
  }

  // Set the team's PIN (peppered hash).
  await redis.set(`pin:${teamId}`, hashSecret(pinStr));

  // Mirror /api/pin's verified response so the client goes straight to editing.
  const raw = await redis.get(`roster:${teamId}`);
  const roster = raw ? JSON.parse(raw) : [];
  const tRaw = await redis.get(`transfer:${teamId}`);
  const transfer = tRaw ? JSON.parse(tRaw) : null;
  return res.status(200).json({ status: "claimed", teamId, roster, transfer });
}
