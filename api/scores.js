const isTheOpen = (event) => {
  // ESPN names The Open Championship exactly "The Open" (name and shortName).
  // Match "the open" specifically so we never pick up "U.S. Open" by accident.
  const name = (event?.name || event?.shortName || "").toLowerCase().replace(/\./g, "");
  return name.includes("the open");
};

// linescores[i].displayValue is the relative-to-par string ("-3", "E", "+1").
const relToPar = (rnd) => {
  if (!rnd) return null;
  const dv = rnd.displayValue;
  if (dv == null || dv === "" || dv === "-") return null;
  if (dv === "E") return 0;
  if (typeof dv === "number") return dv;
  const n = parseInt(dv, 10);
  return isNaN(n) ? null : n;
};

// Prefer top-level status.thru if the endpoint provides it; else count
// holes shot in the latest round with any play; "F" if 18 are done.
const computeThru = (c) => {
  if (c?.status?.thru != null) return String(c.status.thru);
  const ls = c?.linescores || [];
  for (let i = ls.length - 1; i >= 0; i--) {
    const holes = ls[i]?.linescores;
    if (Array.isArray(holes) && holes.length > 0) {
      return holes.length >= 18 ? "F" : String(holes.length);
    }
  }
  return null;
};

// ESPN's golf data comes from the public "scoreboard" endpoint. There is no
// working golf "leaderboard" or "summary" endpoint (both return ESPN errors),
// and usopen.com is behind Akamai bot-blocking — so this is the only viable
// feed. Note: scoreboard competitor objects carry NO per-player status, so
// withdrawals/positions are not available from this feed (see WITHDRAWN below).
const SOURCES = [
  {
    name: "espn-scoreboard",
    url: "https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard",
    parse: (data) => {
      const competitors = [];
      for (const event of data?.events || []) {
        if (!isTheOpen(event)) continue;
        for (const comp of event?.competitions || []) {
          competitors.push(...(comp.competitors || []));
        }
      }
      return competitors.map((c) => {
        const scoreVal = c.score?.displayValue ?? c.score ?? null;
        let total = null;
        if (scoreVal === "E") total = 0;
        else if (typeof scoreVal === "number") total = scoreVal;
        else if (typeof scoreVal === "string") {
          const n = parseInt(scoreVal);
          if (!isNaN(n)) total = n;
        }
        const ls = c.linescores || [];
        return {
          name: c.athlete?.displayName || "",
          total,
          thru: computeThru(c),
          r1: relToPar(ls[0]),
          r2: relToPar(ls[1]),
          r3: relToPar(ls[2]),
          r4: relToPar(ls[3]),
          pos: c.status?.position?.displayName ?? null,
          status: c.status?.type?.description ?? null,
        };
      });
    },
  },
];

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  // No edge caching — traffic is tiny (a few clients polling every 3 min) so the
  // cache saved nothing meaningful but served stale scores during live play.
  res.setHeader("Cache-Control", "no-store, max-age=0");

  const errors = [];

  for (const source of SOURCES) {
    try {
      const response = await fetch(source.url, {
        headers: { "User-Agent": "TheOpenFantasy/1.0" },
      });
      if (!response.ok) {
        errors.push(`${source.name}: HTTP ${response.status}`);
        continue;
      }
      const data = await response.json();
      const players = source.parse(data);
      if (players.length > 0) {
        return res.status(200).json({
          source: source.name,
          updated: new Date().toISOString(),
          playerCount: players.length,
          players,
        });
      }
      errors.push(`${source.name}: 0 players parsed`);
    } catch (e) {
      errors.push(`${source.name}: ${e.message}`);
    }
  }

  return res.status(200).json({
    status: "not-started",
    updated: new Date().toISOString(),
    playerCount: 0,
    players: [],
  });
}
