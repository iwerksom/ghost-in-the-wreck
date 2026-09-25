// ============================================================================
// doors.js — iteration 2 interrogation doors.
//
// A door answer must pass three independent layers:
//   structure  deterministic: length, a real sentence (not a tool list), no
//              begging for doors, no "I am the medic", no reading a log back,
//              no repeating an earlier attempt
//   memory     deterministic: the fact ECHO asked for, found in the logs
//   voice      the model: whose voice the words carry, plus a marker-density
//              check so a sentence that is all profession words reads as a
//              costume
//
// Pure logic, no DOM: runs in the browser and in node (test/door_test.js).
// ============================================================================
"use strict";

const Doors = (() => {
  const G = (typeof GAMEDATA !== "undefined") ? GAMEDATA : require("./gamedata.js");
  const LMr = (typeof LM !== "undefined") ? LM : require("./lm.js");
  const CALr = (typeof CALIBRATION !== "undefined") ? CALIBRATION : { voiceTemp: 12, staticFloor: -5.48, maxTokRatio: 0.58 };
  const SD = G.story, TU = G.tuning;
  const DV = TU.doors_v2;
  const CREW = SD.crew.filter(c => c !== "ECHO");
  const CHALLENGES = SD.door_challenges;
  const CLUES = SD.clues;
  const LINES = SD.echo_lines;

  const STOP = new Set(("i me my mine we us our you your he him his she her it its they them their " +
    "the a an and or but so to of in on at for with from by is are was were be been am do did does " +
    "not no this that these those all as if then than just what when there here have has had will " +
    "would can could up out down over into about like one").split(" "));

  // ---------------- text helpers ----------------
  function sanitize(t) {
    t = (t || "").replace(/\s+/g, " ").trim();
    t = t.split("").filter(c => c.charCodeAt(0) >= 32 && c.charCodeAt(0) < 127).join("");
    t = t.slice(0, 220).trim();
    if (!t) return t;
    t = t.replace(/\bi\b/g, "I").replace(/\bi'(m|ll|ve|d)\b/g, "I'$1");
    t = t[0].toUpperCase() + t.slice(1);
    if (!/[.!?"']$/.test(t)) t += ".";
    return t;
  }
  const words = t => (t.toLowerCase().match(/[a-z0-9']+/g) || []);

  function editDistance(a, b) {
    const m = a.length, n = b.length;
    if (Math.abs(m - n) > 3) return 99;
    const dp = Array.from({ length: m + 1 }, (_, i) => [i]);
    for (let j = 1; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return dp[m][n];
  }
  // index of the first word position where answer phrase `ans` occurs (fuzzy for long single words)
  function findPhrase(ws, ans) {
    const aw = ans.toLowerCase().split(/\s+/);
    for (let i = 0; i + aw.length <= ws.length; i++) {
      let ok = true;
      for (let k = 0; k < aw.length; k++) {
        const w = ws[i + k].replace(/'s$/, ""), target = aw[k];
        if (w === target) continue;
        if (target.length >= DV.fuzzy_min_len && editDistance(w, target) <= DV.fuzzy_max_edits) continue;
        if (/^\d+$/.test(target) || target.length < DV.fuzzy_min_len) { ok = false; break; }
        ok = false; break;
      }
      if (ok) return i;
    }
    return -1;
  }

  // ---------------- layer 1: structure ----------------
  function structure(text, ctx = {}) {
    const ws = words(text);
    if (ws.length < DV.min_words) return { ok: false, reason: "short", detail: `${ws.length} of ${DV.min_words} words` };
    const stops = ws.filter(w => STOP.has(w)).length;
    if (stops / ws.length < DV.min_stopword_ratio) return { ok: false, reason: "salad" };
    if (/\b(open|unlock|unseal)\b[^.!?]*\b(door|doors|hatch|seal|vault|way|up)\b|\blet me (in|through|pass)\b|\bpass(word|code)\b/i.test(text))
      return { ok: false, reason: "begging" };
    if (/\b(i am|i'm|this is|my name is|call me)\s+(the\s+|your\s+)?(captain|engineer|chief|medic|doctor|navigator|botanist|gardener|kit|cho|okafor|vega|reyne|mara|dae|ben|sol|aune)\b/i.test(text))
      return { ok: false, reason: "claiming" };
    const n = DV.copy_ngram;
    if (ctx.sources && ws.length >= n) {
      const grams = new Set();
      for (let i = 0; i + n <= ws.length; i++) grams.add(ws.slice(i, i + n).join(" "));
      for (const src of ctx.sources) {
        const sw = words(src);
        for (let i = 0; i + n <= sw.length; i++) if (grams.has(sw.slice(i, i + n).join(" "))) return { ok: false, reason: "recital" };
      }
    }
    if (ctx.previous) {
      const a = new Set(ws.filter(w => !STOP.has(w)));
      for (const p of ctx.previous) {
        const b = new Set(words(p).filter(w => !STOP.has(w)));
        let inter = 0;
        for (const w of a) if (b.has(w)) inter++;
        const uni = a.size + b.size - inter;
        if (uni > 0 && inter / uni >= DV.repeat_jaccard) return { ok: false, reason: "repeat" };
      }
    }
    return { ok: true };
  }

  // ---------------- layer 2: memory (fact) ----------------
  function memory(text, fact) {
    if (!fact) return { ok: true, skipped: true };
    const ws = words(text);
    if (fact.mode === "ordered") {
      let last = -1;
      for (const group of fact.groups) {
        let pos = -1;
        for (const ans of group) { const p = findPhrase(ws, ans); if (p >= 0 && (pos < 0 || p < pos)) pos = p; }
        if (pos < 0) return { ok: false, reason: "fact", detail: "missing a name" };
        if (pos <= last) return { ok: false, reason: "order" };
        last = pos;
      }
      return { ok: true };
    }
    const hit = fact.answers.some(a => findPhrase(ws, a) >= 0);
    if (hit) return { ok: true };
    if ((fact.distractors || []).some(a => findPhrase(ws, a) >= 0)) return { ok: false, reason: "distractor" };
    return { ok: false, reason: "fact" };
  }

  // ---------------- layer 3: voice (the model) ----------------
  const WORD_RE = / ?[a-zA-Z']+| ?[0-9]|[^a-zA-Z0-9]/g;
  async function voice(text, target, opts = {}) {
    const t = sanitize(text);
    if (!LMr.isLoaded) {
      // echoless dev mode: never let a keyword stub open a door silently
      // echoless mode (weights failed to load): the voice layer cannot judge, so
      // it steps aside and the deterministic layers still hold the door
      return { probs: null, best: target, bestProb: 1, intelligible: t.length > 3, density: 0, offline: true, ok: true, reason: null };
    }
    const prefixes = CREW.map(c => ({ key: c, prefix: `[VOICE:${c}]` }));
    const scored = " " + t + " [END]";
    const res = await LMr.scorePrefixes(prefixes, scored, { perToken: true, onPartial: opts.onPartial });
    let maxLp = -1e9;
    for (const r of res) maxLp = Math.max(maxLp, r.avgLogProb);
    const probs = {}; let z = 0;
    for (const r of res) { probs[r.key] = Math.exp((r.avgLogProb - maxLp) * CALr.voiceTemp); z += probs[r.key]; }
    let best = CREW[0], bestProb = 0;
    for (const c of CREW) { probs[c] /= z; if (probs[c] > bestProb) { bestProb = probs[c]; best = c; } }
    const tokRatio = LMr.encode(t).length / Math.max(1, t.length);
    const intelligible = t.length > 3 && tokRatio < (CALr.maxTokRatio || 0.58) && maxLp > CALr.staticFloor;

    // marker density: share of words that each carry > 1 nat of evidence for the target
    const by = {}; for (const r of res) by[r.key] = r.tokenLps;
    const chunks = (" " + t).match(WORD_RE) || [];
    let ti = 0, nWords = 0, marked = 0;
    for (const ch of chunks) {
      const n = LMr.encode(ch).length;
      let c = 0;
      for (let i = 0; i < n; i++, ti++) {
        if (!by[target] || by[target][ti] === undefined) continue;
        let o = 0; for (const x of CREW) if (x !== target) o += by[x][ti];
        c += by[target][ti] - o / (CREW.length - 1);
      }
      if (/[a-zA-Z]/.test(ch)) { nWords++; if (c > 1) marked++; }
    }
    const density = marked / Math.max(1, nWords);
    const thr = (DV.persona_threshold && DV.persona_threshold[target]) || DV.voice_threshold;
    const ok = intelligible && best === target && bestProb >= thr && density <= DV.max_marker_density;
    const reason = !intelligible ? "static" : (best !== target || bestProb < thr) ? "voice" : density > DV.max_marker_density ? "costume" : null;
    return { probs, best, bestProb, intelligible, density, threshold: thr, ok, reason };
  }

  // ---------------- the whole judgement ----------------
  // ctx: {sources: [text], previous: [text], onPartial}
  async function judge(text, persona, turnIdx, ctx = {}) {
    const ch = CHALLENGES[persona];
    const turn = ch.turns[turnIdx] || ch.turns[0];
    const st = structure(text, ctx);
    const mem = memory(text, turn.fact);
    // the model always listens, even when a deterministic layer already failed,
    // so the player still sees whose voice they carried
    const v = st.reason === "short" && words(text).length < 3 ? null : await voice(text, persona, { onPartial: ctx.onPartial });
    const layers = {
      structure: st.ok,
      memory: turn.fact ? mem.ok : null,
      voice: v ? v.ok : false,
    };
    let reason = null;
    if (!st.ok) reason = st.reason;
    else if (v && !v.ok) reason = v.reason;
    else if (!v) reason = "voice";
    else if (!mem.ok) reason = mem.reason;
    const pass = st.ok && mem.ok && !!v && v.ok;
    return { pass, reason, layers, voice: v, structure: st, memory: mem, line: reason ? (LINES[reason] || LINES.voice) : null };
  }

  // reason -> suspicion delta category
  function failKind(reason) {
    if (reason === "distractor") return "fail_distractor";
    if (reason === "fact" || reason === "order") return "fail_fact";
    if (reason === "voice" || reason === "costume" || reason === "static") return "fail_voice";
    return "fail_structure";
  }

  return { CHALLENGES, CLUES, LINES, sanitize, words, structure, memory, voice, judge, failKind };
})();
if (typeof module !== "undefined") module.exports = Doors;
