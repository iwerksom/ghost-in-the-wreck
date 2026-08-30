# Ghost in the Wreck

A single-file browser game with a 2.9M-parameter transformer trained from
scratch and embedded in the page as int8 weights. All inference runs
client-side in ~400 lines of dependency-free JavaScript: no server, no API, no
network after load.

The model is not decoration. It drives four systems — generated crew logs and
ship-mind dialogue, a five-way voiceprint classifier that gates progression
doors, a gibberish detector, and a semantic intent judge that picks the ending.

Full details: [`docs/TECHNICAL-SPEC.md`](docs/TECHNICAL-SPEC.md).

This is the **pilot game**. The reusable machinery that produced it lives in a
separate repo, [**The Wreck Works**](../wreck-works) — see *Relationship to the
factory* below.

## Layout

    CANON.md          world facts, timeline, per-character voice bibles
    FORMAT.md         exact training-sample grammar (markers, bounds, rules)
    pipeline.json     this project's factory contract: 18 steps, each with
                      inputs, outputs, an LLM recipe, a manual recipe, a gate
    corpus/raw/       the 26 hand-authored corpus files (~890 KB)
    corpus/build/     tokenizer.json (dataset.npz is regenerated, not committed)
    model/            model_def.py, prepare.py, train.py, export.py (PyTorch)
    model/ckpt/       best.pt — the trained checkpoint (committed)
    model/train.log   the shipping run's loss curve (committed)
    data/             engine-neutral game data: maps, story beats, tuning
    game/             the shipping HTML build: engine, lm.js, weights.js, UI
    godot/            Godot vertical slice proving data/ is engine-neutral
    tools/            build_data.js — data/ -> game/maps.js + game/gamedata.js
    test/             the gates: maplint, parity, calibrate, smoke, ui_test
    test/playtests/   the adversarial playtest squad's scripts and raw logs
    docs/             technical spec + the making-of deck
    dist/             build output (generated, not committed)

Three artifacts of the shipping training run are committed on purpose:
`game/weights.js` (4 MB, the shipped int8 model), `model/ckpt/best.pt` (11 MB,
the PyTorch checkpoint behind it) and `model/train.log` (the loss curve —
`gate-train` greps it, and val bottomed at 2.8036). Together they cost 2.5 h of
CPU and cannot be reproduced bit-for-bit, so the repo carries them and stays
self-sufficient: clone it and you can re-export, fine-tune or probe the model
without retraining. Derived files stay out — `corpus/build/dataset.npz` rebuilds
from `corpus/raw` in seconds, byte-identically.

## Running it

Where to keep it: this repo lives on the Windows side at `C:\Code\ghost-in-the-wreck`
so it is editable from Windows and backed up. **Run it from WSL Ubuntu** — the
gates are shell commands, the worker spawns `bash -lc`, and the model pipeline
is python3 + torch + Playwright.

    # from WSL, on the Windows copy (simplest, one source of truth)
    cd /mnt/c/Code/ghost-in-the-wreck

    # or, for a faster ext4 working copy (npm/git are noticeably quicker)
    git clone <your github url> ~/code/ghost-in-the-wreck && cd ~/code/ghost-in-the-wreck

Then:

    make setup          # npm install in test/, pip install -r requirements.txt
    make build          # -> dist/ghost-in-the-wreck.html (open it in a browser)
    make gates          # every automated gate that does not need a retrain

Playing without building anything: open `game/index.html` directly.

Line endings are pinned to LF via `.gitattributes`. Do not disable that — CRLF
in the shell scripts breaks every gate under bash.

## The gates

A step counts as done when its gate passes, whoever did the work. Each
`make gate-<step>` target is byte-for-byte the command in `pipeline.json`, so a
green local run and a green dot in the factory panel mean the same thing.

| Gate | Proves |
|---|---|
| `gate-format_spec` | every corpus sample parses; zero rejects |
| `gate-maps` | flood-fill reachability, no void leaks, Godot headless load |
| `gate-export` | JS engine reproduces PyTorch token ids and top-10 logit order |
| `gate-calibrate` | classifier accuracy on held-out and fresh paraphrases; writes `game/calibration.js` |
| `gate-engine` | every `game/*.js` parses, maps lint, Playwright smoke |
| `gate-build` | the single-file page assembles |

**Iron rule: recalibrate after every retrain.** Thresholds do not survive new
weights.

## Relationship to the factory

This repo is one *project*. [The Wreck Works](../wreck-works) is the *factory*:
a pipeline control panel plus a job-running worker that reads `pipeline.json`
from a project and runs its gates. The factory has no Ghost-in-the-Wreck
knowledge — it renders whatever the JSON says — so a second game is a second
`pipeline.json`, not a second harness.

Point the factory at this repo by adding it to `wreck-works/projects.json`.

## Provenance

Restored 30 Aug 2026 from `wreck-works.bundle` (single commit `b937f79`,
"Ghost in the Wreck: game, model pipeline, Godot slice, and The Wreck Works
factory harness") before the original machine was wiped. The bundle and the
companion zip are archived in `C:\Code\_archive`.

Built at Raw Power Labs, August 2026.
