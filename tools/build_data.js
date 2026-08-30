// Generates game/maps.js and game/gamedata.js from the engine-neutral
// data files in data/. Run before build_artifact.py.
const fs = require("fs");
const path = require("path");
const R = p => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", p)));

const maps = R("maps.json");
const story = R("story.json");
const tuning = R("tuning.json");

// --- light validation ---
const errs = [];
if (!Array.isArray(maps.decks) || maps.decks.length < 1) errs.push("maps: no decks");
for (const d of maps.decks) {
  if (!d.id || !d.name || !Array.isArray(d.map)) errs.push(`deck ${d.id}: missing fields`);
  if (!d.map.some(r => r.includes("S")) && d.id) errs.push(`deck ${d.id}: no spawn S`);
}
for (const c of story.crew) {
  if (!story.crew_names[c]) errs.push(`story: no crew_name for ${c}`);
  if (c !== "ECHO" && !story.death_days[c]) errs.push(`story: no death_day for ${c}`);
}
for (const k of ["log", "echo_reply", "ambient", "sys", "voice_hint"])
  if (!tuning.sampling[k]) errs.push(`tuning: missing sampling.${k}`);
if (errs.length) { console.error("DATA INVALID:\n" + errs.join("\n")); process.exit(1); }

const G = path.join(__dirname, "..", "game");
fs.writeFileSync(path.join(G, "maps.js"),
  "// GENERATED from data/maps.json — edit the JSON, not this file. Run tools/build_data.js.\n" +
  '"use strict";\nconst DECKS = ' + JSON.stringify(maps.decks, null, 1) +
  ";\nif (typeof module !== \"undefined\") module.exports = DECKS;\n");
fs.writeFileSync(path.join(G, "gamedata.js"),
  "// GENERATED from data/story.json + data/tuning.json — edit the JSON, not this file.\n" +
  '"use strict";\nconst GAMEDATA = ' + JSON.stringify({ story, tuning }, null, 1) +
  ";\nif (typeof module !== \"undefined\") module.exports = GAMEDATA;\n");
console.log("generated game/maps.js and game/gamedata.js");
