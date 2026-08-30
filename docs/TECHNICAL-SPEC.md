# Ghost in the Wreck — Technical Specification

Version 1.0 · August 28, 2026 · Raw Power Labs
Live build: https://claude.ai/code/artifact/2c7295e4-2a2a-4812-8a8c-e0ac845351ce

## 1. Overview

Ghost in the Wreck is a single-file browser game (4.15 MB) containing a complete
neural language model. The model, named ECHO in the fiction, was trained from
scratch for this game and is embedded in the page as quantized weights. All
inference runs client-side in pure JavaScript; there is no server, no API, and
no network dependency after page load.

The model is not decoration. It drives four gameplay systems: generative text
(crew logs, ship-mind dialogue, ambient speech), a five-way voiceprint
classifier that gates progression doors, a gibberish detector, and a semantic
intent judge that selects the ending.

## 2. Model

| Property | Value |
|---|---|
| Architecture | GPT-style causal transformer (pre-LN) |
| Layers / heads / width | 6 / 6 / 192 |
| Feed-forward | 4x width, GELU (tanh approximation) |
| Context window | 256 tokens |
| Vocabulary | 1,024 (BPE) |
| Parameters | 2,915,328 (weight-tied LM head) |
| Positional encoding | Learned absolute embeddings |
| Regularization | Dropout 0.1, weight decay 0.1, grad clip 1.0 |

### 2.1 Tokenizer

Byte-pair encoding trained on the corpus itself, vocabulary 1,024:

- 16 special tokens, ids 0-15: `[END]`, `[HEAR]`, `[ECHO]`, `[SYS]`,
  `[VOICE:<author>]` x6, `[LOG:<author>:D` x6. Structural markers are single
  atomic tokens, so generation stop conditions and scoring prefixes are exact.
- 256 byte fallback tokens (ids 16-271), so any input encodes losslessly.
- 752 learned merges (ids 272-1023), trained with the classic word-frequency
  BPE algorithm over pre-split chunks: ` ?[a-zA-Z']+ | ?[0-9] | other-char`.
  Digits stay single tokens so day numbers generalize.
- Yield: 2.90 characters per token on corpus text.

The JavaScript encoder mirrors the Python trainer exactly (same pre-split
regex, same merge table); parity is asserted in CI (section 7).

## 3. Training data

An original corpus written for the game's fictional world (the survey ship
SSV Vesper, five crew, the ship-mind ECHO), authored by 26 parallel writer
agents against two governing documents: CANON.md (world facts, timeline,
per-character voice bibles) and FORMAT.md (strict sample grammar).

| Sample type | Format | Count |
|---|---|---|
| Crew logs | `[LOG:AUTHOR:Dnnn]\n<body>\n[END]` | 1,063 |
| Voice lines | `[VOICE:AUTHOR] <line> [END]` | 2,040 |
| Dialogue pairs | `[HEAR] <visitor> [ECHO] <reply> [END]` | 780 |
| Ship-mind monologues | `[ECHO] <text> [END]` | 290 |
| System broadcasts | `[SYS] <text> [END]` | 345 |
| Derived voice lines (augmentation) | sentences 30-140 chars extracted from logs | 4,200 |

Raw corpus: ~890 KB across 26 files; after parsing, dedup, and augmentation:
8,388 samples, 423,623 tokens. Validation split: 3% by sample. Sample types are
weighted in the training stream (dialogue and monologue x2) and the stream is
reshuffled every epoch.

Corpus hygiene enforced by the build: ASCII only, unified punctuation, no
dashes, regex-validated markers, day numbers within each character's canonical
lifespan. Round-one parse rate after format fixes: 100% (0 rejects).

## 4. Training

- Objective: next-token cross-entropy over the concatenated sample stream.
- Optimizer: AdamW, lr 1.5e-3 cosine to 1e-4, ~2% warmup, batch 24 x 256 tokens.
- Hardware: 2 CPU cores (PyTorch, ~5,700 tokens/s including backward).
- Schedule: time-budgeted; total steps fixed after measuring step time.
- Checkpointing: every 250 steps; best checkpoint selected by validation loss.

Final run: 5,426 steps ≈ 33M tokens ≈ 2.5 h. Validation loss bottomed at 2.804
nats/token (step 4,250), the checkpoint that shipped. A first run on half the
corpus bottomed at 3.08, confirming data volume, not step count, was the
binding constraint.

## 5. Quantization and packaging

- All matrices int8 with per-row float32 scales (`s = max|row| / 127`);
  LayerNorm parameters and biases float32.
- Packed into one binary buffer + JSON manifest (name, dtype, shape, offsets),
  base64-embedded in the page: 4.03 MB.
- Export writes the dequantized values back into the PyTorch model and re-runs
  it, so parity vectors are computed against exactly the arithmetic the
  browser will do.

## 6. JavaScript inference engine (lm.js)

Dependency-free, ~400 lines.

- Forward pass: per-token matvec kernels (4x unrolled), KV cache per session,
  softmax attention per head, weight-tied logits.
- Scheduling: cooperative; inference yields to the UI every ~11 ms via
  requestAnimationFrame, with a 60 ms setTimeout race so throttled/occluded
  tabs cannot stall generation.
- Sampling: temperature + nucleus (top-p) + frequency penalty on recent
  tokens; per-feature seeded RNG (mulberry32) makes terminal logs unique per
  run but reproducible within one.
- Measured throughput (2-core container, similar to a mid laptop): ~100
  tokens/s generation; 5-way persona scoring of a player line in ~0.44 s.
- APIs: `generate`, `scorePrefixes` (sum/avg log-prob of a text under N
  prefixes), `probe` (top-k next-token distribution, exposed to players as a
  proof-of-realness panel), `embed` (mean-pooled final-layer hidden state).

## 7. Model-driven game mechanics

### 7.1 Generative text
- Terminal logs: prompt `[LOG:AUTHOR:Dnnn]\n`, seeded per terminal x read-count
  x run-seed. Temperature 0.7, top-p 0.86.
- ECHO dialogue: prompt `[HEAR] <sanitized player text> [ECHO]`; replies
  stream token-by-token into the UI at typewriter pace.
- Ambient monologues and system broadcasts from `[ECHO]` / `[SYS]` prompts.

### 7.2 Voiceprint doors (5-way Bayes-style classification)
Player text t is scored under each prefix `[VOICE:X]` as avg log P(t|X); a
temperature-12 softmax over the five averages yields the displayed
distribution. A door opens iff the target crew member is argmax with
probability >= 0.28 (0.22 for the hardest voice). Input is normalized to
sentence case with terminal punctuation to match the training distribution.
Measured top-1 accuracy on fresh out-of-corpus imitations: 85%.

Critical implementation detail: scoring prefixes carry no trailing space; the
leading space is attached to the scored text so ` word` chunks tokenize
exactly as in training. With a trailing space instead, accuracy drops ~10
points and generation from `[VOICE:X] ` prompts frequently emits `[END]`
immediately.

### 7.3 Gibberish gate
Two-factor: (a) best avg log-prob below a calibrated floor, (b) tokens-per-
character ratio — nonsense shatters into byte-fallback tokens (>= 0.74
tok/char) while real English stays <= 0.43. Threshold 0.58 separates the
distributions with full margin on the calibration set.

### 7.4 Ending intent judge
Direct conditional-likelihood comparison of "rest" vs "keep" continuation
anchors failed at this model scale (no separation). Shipped approach: cosine
similarity of mean-pooled final-layer embeddings between the player's answer
and two anchor-sentence centroids (4 anchors each). Separation on a 10-case
probe: rest answers +0.012..+0.042, keep answers -0.032..+0.015, boundary at
+0.008. Combined with an accumulated trust score to select one of three
endings.

### 7.5 Calibration
A Node harness (test/calibrate.js) runs the real JS engine against held-out
voice lines, hand-written paraphrases, and gibberish; it fixes the softmax
temperature, door threshold, static floor, and token-ratio ceiling that ship
in calibration.js.

## 8. Game engine

Canvas 2D, no libraries. Tile-based decks authored as ASCII maps with an
entity legend; a lint (flood fill from spawn) proves every entity reachable
and every floor sealed. Systems: oxygen economy (pauses during reading),
power-cell sockets, auto doors, voice doors, terminals, archives (5 fixed
canonical story beats), intercoms, bodies, checkpointed death, three-act
finale, three endings. Rendering: camera follow, per-deck hue, radial
darkness + light holes, parallax starfield and nebula, particles, CRT
overlays. Audio: WebAudio synthesis only (hull drone, filtered-noise hiss,
creaks, danger pulse, UI ticks, chords). Persistence: localStorage wrapped in
try/catch with in-memory fallback. Input: keyboard + touch joystick;
responsive layouts down to 390 px and short-viewport variants.

## 9. Testing

- Map lint: reachability + leak detection for all six decks.
- Parity: tokenizer ids and top-10 logit ordering identical between PyTorch
  (quantization-simulated) and the JS engine.
- Playwright suites: smoke, full UI flow (all overlays, death, save/continue,
  finale, endings), mobile viewport, deck screenshot review.
- Adversarial playtest: 9 parallel agents (new-player, voice doors, hostile
  input, resource economy, full run, mobile, persistence, model quality,
  performance) filed 19 findings — 3 major, all fixed and re-verified:
  empty door hints (trailing-space prompt bug), finale button dead on replay,
  weak Okafor separability (fixed by the same tokenization repair); plus an
  XSS sink in the journal renderer, rAF-throttling stall, trust-economy and
  balance tuning, and mobile overflow fixes.

## 10. Distribution

Published as a claude.ai artifact (single page, CSP-safe: no external scripts,
Google Fonts with monospace fallback). A standalone build wraps the same body
in a full HTML skeleton; it runs from file:// or any static host with no
special headers. Total page weight 4.15 MB, dominated by the base64 weights.

## 11. Known limitations

- Grammar degrades over long generations (invented words, broken syntax);
  mitigated by low temperature, length caps, sentence-boundary trimming, and
  a fiction that frames the model as a damaged 300-year-old mind.
- The classifier can mishear even faithful imitations (~15% top-1 error);
  mitigated by three-try doors, generated hints, small fail cost.
- Single-threaded CPU inference; low-end phones generate at reading speed but
  scoring takes a few seconds (masked by a listening animation).
- The model knows only its ship; it cannot answer general questions and was
  never intended to.
