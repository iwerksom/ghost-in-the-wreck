// Air economy simulator (iteration 2). Estimates the lowest air per deck for
// a fast and a slow player, from real map distances and the tuning in
// data/tuning.json. It is a model, not a playtest: use it to pick starting
// numbers, then trust the playtest report.  Run: node tools/econ_sim.js
const maps = require("../data/maps.json");
const tuning = require("../data/tuning.json");
const story = require("../data/story.json");
const E = tuning.economy;

const PLAYERS = {
  // detour: walked distance / shortest path. reads: generated logs per clue terminal.
  // doorTries: attempts per voice door. typeSec: seconds per attempt (read ECHO, think, type, wait).
  fast: { detour: 1.3, reads: 1, readSec: 14, archiveSec: 10, kneelSec: 8, doorTries: 1.5, typeSec: 30, farewell: false, gardenSec: 0 },
  slow: { detour: 2.2, reads: 2, readSec: 25, archiveSec: 22, kneelSec: 25, doorTries: 3, typeSec: 45, farewell: true, gardenSec: 20 },
};

function bfs(deck, from) {
  const rows = deck.map, at = (x, y) => (rows[y] || "")[x] || " ";
  const walk = c => !(c === " " || c === "#" || c === "W" || c === "%" || c === "*");
  from = [from[0], from[1]];
  const dist = new Map([[from.join(","), 0]]);
  const q = [from];
  while (q.length) {
    const [x, y] = q.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, k = nx + "," + ny;
      if (dist.has(k) || !walk(at(nx, ny))) continue;
      dist.set(k, dist.get(x + "," + y) + 1);
      const c = at(nx, ny);
      const meta = deck.entities[c];
      if (c >= "1" && c <= "9" && !(meta && meta.type === "echodoor")) continue; // solid interactables
      q.push([nx, ny]);
    }
  }
  return dist;
}
function find(deck, pred) {
  const out = [];
  deck.map.forEach((r, y) => [...r].forEach((c, x) => { if (pred(c, deck.entities[c])) out.push([x, y, c]); }));
  return out;
}
function tilesBetween(deck, a, b) {
  const d = bfs(deck, a);
  let best = Infinity;
  for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const v = d.get((b[0] + dx) + "," + (b[1] + dy));
    if (v !== undefined) best = Math.min(best, v);
  }
  return best === Infinity ? 0 : best;
}

function simulate(kind, P) {
  let o2 = 100;
  const drain = 100 / E.o2_tank_seconds;
  const rows = [];
  let deaths = 0;
  const sus = 0.25; // assume ECHO stays around WARY
  const susMul = 1 + sus * tuning.suspicion.drain_bonus_at_max;
  for (const deck of maps.decks) {
    if (deck.id === "core") continue;
    o2 = Math.max(o2, E.first_visit_min_o2 || 0, E.deck_entry_min_o2 || 0);
    let min = o2;
    const spend = x => { o2 -= x; min = Math.min(min, o2); if (o2 <= 0) { deaths++; o2 = 100; } };
    const spawn = find(deck, c => c === "S")[0];
    // route: every interactable in reading order, nearest first, then the lift
    const stops = find(deck, (c, m) => m && ["terminal", "archive", "echodoor", "socket"].includes(m.type)).concat(find(deck, c => c === "B" || c === "P"));
    const lift = find(deck, (c, m) => m && m.type === "lift")[0];
    let pos = spawn;
    const left = stops.slice();
    const cans = find(deck, c => c === "O");
    while (left.length) {
      left.sort((a, b) => tilesBetween(deck, pos, a) - tilesBetween(deck, pos, b));
      const s = left.shift();
      const secs = tilesBetween(deck, pos, s) * 32 / E.player_speed * P.detour;
      spend(drain * susMul * secs);
      // canisters within a short detour get picked up
      for (let i = cans.length - 1; i >= 0; i--) {
        if (tilesBetween(deck, s, cans[i]) <= (kind === "slow" ? 14 : 7)) { o2 = Math.min(100, o2 + E.o2_canister); cans.splice(i, 1); }
      }
      const m = deck.entities[s[2]];
      const f = E.overlay_drain;
      if (m && m.type === "terminal") spend(drain * susMul * f.termOverlay * P.readSec * ((m.clues || []).length ? P.reads : Math.min(1, P.reads)));
      if (m && m.type === "archive") spend(drain * susMul * f.termOverlay * P.archiveSec);
      if (s[2] === "B") { spend(drain * susMul * f.noteOverlay * (P.kneelSec + (P.farewell ? 20 : 0))); }
      if (m && m.type === "echodoor") {
        const tries = P.doorTries;
        spend(drain * susMul * f.doorOverlay * P.typeSec * tries);
        spend(E.door_fail_o2_cost * (1 + sus) * Math.max(0, tries - 1));
        const ch = story.door_challenges[m.persona];
        if (ch && ch.turns.length > 1) spend(drain * susMul * f.doorOverlay * P.typeSec * (ch.turns.length - 1));
        if (ch && ch.reward && ch.reward.air) o2 = Math.min(100, o2 + ch.reward.air);
      }
      pos = s;
    }
    if (deck.id === "hydro" && P.gardenSec) o2 = Math.min(100, o2 + (E.garden_regen_per_s - drain) * P.gardenSec);
    const secs = tilesBetween(deck, pos, lift) * 32 / E.player_speed * P.detour;
    spend(drain * susMul * secs);
    rows.push(`${deck.id.padEnd(7)} lowest ${String(Math.round(min)).padStart(4)}%  leaves with ${String(Math.round(o2)).padStart(4)}%`);
  }
  return { rows, deaths };
}

for (const [k, P] of Object.entries(PLAYERS)) {
  const r = simulate(k, P);
  console.log(`\n${k.toUpperCase()} player  (deaths ${r.deaths})`);
  console.log(r.rows.join("\n"));
}
