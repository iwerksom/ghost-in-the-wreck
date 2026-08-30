// ============================================================================
// lm.js — pure-JavaScript inference engine for the Vesper ship-mind.
// A 6-layer GPT transformer, int8-quantized, running on the CPU of whatever
// device opens the game. No server, no API, no scripted responses.
// ============================================================================
"use strict";

const LM = (() => {
  // ---------- deterministic RNG (per-run seeds) ----------
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  let C = null;          // config {vocab, block, nLayer, nHead, nEmbd}
  let W = null;          // dequantized weights (Float32Arrays)
  let TOK = null;        // tokenizer {specials, merges, id2str, byteBase}
  let mergeRank = null, mergeNewId = null, encCache = null;
  let loaded = false;

  // ---------- weight loading ----------
  function b64ToBytes(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function load(modelPack, tokenizer) {
    C = modelPack.config;
    TOK = tokenizer;
    mergeRank = new Map(); mergeNewId = new Map(); encCache = new Map();
    const BB = TOK.byte_base;
    tokenizer.merges.forEach((m, i) => {
      const key = m[0] * 100000 + m[1];
      mergeRank.set(key, i);
      mergeNewId.set(key, BB + 256 + i);
    });
    const bytes = b64ToBytes(modelPack.b64);
    const dv = new DataView(bytes.buffer);
    W = {};
    for (const t of modelPack.manifest) {
      const n = t.shape.reduce((a, b) => a * b, 1);
      if (t.dtype === "f32") {
        const arr = new Float32Array(n);
        for (let i = 0; i < n; i++) arr[i] = dv.getFloat32(t.off + 4 * i, true);
        W[t.name] = arr;
      } else { // i8 with per-row f32 scales appended at t.scaleOff
        const rows = t.shape[0], cols = t.shape.length > 1 ? n / t.shape[0] : 1;
        const arr = new Float32Array(n);
        for (let r = 0; r < rows; r++) {
          const s = dv.getFloat32(t.scaleOff + 4 * r, true);
          const base = t.off + r * cols;
          for (let c2 = 0; c2 < cols; c2++) {
            arr[r * cols + c2] = ((bytes[base + c2] << 24) >> 24) * s;
          }
        }
        W[t.name] = arr;
      }
      W[t.name].shape = t.shape;
    }
    loaded = true;
  }

  // ---------- tokenizer ----------
  function encodeChunk(chunk) {
    if (encCache.has(chunk)) return encCache.get(chunk);
    const BB = TOK.byte_base;
    let toks = [];
    for (let i = 0; i < chunk.length; i++) {
      const code = chunk.charCodeAt(i);
      if (code < 128) toks.push(BB + code);
      else { // utf-8 encode rare non-ascii
        const enc = new TextEncoder().encode(chunk[i]);
        for (const b of enc) toks.push(BB + b);
      }
    }
    while (toks.length > 1) {
      let best = Infinity, bi = -1;
      for (let j = 0; j < toks.length - 1; j++) {
        const r = mergeRank.get(toks[j] * 100000 + toks[j + 1]);
        if (r !== undefined && r < best) { best = r; bi = j; }
      }
      if (bi < 0) break;
      toks.splice(bi, 2, mergeNewId.get(toks[bi] * 100000 + toks[bi + 1]));
    }
    if (encCache.size < 5000) encCache.set(chunk, toks);
    return toks;
  }

  const CHUNK_RE = / ?[a-zA-Z']+| ?[0-9]|[^a-zA-Z0-9]/y;

  function encode(text) {
    const out = [];
    let pos = 0;
    while (pos < text.length) {
      let matched = false;
      if (text[pos] === "[") {
        for (let s = 0; s < TOK.specials.length; s++) {
          const sp = TOK.specials[s];
          if (text.startsWith(sp, pos)) { out.push(s); pos += sp.length; matched = true; break; }
        }
      }
      if (matched) continue;
      CHUNK_RE.lastIndex = pos;
      const m = CHUNK_RE.exec(text);
      const chunk = m ? m[0] : text[pos];
      const toks = encodeChunk(chunk);
      for (const t of toks) out.push(t);
      pos += chunk.length;
    }
    return out;
  }

  function decode(ids) {
    let s = "";
    for (const id of ids) s += TOK.id2str[id] || "";
    return s;
  }

  // ---------- math kernels ----------
  // y[rows] = Wmat[rows x cols] * x[cols] + b
  function matvec(Wm, rows, cols, x, b, y) {
    for (let r = 0; r < rows; r++) {
      let acc = b ? b[r] : 0;
      const base = r * cols;
      let c2 = 0;
      // 4x unrolled
      for (; c2 + 3 < cols; c2 += 4) {
        acc += Wm[base + c2] * x[c2] + Wm[base + c2 + 1] * x[c2 + 1]
             + Wm[base + c2 + 2] * x[c2 + 2] + Wm[base + c2 + 3] * x[c2 + 3];
      }
      for (; c2 < cols; c2++) acc += Wm[base + c2] * x[c2];
      y[r] = acc;
    }
  }

  function layerNorm(x, g, b, out) {
    const n = x.length;
    let mu = 0;
    for (let i = 0; i < n; i++) mu += x[i];
    mu /= n;
    let v = 0;
    for (let i = 0; i < n; i++) { const d = x[i] - mu; v += d * d; }
    const inv = 1 / Math.sqrt(v / n + 1e-5);
    for (let i = 0; i < n; i++) out[i] = (x[i] - mu) * inv * g[i] + b[i];
  }

  function gelu(x) {
    const n = x.length;
    for (let i = 0; i < n; i++) {
      const v = x[i];
      x[i] = 0.5 * v * (1 + Math.tanh(0.7978845608028654 * (v + 0.044715 * v * v * v)));
    }
  }

  // ---------- inference session with KV cache ----------
  function session() {
    const E = C.nEmbd, H = C.nHead, HS = E / H, L = C.nLayer, V = C.vocab, B = C.block;
    const kCache = [], vCache = [];
    for (let l = 0; l < L; l++) {
      kCache.push(new Float32Array(B * E));
      vCache.push(new Float32Array(B * E));
    }
    let T = 0; // tokens in cache
    const x = new Float32Array(E), tmp = new Float32Array(E), tmp2 = new Float32Array(E);
    const qkv = new Float32Array(3 * E), att = new Float32Array(B);
    const h4 = new Float32Array(4 * E), logits = new Float32Array(V);

    // run one token through the network; returns logits
    function forward(tokId) {
      const pos = T;
      for (let i = 0; i < E; i++) x[i] = W["tok_emb"][tokId * E + i] + W["pos_emb"][pos * E + i];
      for (let l = 0; l < L; l++) {
        layerNorm(x, W[`b${l}.ln1.g`], W[`b${l}.ln1.b`], tmp);
        matvec(W[`b${l}.qkv.w`], 3 * E, E, tmp, W[`b${l}.qkv.b`], qkv);
        const kC = kCache[l], vC = vCache[l];
        for (let i = 0; i < E; i++) { kC[pos * E + i] = qkv[E + i]; vC[pos * E + i] = qkv[2 * E + i]; }
        // attention per head
        for (let h = 0; h < H; h++) {
          const qOff = h * HS;
          let maxA = -1e30;
          for (let t = 0; t <= pos; t++) {
            let acc = 0;
            const kOff = t * E + qOff;
            for (let i = 0; i < HS; i++) acc += qkv[qOff + i] * kC[kOff + i];
            acc /= Math.sqrt(HS);
            att[t] = acc;
            if (acc > maxA) maxA = acc;
          }
          let sum = 0;
          for (let t = 0; t <= pos; t++) { att[t] = Math.exp(att[t] - maxA); sum += att[t]; }
          for (let i = 0; i < HS; i++) tmp2[qOff + i] = 0;
          for (let t = 0; t <= pos; t++) {
            const w = att[t] / sum, vOff = t * E + qOff;
            for (let i = 0; i < HS; i++) tmp2[qOff + i] += w * vC[vOff + i];
          }
        }
        matvec(W[`b${l}.proj.w`], E, E, tmp2, W[`b${l}.proj.b`], tmp);
        for (let i = 0; i < E; i++) x[i] += tmp[i];
        layerNorm(x, W[`b${l}.ln2.g`], W[`b${l}.ln2.b`], tmp);
        matvec(W[`b${l}.fc.w`], 4 * E, E, tmp, W[`b${l}.fc.b`], h4);
        gelu(h4);
        matvec(W[`b${l}.mproj.w`], E, 4 * E, h4, W[`b${l}.mproj.b`], tmp);
        for (let i = 0; i < E; i++) x[i] += tmp[i];
      }
      layerNorm(x, W["ln_f.g"], W["ln_f.b"], tmp);
      matvec(W["tok_emb"], V, E, tmp, null, logits);
      for (let i = 0; i < E; i++) lastHidden[i] = tmp[i];
      T++;
      return logits;
    }
    const lastHidden = new Float32Array(E);

    return {
      forward,
      get length() { return T; },
      truncateTo(n) { T = Math.min(T, n); },
      logits,
      lastHidden,
    };
  }

  function softmaxTop(logits, temp, topP, rand, freqPenalty, recent) {
    const V = logits.length;
    const idx = [];
    for (let i = 0; i < V; i++) idx.push(i);
    const adj = new Float32Array(V);
    for (let i = 0; i < V; i++) adj[i] = logits[i] / temp - (freqPenalty && recent ? (recent.get(i) || 0) * freqPenalty : 0);
    idx.sort((a, b) => adj[b] - adj[a]);
    const kept = [];
    let maxL = adj[idx[0]], sum = 0, cum = 0;
    const probs = [];
    for (const i of idx) { const p = Math.exp(adj[i] - maxL); sum += p; probs.push(p); }
    for (let j = 0; j < idx.length; j++) {
      cum += probs[j] / sum;
      kept.push([idx[j], probs[j] / sum]);
      if (cum >= topP) break;
    }
    let r = rand() * kept.reduce((a, kv) => a + kv[1], 0);
    for (const [i, p] of kept) { r -= p; if (r <= 0) return i; }
    return kept[kept.length - 1][0];
  }

  // yield to the UI; the setTimeout race keeps inference alive even when the
  // tab is occluded and requestAnimationFrame is throttled to a standstill
  const frame = () => new Promise(r => {
    let done = false;
    const fin = () => { if (!done) { done = true; r(); } };
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(fin);
    setTimeout(fin, 60);
  });

  // ---------- public: streaming generation ----------
  // opts: {maxTokens, temp, topP, seed, onToken(text, id, probs), stopAtEnd, banSpecials, budgetMsPerFrame}
  async function generate(prompt, opts = {}) {
    if (!loaded) return null;
    const s = session();
    const ids = encode(prompt);
    const maxNew = opts.maxTokens || 120;
    const temp = opts.temp || 0.85, topP = opts.topP || 0.92;
    const rand = mulberry32(opts.seed === undefined ? (Math.random() * 1e9) | 0 : opts.seed);
    const budget = opts.budgetMsPerFrame || 11;
    const recent = new Map();
    // prefill (chunked)
    let t0 = performance.now();
    const maxCtx = C.block - maxNew - 2;
    const feed = ids.length > maxCtx ? ids.slice(ids.length - maxCtx) : ids;
    let lastLogits = null;
    for (let i = 0; i < feed.length; i++) {
      lastLogits = s.forward(feed[i]);
      if (performance.now() - t0 > budget) { await frame(); t0 = performance.now(); if (opts.cancelled && opts.cancelled()) return null; }
    }
    let out = [], outText = "";
    for (let n = 0; n < maxNew; n++) {
      const lg = lastLogits;
      if (opts.banSpecials !== false) {
        // never emit structural markers other than [END](id 0)
        for (let i = 1; i < TOK.specials.length; i++) lg[i] = -1e30;
      }
      const id = softmaxTop(lg, temp, topP, rand, 0.35, recent);
      if (id === 0) break; // [END]
      recent.set(id, (recent.get(id) || 0) + 1);
      out.push(id);
      const piece = TOK.id2str[id] || "";
      outText += piece;
      if (opts.onToken) opts.onToken(piece, id);
      if (opts.maxChars && outText.length >= opts.maxChars) break;
      if (s.length >= C.block - 1) break;
      lastLogits = s.forward(id);
      if (performance.now() - t0 > budget) { await frame(); t0 = performance.now(); if (opts.cancelled && opts.cancelled()) return null; }
    }
    return outText;
  }

  // ---------- public: score text under several prefixes ----------
  // returns [{key, avgLogProb, sumLogProb, nTokens}]
  async function scorePrefixes(prefixes, text, opts = {}) {
    if (!loaded) return null;
    const budget = opts.budgetMsPerFrame || 11;
    const results = [];
    const textIdsRaw = encode(text);
    let t0 = performance.now();
    for (const p of prefixes) {
      const pIds = encode(p.prefix);
      const textIds = textIdsRaw.slice(0, C.block - pIds.length - 2);
      const s = session();
      let lg = null;
      for (const id of pIds) {
        lg = s.forward(id);
        if (performance.now() - t0 > budget) { await frame(); t0 = performance.now(); }
      }
      let sumLp = 0;
      for (const id of textIds) {
        // log softmax of id under lg
        let maxL = -1e30;
        for (let i = 0; i < lg.length; i++) if (lg[i] > maxL) maxL = lg[i];
        let Z = 0;
        for (let i = 0; i < lg.length; i++) Z += Math.exp(lg[i] - maxL);
        sumLp += lg[id] - maxL - Math.log(Z);
        lg = s.forward(id);
        if (performance.now() - t0 > budget) { await frame(); t0 = performance.now(); }
      }
      results.push({ key: p.key, sumLogProb: sumLp, nTokens: textIds.length, avgLogProb: sumLp / Math.max(1, textIds.length) });
      if (opts.onPartial) opts.onPartial(results.slice(), prefixes.length);
    }
    return results;
  }

  // ---------- public: mean-pooled hidden-state embedding ----------
  async function embed(text) {
    if (!loaded) return null;
    const s = session();
    const ids = encode(text).slice(0, C.block - 2);
    const acc = new Float32Array(C.nEmbd);
    let t0 = performance.now();
    for (const id of ids) {
      s.forward(id);
      for (let i = 0; i < acc.length; i++) acc[i] += s.lastHidden[i];
      if (performance.now() - t0 > 11) { await frame(); t0 = performance.now(); }
    }
    let norm = 0;
    for (let i = 0; i < acc.length; i++) norm += acc[i] * acc[i];
    norm = Math.sqrt(norm) || 1;
    for (let i = 0; i < acc.length; i++) acc[i] /= norm;
    return acc;
  }
  function cosine(a, b) {
    let d = 0;
    for (let i = 0; i < a.length; i++) d += a[i] * b[i];
    return d;
  }

  // ---------- public: next-token probe (for the "proof it is real" panel) ----------
  async function probe(text, topN = 6) {
    if (!loaded) return null;
    const s = session();
    const ids = encode(text).slice(-(C.block - 2));
    let lg = null;
    let t0 = performance.now();
    for (const id of ids) {
      lg = s.forward(id);
      if (performance.now() - t0 > 11) { await frame(); t0 = performance.now(); }
    }
    let maxL = -1e30;
    for (let i = 0; i < lg.length; i++) if (lg[i] > maxL) maxL = lg[i];
    let Z = 0;
    for (let i = 0; i < lg.length; i++) Z += Math.exp(lg[i] - maxL);
    const arr = [];
    for (let i = 0; i < lg.length; i++) arr.push([i, Math.exp(lg[i] - maxL) / Z]);
    arr.sort((a, b) => b[1] - a[1]);
    return arr.slice(0, topN).map(([id, p]) => ({ id, prob: p, str: TOK.id2str[id] || (id === 0 ? "[END]" : TOK.specials[id] || "?") }));
  }

  return {
    load, encode, decode, generate, scorePrefixes, probe, embed, cosine, mulberry32,
    get isLoaded() { return loaded; },
    get config() { return C; },
    get tokenizer() { return TOK; },
  };
})();
if (typeof module !== "undefined") module.exports = LM;
