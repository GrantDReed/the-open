import { createHmac, timingSafeEqual } from "crypto";

// Secret pepper. A bare SHA-256 of a 4-digit PIN is trivially brute-forced
// (10k candidates), so we key the hash with a server-only secret. Anyone with
// DB read access still can't reverse a PIN or claim code without this secret.
const SECRET = process.env.ADMIN_SECRET || "";

// HMAC-SHA256(value, SECRET) — used for both PINs and single-use claim codes.
export function hashSecret(value) {
  return createHmac("sha256", SECRET).update(String(value)).digest("hex");
}

// Constant-time comparison of two hex-hash strings.
export function hashEquals(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}
