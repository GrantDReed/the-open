import { redis } from "./redis.js";
import { hashSecret, hashEquals } from "./crypto-util.js";

// The Open 2026 pool — 4 teams (Grant=9, Will Emerson=5, Ludo=3, Dave Gregory=1). Must match the TEAMS list in
// public/index.html. Draft uniqueness is enforced across these.
const TEAM_IDS = [1, 3, 5, 9];

// Editing windows (must match public/index.html). mode: "build" = initial
// pick (overwrites full roster); "swap" = one-swap transfer (writes transfer:* key).
// The Open 2026 — Royal Birkdale, July 16–19 (all times BST, UTC+1). Picks close
// at the R1 first tee time. This time-based window is a coarse backstop; the
// client additionally requires Round 2 to be actually complete before opening
// transfers (weather-delay safe). R3 transfer-close is the R3 first tee time.
// TODO: confirm exact R1 and R3 first-tee times with the official schedule.
// Master switch for the initial pick/build window — must match PICKS_OPEN in
// public/index.html. While false, build saves are rejected even inside the time
// window. Setting a PIN via /api/claim is independent and stays available.
const PICKS_OPEN = true;
const EDIT_WINDOWS = [
  { open: new Date("2026-01-01T00:00:00+01:00"), close: new Date("2026-07-16T06:35:00+01:00"), mode: "build" },
  // Post-R2 transfer window — close = R3 first tee (placeholder 08:00 BST Sat Jul 18).
  { open: new Date("2026-07-17T18:00:00+01:00"), close: new Date("2026-07-18T08:00:00+01:00"), mode: "swap" },
];
function activeWindow() {
  const now = new Date();
  // Build window only counts when the manual switch is on; swap window is
  // governed purely by time (and the client's r2Done gate).
  return EDIT_WINDOWS.find(w => (w.mode !== "build" || PICKS_OPEN) && now >= w.open && now < w.close) || null;
}

// Duplicated here so the serverless function can validate independently of the frontend.
// The Open field not yet announced — populate both here and in public/index.html
// once the tiers are set. Until then validation rejects all rosters (no in-field players).
const PRICE_TIERS = {
  4: [
    "Scottie Scheffler",
    "Rory McIlroy",
    "Matt Fitzpatrick",
    "Tommy Fleetwood",
    "Jon Rahm",
    "Xander Schauffele",
  ],
  3: [
    "Wyndham Clark",
    "Chris Gotterup",
    "Collin Morikawa",
    "Viktor Hovland",
    "Justin Rose",
    "Ludvig Åberg",
    "Tyrrell Hatton",
    "Cameron Young",
    "Robert MacIntyre",
    "Sam Burns",
    "Tom Kim",
    "Russell Henley",
    "Si Woo Kim",
    "Min Woo Lee",
    "Shane Lowry",
  ],
  2: [
    "Justin Thomas",
    "Joaquin Niemann",
    "Aaron Rai",
    "Patrick Reed",
    "Patrick Cantlay",
    "Alex Fitzpatrick",
    "Hideki Matsuyama",
    "Jordan Spieth",
    "Brooks Koepka",
    "Bryson DeChambeau",
    "Ben Griffin",
    "Eugenio Chacarra",
    "Alex Smalley",
    "JT Poston",
    "Michael Thorbjornsen",
    "JJ Spaun",
    "Akshay Bhatia",
    "Brian Harman",
    "Maverick McNealy",
    "Corey Conners",
    "Victor Perez",
    "Keith Mitchell",
    "Matt Wallace",
    "Kurt Kitayama",
    "Bud Cauley",
    "Harris English",
    "Cameron Smith",
    "Rickie Fowler",
    "Nicolai Højgaard",
    "Keegan Bradley",
    "Max Homa",
    "Kristoffer Reitan",
    "Ryan Fox",
    "Tom McKibbin",
    "Jason Day",
    "Adam Scott",
    "Alex Norén",
    "Sepp Straka",
    "Jake Knapp",
    "Harry Hall",
    "Marco Penge",
    "Jacob Bridgeman",
    "Ryan Gerard",
    "Jordan Smith",
    "David Puig",
  ],
  1: [
    "Sahith Theegala",
    "Johnny Keefer",
    "Gary Woodland",
    "Nick Taylor",
    "Angel Ayora",
    "Thomas Detry",
    "Max Greyserman",
    "Eric Cole",
    "Sungjae Im",
    "Ryo Hisatsune",
    "Rasmus Højgaard",
    "Haotong Li",
    "Casey Jarvis",
    "Michael Kim",
    "Aldrich Potgieter",
    "Jayden Schaper",
    "Rasmus Neergaard-Petersen",
    "Daniel Berger",
    "Lucas Herbert",
    "Andrew Novak",
    "Pierceson Coody",
    "Jackson Suber",
    "Sam Stevens",
    "Matt McCarty",
    "Michael Brennan",
    "Sami Välimäki",
    "John Parry",
    "Matthew Jordan",
    "Daniel Hillier",
    "Laurie Canter",
    "Keita Nakajima",
    "Bernd Wiesberger",
    "Jesper Svensson",
    "Nico Echavarria",
    "Stewart Cink",
    "Billy Horschel",
    "Scott Vincent",
    "Francesco Molinari",
    "Andy Sullivan",
    "Hennie du Plessis",
    "Daniel Brown",
    "José Luis Ballester",
    "Adrien Saddier",
    "Shaun Norris",
    "Dan Bradbury",
    "Padraig Harrington",
    "Francesco Laporta",
    "Antoine Rozner",
    "Kota Kaneko",
    "Joe Dean",
    "Peter Uihlein",
    "Kazuma Kobori",
    "Caleb Surratt",
    "Martin Couvra",
    "Matthew Southgate",
    "MJ Daffue",
    "Alistair Docherty",
    "Frederic Lacroix",
    "Michael Hollick",
    "Joakim Lagergren",
    "Henrik Stenson",
    "Matthew Baldwin",
    "Austen Truslow",
    "James Nicholas",
    "Ren Yonezawa",
    "Tim Wiedemeyer",
    "Sam Bairstow",
    "Naoyuki Kataoka",
    "Travis Smyth",
    "Jeongwoo Ham",
    "Kazuki Higa",
    "Alejandro de Castro Piera",
    "Stuart Grehan",
    "Ryutaro Nagano",
    "Bård Skogen",
    "Jack McDonald",
    "Marcus Plunkett",
    "Darren Clarke",
    "Mason Howell",
    "Jack Buchanan",
    "Cameron John",
    "Fifa Laopakdee",
    "Lev Grinberg",
    "Tiger Christensen",
    "Tom Sloman",
    "Jiho Yang",
    "Mateo Pulcini",
    "Nevill Ruiter",
    "David Howard",
    "David Duval",
  ],
};

function normalize(n) {
  // Map atomic non-ASCII letters that NFD won't decompose (ø, æ, ł, đ, ß, ð).
  const mapped = n
    .replace(/ø/g, "o").replace(/Ø/g, "O")
    .replace(/æ/g, "ae").replace(/Æ/g, "AE")
    .replace(/ł/g, "l").replace(/Ł/g, "L")
    .replace(/đ/g, "d").replace(/Đ/g, "D")
    .replace(/ð/g, "d").replace(/Ð/g, "D")
    .replace(/ß/g, "ss");
  return mapped.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z ]/g, "").trim();
}

function getPlayerCost(name) {
  const norm = normalize(name);
  for (const [tier, names] of Object.entries(PRICE_TIERS)) {
    for (const n of names) {
      if (normalize(n) === norm) return parseInt(tier);
    }
  }
  return null;
}

function validateRoster(players) {
  const errors = [];
  if (!Array.isArray(players) || players.length !== 4) {
    errors.push("Must pick exactly 4 players");
    return errors;
  }

  const names = players.map((p) => normalize(p.name));
  if (new Set(names).size !== 4) errors.push("Duplicate players");

  for (const p of players) {
    const cost = getPlayerCost(p.name);
    if (cost === null) errors.push(`${p.name} is not in the field`);
    else if (cost !== p.cost) errors.push(`${p.name} cost mismatch`);
  }

  const budget = players.reduce((s, p) => s + p.cost, 0);
  if (budget > 10) errors.push(`Budget £${budget}m exceeds £10m`);

  const tier4 = players.filter((p) => p.cost === 4).length;
  if (tier4 > 1) errors.push(`Max 1 × £4m player (have ${tier4})`);

  const tier3 = players.filter((p) => p.cost === 3).length;
  if (tier3 > 2) errors.push(`Max 2 × £3m players (have ${tier3})`);

  return errors;
}

// A team's *effective* roster = its saved roster with any pending swap applied
// (the dropped player removed, the swapped-in player added).
function effectiveRoster(roster, transfer) {
  if (!transfer) return roster;
  return roster.map((p) =>
    normalize(p.name) === normalize(transfer.out)
      ? { name: transfer.in, cost: transfer.inCost }
      : p
  );
}

// Draft rule: a golfer can be on only one team. Returns Map<normName, teamId>
// of every player currently owned by a team other than `excludeTeamId`.
async function ownedByOtherTeams(excludeTeamId) {
  const owned = new Map();
  for (const id of TEAM_IDS) {
    if (id === excludeTeamId) continue;
    const raw = await redis.get(`roster:${id}`);
    if (!raw) continue;
    const roster = JSON.parse(raw);
    if (!Array.isArray(roster)) continue;
    const tRaw = await redis.get(`transfer:${id}`);
    const transfer = tRaw ? JSON.parse(tRaw) : null;
    for (const p of effectiveRoster(roster, transfer)) owned.set(normalize(p.name), id);
  }
  return owned;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();

  // GET — return all rosters, transfers, and the draft "taken" set.
  // Draft format: players are exclusive, so nothing is hidden — rosters and
  // swaps are always visible.
  if (req.method === "GET") {
    const teams = {};
    const transfers = {};
    const taken = []; // normalized names off the draft board
    for (const id of TEAM_IDS) {
      const raw = await redis.get(`roster:${id}`);
      const roster = raw ? JSON.parse(raw) : [];
      teams[id] = roster;
      const tRaw = await redis.get(`transfer:${id}`);
      const transfer = tRaw ? JSON.parse(tRaw) : null;
      if (transfer) transfers[id] = transfer;
      for (const p of effectiveRoster(roster, transfer)) taken.push(normalize(p.name));
    }
    return res.status(200).json({ teams, transfers, taken });
  }

  // POST — save a roster (build mode) or record a swap (swap mode)
  if (req.method !== "POST") return res.status(405).json({ error: "GET or POST" });

  const window = activeWindow();
  if (!window) {
    return res.status(403).json({ error: "Editing is currently locked." });
  }

  const { teamId, pin, players } = req.body || {};
  if (teamId == null || !pin || !players) {
    return res.status(400).json({ error: "teamId, pin, and players are required" });
  }
  if (!TEAM_IDS.includes(teamId)) {
    return res.status(400).json({ error: "Invalid teamId" });
  }

  // Verify PIN
  const storedHash = await redis.get(`pin:${teamId}`);
  if (!storedHash) {
    return res.status(401).json({ error: "PIN not set. Set your PIN first." });
  }
  if (!hashEquals(storedHash, hashSecret(String(pin).trim()))) {
    return res.status(401).json({ error: "Invalid PIN" });
  }

  // Standard validation runs in both modes (budget, tier caps, in-field, no dupes)
  const errors = validateRoster(players);
  if (errors.length > 0) {
    return res.status(400).json({ error: "Invalid roster", details: errors });
  }

  if (window.mode === "swap") {
    // Need an existing roster to diff against
    const storedRaw = await redis.get(`roster:${teamId}`);
    if (!storedRaw) {
      return res.status(400).json({ error: "You don't have a roster on file — initial picks are closed." });
    }
    const stored = JSON.parse(storedRaw);
    const storedByNorm = new Map(stored.map(p => [normalize(p.name), p]));
    const submittedByNorm = new Map(players.map(p => [normalize(p.name), p]));

    const removed = stored.filter(p => !submittedByNorm.has(normalize(p.name)));
    const added = players.filter(p => !storedByNorm.has(normalize(p.name)));

    if (removed.length === 0 && added.length === 0) {
      // Revert path — clear any existing swap
      await redis.del(`transfer:${teamId}`);
      return res.status(200).json({ status: "reverted", transfer: null });
    }
    if (removed.length !== 1 || added.length !== 1) {
      return res.status(400).json({ error: "Transfer window allows exactly one swap (change one player). Re-submit your original 4 to clear an existing swap." });
    }
    const out = removed[0], inP = added[0];
    if (inP.cost > out.cost) {
      return res.status(400).json({ error: `Swap-in player must be same or lower value (£${inP.cost}m > £${out.cost}m).` });
    }

    // Draft rule: can't swap in a player who is already on another team.
    const owned = await ownedByOtherTeams(teamId);
    if (owned.has(normalize(inP.name))) {
      return res.status(409).json({ error: `${inP.name} is already on another team — pick someone else.` });
    }

    const transfer = { out: out.name, outCost: out.cost, in: inP.name, inCost: inP.cost, ts: new Date().toISOString() };
    await redis.set(`transfer:${teamId}`, JSON.stringify(transfer));
    return res.status(200).json({ status: "swapped", transfer });
  }

  // window.mode === "build"
  // Draft rule: no player may appear on more than one team. Reject any pick that
  // is already on another team's (effective) roster.
  const owned = await ownedByOtherTeams(teamId);
  const conflicts = players.filter((p) => owned.has(normalize(p.name)));
  if (conflicts.length > 0) {
    return res.status(409).json({
      error: `Already drafted by another team: ${conflicts.map((p) => p.name).join(", ")}. Each golfer can only be on one team — pick someone else.`,
    });
  }

  // Save
  await redis.set(`roster:${teamId}`, JSON.stringify(players));
  return res.status(200).json({ status: "saved", players });
}
