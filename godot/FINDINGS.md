# Godot vertical slice — findings

August 29, 2026 · Godot 4.3 stable

## What this slice proves

1. **The shared data files work as-is in Godot.** `data/maps.json`,
   `story.json`, and `tuning.json` (identical bytes to the HTML build's
   sources) load and parse in GDScript; all six decks build; a flood-fill
   test confirms every entity is reachable on every deck — same result as
   the JS map lint. One content pipeline can feed both engines.
2. **The slice runs.** Deck 1 (Hydroponics) renders from data with the same
   palette, a CharacterBody2D player walks it with collision built from the
   same solidity rules, interact prompts find the nearest entity, and the
   voice door routes into an LMBridge interface. Open `project.godot` in the
   Godot editor and press F5.
3. **The inference decision now has a measured answer** (below).

## The neural-network backend decision

Measured on this container (2 cores; treat as a mid laptop):

| Backend | Throughput | Verdict |
|---|---|---|
| Pure GDScript (PackedFloat32Array matvec) | ~35 MFLOPS ≈ **6 tokens/s** | Too slow. A single ECHO reply would take ~20 s and stall the main thread. |
| lm.js in the browser (reference) | ~100 tokens/s | Proven. |

So the port needs two backends behind the one `LMBridge` interface:

- **Web export: reuse lm.js verbatim** via `JavaScriptBridge`. The exported
  HTML shell includes `weights.js` + `lm.js` (already written and
  parity-tested); GDScript calls `LM.generate` / `LM.scorePrefixes` through
  the bridge. `LMBridge.gd` contains a working synchronous-poll version;
  a polished port should use `JavaScriptBridge.create_callback` for
  token-streaming instead of polling.
- **Desktop export: a small GDExtension** (C or Rust, ~300 lines mirroring
  lm.js: int8 dequant, matvec, KV cache, sampling) implementing the same
  three calls. Native code will comfortably exceed 500 tokens/s. This is the
  one genuinely new engineering task in the port; everything else is
  translation.

Do NOT attempt inference in GDScript, and do not count on C#/.NET for the
web target (C# web export is still not production-ready in Godot 4.3).

## What a full port still needs (in factory-step terms)

- Tile art pass (this slice draws flat rects; the editor's TileMap +
  proper sprites is the "manual work" opportunity)
- Lighting (CanvasModulate + PointLight2D shown; needs occlusion polygons)
- The overlay UIs (terminal, door, intercom, journal, finale) as Control
  scenes reading `story.json`
- Oxygen/trust/save systems (straight ports of `engine.js`/`main.js` logic,
  all constants already in `tuning.json`)
- WebAudio synth → AudioStreamGenerator or baked .ogg loops
- The GDExtension inference backend (desktop) and streaming JS bridge (web)

## Files

- `project.godot` — open in Godot 4.3+
- `scripts/ShipData.gd` — data loader + deck parser (autoload)
- `scripts/DeckRenderer.gd`, `Player.gd`, `Main.gd` — the walkable slice
- `scripts/LMBridge.gd` — ship-mind interface, web backend functional
- `scripts/LMBench.gd` — the benchmark behind the numbers above
- `tests/headless_test.gd` — CI-able check:
  `godot --headless --path . -s res://tests/headless_test.gd`
