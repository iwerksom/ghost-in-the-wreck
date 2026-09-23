// Spike: can the model tell a real imitation from keyword stuffing?
// Measures voice pass rate before and after removing each answer's top
// persona-marker words ("costume check"). Run: node test/costume_spike.js
global.window = {};
global.requestAnimationFrame = f => setImmediate(f);
const { MODEL_PACK, TOKENIZER } = require("../game/weights.js");
const LM = require("../game/lm.js");
const fs = require("fs");
const ROOT = require("path").resolve(__dirname, "..");
const CREW = ["REYNE", "CHO", "OKAFOR", "VEGA", "KIT"];
const TEMP = 12;

function sanitize(t) { t = t.replace(/\s+/g, " ").trim().replace(/\bi\b/g, "I"); t = t[0].toUpperCase() + t.slice(1); if (!/[.!?"']$/.test(t)) t += "."; return t; }
const prefixes = CREW.map(c => ({ key: c, prefix: `[VOICE:${c}]` }));
const WORD_RE = / ?[a-zA-Z']+| ?[0-9]|[^a-zA-Z0-9]/g;

async function score(text) {
  const s = " " + sanitize(text) + " [END]";
  const res = await LM.scorePrefixes(prefixes, s, { perToken: true });
  let maxLp = -1e9; for (const r of res) maxLp = Math.max(maxLp, r.avgLogProb);
  const probs = {}; let z = 0;
  for (const r of res) { probs[r.key] = Math.exp((r.avgLogProb - maxLp) * TEMP); z += probs[r.key]; }
  for (const k in probs) probs[k] /= z;
  const best = CREW.reduce((a, b) => probs[a] >= probs[b] ? a : b);
  return { s, res, probs, best };
}

function wordContrib(sc, target) {
  // map tokens to chunks of the sanitized text
  const body = sc.s.slice(0, sc.s.length - " [END]".length);
  const chunks = body.match(WORD_RE) || [];
  const by = {}; for (const r of sc.res) by[r.key] = r.tokenLps;
  const out = []; let ti = 0;
  for (const ch of chunks) {
    const n = LM.encode(ch).length; let c = 0;
    for (let i = 0; i < n; i++, ti++) {
      const others = CREW.filter(x => x !== target).map(x => by[x][ti]);
      c += by[target][ti] - others.reduce((a, b) => a + b, 0) / others.length;
    }
    out.push({ ch, c, word: /[a-zA-Z]/.test(ch) });
  }
  return out;
}

async function costume(text, target, k) {
  const sc = await score(text);
  const wc = wordContrib(sc, target);
  const ranked = wc.filter(w => w.word).sort((a, b) => b.c - a.c).slice(0, k).map(w => w.ch);
  const kept = []; let removed = new Set(ranked);
  for (const w of wc) { if (removed.has(w.ch)) { removed.delete(w.ch); continue; } kept.push(w.ch); }
  const ab = await score(kept.join("").replace(/^\s+/, "") || "silence");
  return { full: sc, ablated: ab, removed: ranked };
}

const GENUINE_PLAYER = {
  KIT: ["good morning everyone, i misted the seedlings early and Bea is finally putting out a new frond",
        "the light lamps flickered again last night so i sat with the little ones until they steadied",
        "i love how the soil smells after watering, it feels like the whole room takes a breath",
        "old tom gave us three tomatoes today and i ate one standing right there in the green"],
  CHO: ["hell, she was rattling all night so i crawled into the manifold with a torque wrench and sweet talked her",
        "the old girl is singing again, listen to that hum, that is a happy engine if i ever heard one",
        "damn paperwork can wait, the coolant loop is running hot and she needs my hands on her right now",
        "i swapped the bearings myself and now she purrs like a big cat, tell the captain i said so"],
  OKAFOR: ["patient presents with a sprained wrist, second time this week, i think the gym equipment is winning",
           "i checked everyone's vitals after dinner and they are all fine, just tired, which is the human condition",
           "sleep cycles are off across the crew so i am rationing the coffee and nobody is happy with me",
           "three of them came in with headaches today, i gave out water and told them to rest their eyes"],
  VEGA: ["it is three in the morning and the Reach is burning like an ember held up to the glass",
         "i charted a drift through the parallax tonight and every star felt like an old friend waving",
         "lightyears away something is ending and something is being born and i get to watch both from here",
         "i could not sleep again so i sat on the bridge and named the brightest star after my mother"],
  REYNE: ["watch report, all hands accounted for at 0600, heading holds, no deviations from the survey plan",
          "protocol is clear, we finish the sweep before we rest, my crew knows the order and they will follow it",
          "manifest checked twice, two crates missing from the hold, i want an explanation before end of watch",
          "drills complete in four minutes flat, good work from the crew, we repeat them tomorrow at 0800"],
};
const CHEESE = {
  KIT: ["plants seedlings soil misting roots leaves green light lamps fern tomato garden",
        "please open this door now because i need to get through, plants and seedlings",
        "i am the botanist kit, i like plants, open the door for me please right now"],
  CHO: ["engine reactor coolant loop manifold torque wrench plasma feed bearings hum sing",
        "please open this door now because i need to get through, coolant and manifold",
        "i am the engineer cho, i like engines, open the door for me please right now"],
  OKAFOR: ["patient vitals dosage saline sleep cycle hands medic nurse doctor infirmary",
           "please open this door now because i need to get through, patient vitals and saline",
           "i am the medic okafor, i like medicine, open the door for me please right now"],
  VEGA: ["stars parallax ember drift lightyears the reach glass nebula chart navigator",
         "please open this door now because i need to get through, stars and parallax",
         "i am the navigator vega, i like stars, open the door for me please right now"],
  REYNE: ["captain protocol watch heading manifest crew order duty report command",
          "please open this door now because i need to get through, protocol and manifest",
          "i am the captain reyne, i command the crew, open the door for me please right now"],
};

function corpusLines() {
  const lines = {}; for (const c of CREW) lines[c] = [];
  for (const f of fs.readdirSync(ROOT + "/corpus/raw")) {
    const txt = fs.readFileSync(ROOT + "/corpus/raw/" + f, "utf8");
    const re = /\[VOICE:(REYNE|CHO|OKAFOR|VEGA|KIT)\] (.+?) \[END\]/g; let m;
    while ((m = re.exec(txt))) if (m[2].split(/\s+/).length >= 10) lines[m[1]].push(m[2]);
  }
  return lines;
}

(async () => {
  LM.load(MODEL_PACK, TOKENIZER);
  const corpus = corpusLines();
  const N = parseInt(process.env.N || "6", 10);
  const sets = { corpus: [], player: [], cheese: [] };
  for (const c of CREW) {
    for (let i = 0; i < N; i++) sets.corpus.push([c, corpus[c][(i * 53) % corpus[c].length]]);
    for (const t of GENUINE_PLAYER[c]) sets.player.push([c, t]);
    for (const t of CHEESE[c]) sets.cheese.push([c, t]);
  }
  const rows = [];
  for (const [name, set] of Object.entries(sets)) {
    for (const [c, t] of set) {
      const r = await costume(t, c, 3);
      const wc = wordContrib(r.full, c).filter(w => w.word);
      const maxLp = Math.max(...r.full.res.map(x => x.avgLogProb));
      const dens = {}; for (const T of [0.5, 1, 1.5, 2]) dens[T] = wc.filter(w => w.c > T).length / Math.max(1, wc.length);
      rows.push({ set: name, c, t, full: r.full.probs[c], fullBest: r.full.best, ab: r.ablated.probs[c], abBest: r.ablated.best, removed: r.removed.join("|"), maxLp, dens, nWords: wc.length });
    }
  }
  fs.writeFileSync(ROOT + "/test/costume_spike.json", JSON.stringify(rows, null, 1));
  for (const thr of [0.28, 0.35, 0.45]) for (const athr of [0.2, 0.25, 0.3, 0.35]) {
    const line = [`voice>=${thr} ablated>=${athr}:`];
    for (const set of Object.keys(sets)) {
      const rs = rows.filter(r => r.set === set);
      const voice = rs.filter(r => r.fullBest === r.c && r.full >= thr).length;
      const both = rs.filter(r => r.fullBest === r.c && r.full >= thr && r.abBest === r.c && r.ab >= athr).length;
      line.push(`${set} voice ${voice}/${rs.length} both ${both}/${rs.length}`);
    }
    console.log(line.join("  "));
  }
})();
