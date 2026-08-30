// Calibrate voice-judgment thresholds against held-out VOICE lines.
// Writes game/calibration.js. Run AFTER export.py.
global.window = {};
const { MODEL_PACK, TOKENIZER } = require("../game/weights.js");
const LM = require("../game/lm.js");
const fs = require("fs");
const ROOT = require("path").resolve(__dirname, "..");

const CREW = ["REYNE", "CHO", "OKAFOR", "VEGA", "KIT"];
const N_PER = parseInt(process.env.N || "14", 10);

function loadVoiceLines() {
  const dir = ROOT + "/corpus/raw";
  const lines = {};
  for (const c of CREW) lines[c] = [];
  for (const f of fs.readdirSync(dir)) {
    const txt = fs.readFileSync(dir + "/" + f, "utf8");
    const re = /\[VOICE:(REYNE|CHO|OKAFOR|VEGA|KIT)\] (.+?) \[END\]/g;
    let m;
    while ((m = re.exec(txt))) lines[m[1]].push(m[2]);
  }
  return lines;
}

// player-like short paraphrases (never in corpus verbatim)
const PLAYER_LIKE = {
  KIT: ["the ferns need misting again", "i watered the seedlings this morning", "old tom has new leaves, green as anything", "the garden smells alive today"],
  CHO: ["the coolant loop is running hot again", "the old girl sang for me today", "damn manifold needs a torque wrench", "reactor is purring like she should"],
  OKAFOR: ["vitals are stable, patient is resting", "second sprain this week, i counted", "gave a half dose of saline and watched the sleep cycle", "everyone came to dinner, all five of us"],
  VEGA: ["the stars kept me up again at 0300", "plotted a course through the reach by parallax", "the nebula burns like an old ember tonight", "i named another star after nobody"],
  REYNE: ["watch report filed at 0600, all hands accounted for", "protocol before feeling, that is the job", "my crew comes first, the manifest second", "drills complete, the crew performed well"],
};
const GIBBERISH = ["asdf jkl qwerty zxc", "aaaa bbbb cccc dddd", "kwjhr fdskj ewrklj", "zzz qqq xxx vvv www"];

(async () => {
  LM.load(MODEL_PACK, TOKENIZER);
  const lines = loadVoiceLines();
  const prefixes = CREW.map(c => ({ key: c, prefix: `[VOICE:${c}]` }));

  function sanitize(t) {
    t = t.trim();
    t = t[0].toUpperCase() + t.slice(1);
    if (!/[.!?"']$/.test(t)) t += ".";
    return t;
  }
  async function judge(text) {
    const res = await LM.scorePrefixes(prefixes, " " + sanitize(text) + " [END]", {});
    let best = null, bestLp = -1e9;
    const byKey = {};
    for (const r of res) { byKey[r.key] = r.avgLogProb; if (r.avgLogProb > bestLp) { bestLp = r.avgLogProb; best = r.key; } }
    return { best, bestLp, byKey };
  }

  // 1) accuracy on held-out corpus lines (memorized-ish, upper bound)
  let correct = 0, total = 0;
  const margins = [];  // (target lp - best other lp)
  const bestLps = [];
  for (const c of CREW) {
    const pool = lines[c];
    for (let i = 0; i < Math.min(N_PER, pool.length); i++) {
      const t = pool[(i * 37) % pool.length];
      const j = await judge(t);
      total++;
      if (j.best === c) correct++;
      const others = CREW.filter(x => x !== c).map(x => j.byKey[x]);
      margins.push(j.byKey[c] - Math.max(...others));
      bestLps.push(j.bestLp);
    }
  }
  console.log(`corpus lines: ${correct}/${total} = ${(100 * correct / total).toFixed(1)}%`);

  // 2) accuracy on player-like paraphrases (the real test)
  let pc = 0, pt = 0;
  const pMargins = [];
  for (const c of CREW) {
    for (const t of PLAYER_LIKE[c]) {
      const j = await judge(t);
      pt++;
      if (j.best === c) pc++; else console.log(`  miss: [${c}] "${t}" -> ${j.best}`);
      const others = CREW.filter(x => x !== c).map(x => j.byKey[x]);
      pMargins.push(j.byKey[c] - Math.max(...others));
      bestLps.push(j.bestLp);
    }
  }
  console.log(`player-like: ${pc}/${pt} = ${(100 * pc / pt).toFixed(1)}%`);

  // 3) gibberish: token-per-char ratio separates it (nonsense -> byte tokens)
  const ratio = t => LM.encode(t).length / Math.max(1, t.length);
  const gLps = [], gRatios = [];
  for (const g of GIBBERISH) {
    const j = await judge(g);
    gLps.push(j.bestLp); gRatios.push(ratio(g));
  }
  const realRatios = [];
  for (const c of CREW) for (const t of PLAYER_LIKE[c]) realRatios.push(ratio(t));
  const minReal = Math.min(...bestLps);
  const maxGib = Math.max(...gLps);
  console.log(`real bestLp min ${minReal.toFixed(2)} | gib bestLp max ${maxGib.toFixed(2)}`);
  console.log(`real tokRatio max ${Math.max(...realRatios).toFixed(2)} | gib tokRatio min ${Math.min(...gRatios).toFixed(2)}`);
  const maxTokRatio = +((Math.max(...realRatios) + Math.min(...gRatios)) / 2).toFixed(2);
  const staticFloor = +(minReal - 0.8).toFixed(2);

  // 4) pick softmax temp so that a median-margin correct answer lands ~55-65% prob
  const med = pMargins.slice().sort((a, b) => a - b)[Math.floor(pMargins.length / 2)];
  // with margin m over 4 rivals: p = 1/(1+4*exp(-temp*m)); want p=0.6 => temp = ln(4*0.6/0.4)/m
  const voiceTemp = Math.max(1.5, Math.min(9, Math.log(6) / Math.max(0.05, med)));
  const cal = {
    voiceTemp: +voiceTemp.toFixed(2),
    doorThreshold: 0.34,
    staticFloor,
    maxTokRatio,
    restBias: 0.0,
  };
  console.log("calibration:", cal);
  fs.writeFileSync(ROOT + "/game/calibration.js",
    "// generated by test/calibrate.js\nconst CALIBRATION = " + JSON.stringify(cal) + ";\n");

  // 5) with chosen temp, report door pass-rate on player-like lines
  let pass = 0;
  for (let i = 0; i < pMargins.length; i++) {
    const p = 1 / (1 + 4 * Math.exp(-cal.voiceTemp * pMargins[i]));
    if (p >= cal.doorThreshold) pass++;
  }
  console.log(`door pass-rate on correct player-like lines at threshold: ${pass}/${pMargins.length}`);
})();
