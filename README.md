# The Open 2026 Fantasy Challenge

Live fantasy golf dashboard for the group's 2026 Open Championship pool (Royal Birkdale, July 16–19).

Ported from the US Open app — same draft-format engine, secure self-service PINs, live cut line, and transfer window.

## How it works

- `/public/index.html` — the whole SPA (React + Babel via CDN, no build step).
- `/api/scores.js` — serverless function that pulls live scores from ESPN's public golf scoreboard (server-side, no CORS). Matches the event named "The Open".
- `/api/teams.js`, `/api/pin.js`, `/api/claim.js` — roster save/load, PIN verify, and one-time claim-code redemption, backed by Upstash Redis.
- `/api/crypto-util.js` — HMAC-SHA256 (peppered with `ADMIN_SECRET`) for PINs and claim codes.
- `/api/redis.js` — thin Upstash REST wrapper.
- `/api/admin-seed.js` — admin: seed claim codes, reset PINs, force transfers, wipe.

## Game format

- £10m budget, pick 4 golfers (tiers £4m/£3m/£2m/£1m; max one £4m, max two £3m).
- **Draft format:** every golfer can be on only one team.
- One free transfer after Round 2 (equal-or-lower value, must still be in the field).
- Lowest cumulative score-to-par wins. Missed-cut / withdrawn players take the worst active round score for R3/R4.

## Deploy (Vercel)

Requires its own Vercel project with an Upstash Redis integration (`KV_REST_API_URL`, `KV_REST_API_TOKEN`) and an `ADMIN_SECRET` env var. Deploy with `vercel --prod`.

## Still to set before go-live

- **Roster / tiers** — populate `PRICE_TIERS` in both `public/index.html` and `api/teams.js`.
- **Edit windows** — confirm the R1 and R3 first-tee times in `EDIT_WINDOWS` (both files); currently placeholders.
- **Provision** the Upstash store + `ADMIN_SECRET`, then seed claim codes via `/api/admin-seed`.
