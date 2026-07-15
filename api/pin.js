import { redis } from "./redis.js";
import { hashSecret, hashEquals } from "./crypto-util.js";

// The Open 2026 pool — 4 teams (Grant=9, Will Emerson=5, Ludo=3, Dave Gregory=1). Must match public/index.html.
const TEAM_IDS = [1, 3, 5, 9];

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const { pin } = req.body || {};
  if (!pin) {
    return res.status(400).json({ error: "pin is required" });
  }

  const hash = hashSecret(String(pin).trim());

  // Scan all teams to find which PIN matches
  for (const id of TEAM_IDS) {
    const stored = await redis.get(`pin:${id}`);
    if (stored && hashEquals(stored, hash)) {
      const raw = await redis.get(`roster:${id}`);
      const roster = raw ? JSON.parse(raw) : [];
      const tRaw = await redis.get(`transfer:${id}`);
      const transfer = tRaw ? JSON.parse(tRaw) : null;
      return res.status(200).json({ status: "verified", teamId: id, roster, transfer });
    }
  }

  return res.status(401).json({ status: "invalid" });
}
