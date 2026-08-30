// ============================================================================
// story.js — narrative logic: prompts into the ship-mind, scoring, endings.
// ============================================================================
"use strict";

const Story = (() => {
  const SD = GAMEDATA.story, TU = GAMEDATA.tuning;
  const CREW = SD.crew.filter(c => c !== "ECHO");
  const CREW_NAMES = SD.crew_names;
  const DEATH_DAY = SD.death_days;

  // ---- calibration knobs (re-tuned after training by calibrate.js) ----
  const CAL = (typeof CALIBRATION !== "undefined") ? CALIBRATION : {
    voiceTemp: 4.0,        // softmax temp over avg logprobs
    doorThreshold: 0.34,   // target persona probability to open
    staticFloor: -6.2,     // best avg logprob below this = unintelligible
    restBias: 0.0,
  };

  // ---------------- canonical archives (fixed story anchors) ----------------
  const ARCHIVES = SD.archives;

  // ---------------- helpers ----------------
  function sanitize(t) {
    t = (t || "").replace(/\s+/g, " ").trim();
    t = t.split("").filter(c => c.charCodeAt(0) >= 32 && c.charCodeAt(0) < 127).join("");
    t = t.slice(0, 160).trim();
    // align with the training distribution: sentence case, terminal punctuation
    if (t.length > 0) {
      t = t[0].toUpperCase() + t.slice(1);
      if (!/[.!?"']$/.test(t)) t += ".";
    }
    return t;
  }
  function seedFrom(str) {
    let h = 2166136261 ^ Game.state.seed;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function stripJunk(t) {
    t = t.replace(/\[[A-Z:.\]]*$/g, "");        // trailing marker fragment
    t = t.replace(/^[^A-Za-z"']{0,8}/, "");      // leading digits/brackets debris
    t = t.replace(/[\[\]]/g, "");                 // stray brackets
    return t;
  }
  function cleanOut(t) {
    t = stripJunk(t).replace(/\s+/g, " ").trim();
    // finish at last sentence end if we were cut mid-sentence
    const m = t.match(/^[\s\S]*[.!?"]/);
    if (m) t = m[0];
    return t.trim();
  }
  function cleanLog(t) {
    t = stripJunk(t).trim();
    const m = t.match(/^[\s\S]*[.!?"]/);
    if (m) t = m[0];
    return t.trim();
  }

  const FALLBACK = SD.fallback;
  const SAMP = TU.sampling;

  // ---------------- generation ----------------
  async function generateLog(author, seedKey, opts = {}) {
    const rng = LM.mulberry32(seedFrom(seedKey));
    const maxDay = DEATH_DAY[author] || 388;
    const day = opts.silence ? maxDay : 8 + Math.floor(rng() * 1e6) % 375;
    const dstr = String(Math.min(day, 388)).padStart(3, "0");
    const prompt = `[LOG:${author}:D${dstr}]\n`;
    if (!LM.isLoaded) return { day: dstr, text: FALLBACK.log };
    const text = await LM.generate(prompt, {
      maxTokens: SAMP.log.maxTokens, maxChars: SAMP.log.maxChars,
      temp: opts.temp || SAMP.log.temp, topP: SAMP.log.topP,
      seed: seedFrom(seedKey + ":gen"), onToken: opts.onToken, cancelled: opts.cancelled,
    });
    return { day: dstr, text: cleanLog(text || "") || FALLBACK.log };
  }

  async function echoReply(playerText, opts = {}) {
    const t = sanitize(playerText);
    const prompt = `[HEAR] ${t} [ECHO]`;
    if (!LM.isLoaded) return FALLBACK.echo;
    const out = await LM.generate(prompt, {
      maxTokens: SAMP.echo_reply.maxTokens, maxChars: SAMP.echo_reply.maxChars,
      temp: opts.temp || SAMP.echo_reply.temp, topP: SAMP.echo_reply.topP,
      seed: opts.seed, onToken: opts.onToken, cancelled: opts.cancelled,
    });
    return cleanOut(out || "") || FALLBACK.echo;
  }

  async function echoAmbient(seedKey, opts = {}) {
    if (!LM.isLoaded) return null;
    const out = await LM.generate("[ECHO] ", {
      maxTokens: SAMP.ambient.maxTokens, maxChars: SAMP.ambient.maxChars,
      temp: SAMP.ambient.temp, topP: SAMP.ambient.topP,
      seed: seedFrom(seedKey), onToken: opts.onToken, cancelled: opts.cancelled,
    });
    return cleanOut(out || "");
  }

  async function sysLine(seedKey) {
    if (!LM.isLoaded) return "Deck systems nominal. Remain calm. Remain.";
    const out = await LM.generate("[SYS] ", { maxTokens: SAMP.sys.maxTokens, maxChars: SAMP.sys.maxChars, temp: SAMP.sys.temp, topP: SAMP.sys.topP, seed: seedFrom(seedKey) });
    return cleanOut(out || "");
  }

  async function voiceHint(author) {
    if (!LM.isLoaded) return null;
    // no trailing space: the model itself emits the " word" continuation,
    // which is how [VOICE:X] lines were tokenized in training
    for (let tries = 0; tries < 3; tries++) {
      const out = cleanOut(await LM.generate(`[VOICE:${author}]`, {
        maxTokens: SAMP.voice_hint.maxTokens, maxChars: SAMP.voice_hint.maxChars,
        temp: SAMP.voice_hint.temp, topP: SAMP.voice_hint.topP,
        seed: (Math.random() * 1e9) | 0,
      }) || "");
      if (out && out.length >= 18) return out;
    }
    return null;
  }

  // ---------------- judgment: whose voice is this? ----------------
  // Returns {probs, best, bestProb, avgLp, intelligible}
  async function judgeVoice(playerText, opts = {}) {
    const t = sanitize(playerText);
    if (!LM.isLoaded) {
      // dev stub: keyword match
      const kw = { KIT: /plant|fern|seed|green|mist|garden|leaf|soil/i, CHO: /engine|reactor|coolant|torque|manifold|girl|sing/i, OKAFOR: /patient|vital|dose|saline|sleep|medic/i, VEGA: /star|light ?year|parallax|chart|drift|reach/i, REYNE: /watch|duty|crew|protocol|order|captain/i };
      const probs = {}; let best = "REYNE", bp = 0;
      for (const c of CREW) { probs[c] = kw[c].test(t) ? 0.6 : 0.1; if (probs[c] > bp) { bp = probs[c]; best = c; } }
      const z = Object.values(probs).reduce((a, b) => a + b, 0);
      for (const c of CREW) probs[c] /= z;
      return { probs, best, bestProb: probs[best], avgLp: -3, intelligible: t.length > 3 };
    }
    // prefix has NO trailing space; the text carries its leading space so the
    // " Word" chunks tokenize exactly as [VOICE:X] samples did in training
    const prefixes = CREW.map(c => ({ key: c, prefix: `[VOICE:${c}]` }));
    const res = await LM.scorePrefixes(prefixes, " " + t + " [END]", { onPartial: opts.onPartial });
    let maxLp = -1e9;
    for (const r of res) maxLp = Math.max(maxLp, r.avgLogProb);
    const temp = CAL.voiceTemp;
    let z = 0;
    const probs = {};
    for (const r of res) { const e = Math.exp((r.avgLogProb - maxLp) * temp); probs[r.key] = e; z += e; }
    let best = CREW[0], bp = 0;
    for (const c of CREW) { probs[c] /= z; if (probs[c] > bp) { bp = probs[c]; best = c; } }
    // gibberish gate: nonsense shatters into byte-level tokens under the BPE
    const tokRatio = LM.encode(t).length / Math.max(1, t.length);
    const intelligible = t.length > 3 && tokRatio < (CAL.maxTokRatio || 0.56) && maxLp > CAL.staticFloor;
    return { probs, best, bestProb: bp, avgLp: maxLp, tokRatio, intelligible };
  }

  // rest-vs-keep semantic lean for the finale, via the network's own
  // hidden-state embeddings measured against anchor sentences.
  const REST_ANCHORS = SD.intent_anchors.rest;
  const KEEP_ANCHORS = SD.intent_anchors.keep;
  let anchorCache = null;
  async function centroid(list) {
    const es = [];
    for (const t of list) es.push(await LM.embed(t));
    const c = new Float32Array(es[0].length);
    for (const v of es) for (let i = 0; i < c.length; i++) c[i] += v[i];
    let n = 0;
    for (let i = 0; i < c.length; i++) n += c[i] * c[i];
    n = Math.sqrt(n) || 1;
    for (let i = 0; i < c.length; i++) c[i] /= n;
    return c;
  }
  async function judgeIntent(playerText) {
    const t = sanitize(playerText);
    if (!LM.isLoaded) return /rest|go|release|free|sleep|let|end|goodbye|peace/i.test(t) ? 1 : -1;
    if (!anchorCache) anchorCache = { rest: await centroid(REST_ANCHORS), keep: await centroid(KEEP_ANCHORS) };
    const e = await LM.embed(t);
    const lean = LM.cosine(e, anchorCache.rest) - LM.cosine(e, anchorCache.keep);
    return lean - TU.endings.rest_lean_boundary + CAL.restBias; // >0 leans rest
  }

  // ---------------- trust ----------------
  function addTrust(n, why) {
    Game.state.trust += n;
    saveState();
    if (n > 0) toast(`ECHO warms to you. (+${n} trust)`);
  }

  // ---------------- endings ----------------
  function endingFor(lean) {
    const t = Game.state.trust;
    if (t >= TU.endings.release_min_trust && lean > 0) return "release";
    if (t >= TU.endings.keeper_min_trust) return "keeper";
    return "static";
  }

  const ENDINGS = SD.endings;
  const FIRST_CONTACT = SD.first_contact;

  return {
    CREW, CREW_NAMES, DEATH_DAY, ARCHIVES, ENDINGS, FIRST_CONTACT, CAL,
    sanitize, generateLog, echoReply, echoAmbient, sysLine, voiceHint,
    judgeVoice, judgeIntent, addTrust, endingFor, seedFrom,
  };
})();
if (typeof module !== "undefined") module.exports = Story;
