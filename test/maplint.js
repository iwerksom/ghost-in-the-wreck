// Map lint: every deck must have S; all interactables reachable from S
// (entities count as reachable if any adjacent tile is reachable); no
// duplicate entity digits; digits all defined in meta.
const DECKS = require("../data/maps.json").decks;

let fail = 0;
for (const deck of DECKS) {
  const rows = deck.map;
  const h = rows.length, w = Math.max(...rows.map(r => r.length));
  const at = (x, y) => (rows[y] || "")[x] || " ";
  let sx = -1, sy = -1;
  const digits = {};
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = at(x, y);
    if (c === "S") { sx = x; sy = y; }
    if (c >= "1" && c <= "9") {
      if (digits[c]) { console.log(`${deck.id}: duplicate digit ${c}`); fail++; }
      digits[c] = [x, y];
      if (!deck.entities[c]) { console.log(`${deck.id}: digit ${c} not in meta`); fail++; }
    }
  }
  for (const k of Object.keys(deck.entities)) if (!digits[k]) { console.log(`${deck.id}: meta entity ${k} not on map`); fail++; }
  if (sx < 0) { console.log(`${deck.id}: no spawn`); fail++; continue; }
  // walkable = not wall/void/window; digits and letters walk-adjacent
  const walk = c => !(c === " " || c === "#" || c === "W" || c === "%" || c === "*");
  // BFS treating interactable-entity tiles as blocking but reachable-adjacent
  const blocking = c => "DE".includes(c) ? false : ("123456789TOLIP".includes(c) ? false : false);
  const seen = new Set([sx + "," + sy]);
  const q = [[sx, sy]];
  while (q.length) {
    const [x, y] = q.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, c = at(nx, ny);
      if (!walk(c)) continue;
      const key = nx + "," + ny;
      if (seen.has(key)) continue;
      seen.add(key);
      // solid interactables are reachable but you cannot pass through them
      const meta = deck.entities[c];
      const passthrough = !(c >= "1" && c <= "9") || (meta && ["echodoor", "door"].includes(meta.type));
      if (passthrough) q.push([nx, ny]);
    }
  }
  for (const [d, [x, y]] of Object.entries(digits)) {
    if (!seen.has(x + "," + y)) { console.log(`${deck.id}: entity ${d} (${deck.entities[d].type}) UNREACHABLE at ${x},${y}`); fail++; }
  }
  // pickups & bodies reachable
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = at(x, y);
    if ("OPB".includes(c) && !seen.has(x + "," + y)) { console.log(`${deck.id}: ${c} unreachable at ${x},${y}`); fail++; }
  }
  // floor tiles adjacent to raw void (leak)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = at(x, y);
    if (walk(c) && c !== " ") {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (at(x + dx, y + dy) === " " && seen.has(x + "," + y)) {
          console.log(`${deck.id}: leak to void at ${x},${y} ('${c}')`); fail++;
        }
      }
    }
  }
  console.log(`${deck.id}: spawn ${sx},${sy}, reachable tiles ${seen.size}, entities ${Object.keys(digits).length}`);
}
// iteration 2: every door memory must be findable on the door's deck or an earlier one
const STORY = require("../data/story.json");
if (STORY.clues && STORY.door_challenges) {
  const deckOf = {};   // persona -> deck index of its door
  const srcDeck = {};  // clue id -> earliest deck index where it can be found
  const note = (id, i) => { if (srcDeck[id] === undefined || i < srcDeck[id]) srcDeck[id] = i; };
  DECKS.forEach((deck, i) => {
    for (const m of Object.values(deck.entities)) {
      if (m.type === "echodoor") deckOf[m.persona] = i;
      for (const id of m.clues || []) note(id, i);
      if (m.type === "archive") for (const [id, c] of Object.entries(STORY.clues)) if ((c.archives || []).includes(m.key)) note(id, i);
    }
    const ks = (STORY.keepsakes || {})[deck.id];
    if (ks && ks.clue && deck.map.some(r => r.includes("B"))) note(ks.clue, i);
  });
  for (const [id, c] of Object.entries(STORY.clues)) {
    if (c.distractor || !c.door) continue;
    if (srcDeck[id] === undefined) { console.log(`clue ${id}: no source on any deck`); fail++; continue; }
    if (deckOf[c.door] !== undefined && srcDeck[id] > deckOf[c.door]) { console.log(`clue ${id}: first source on deck ${srcDeck[id]}, after its door on deck ${deckOf[c.door]}`); fail++; }
  }
  console.log(`clues: ${Object.keys(srcDeck).length} placed, every door memory reachable in time`);
}
console.log(fail ? `FAIL: ${fail} issues` : "ALL MAPS OK");
process.exit(fail ? 1 : 0);
