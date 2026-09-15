# Ghost in the Wreck: Iteration 2 Design (Godot)

September 2026 · Draft 1 · Builds on the iteration 1 review

## 1. The review in one line

Iteration 1 proves you **can** put a small language model in a game. Iteration 2 has to prove **why you should**. Every change below is tested against one question:

> Could this mechanic exist without the model? If yes, the model is decoration. If no, it is the game.

## 2. Why iteration 1 felt the way it did (root causes in the code)

| Review finding | What the code actually does |
|---|---|
| **Door puzzle too easy** | `judgeVoice` scores the text's average log-prob under five `[VOICE:X]` prefixes, then applies a temperature-12 softmax. The door opens at **28%** (22% for Okafor), and random chance is 20%. With a 2.9M model, one strong profession word ("coolant", "saline", "fern") dominates the average, so a single keyword clears the bar. There is also no minimum length (`t.length > 3`). |
| **Logs have no impact** | Terminal logs are free generations (`[LOG:AUTHOR:Dnnn]`) with a random seed, so no fact can be relied on to appear in them. The doors never ask for anything a log contains. Reading a log only adds +1 trust, which the player never sees. |
| **Kneel does nothing** | `kneel()` shows one fixed paragraph and adds +1 hidden trust the first time. There's no choice, reward or reaction. |
| **Air never runs low** | (1) The O2 tick returns early whenever an overlay is open (`if (Game.overlayOpen) return`). So reading, typing at doors and talking to ECHO, which take up most of the playtime, cost no air. (2) Every lift ride tops the tank back up to **70%** (`deck_entry_min_o2`). (3) There are 13 canisters at +45% each, plus 28 regenerating garden tiles. (4) A failed door costs only 4%. |
| **Static visuals** | Flat tiles, one hue per deck, and no events. Nothing on screen reacts to the story or to the model. The Godot slice is still flat rects. |
| **Static audio** | A WebAudio drone, hiss and a few UI chords. Nobody speaks, and nothing sounds different when ECHO talks. |

The main design flaw is that **the model judges style, and style alone can be faked with vocabulary**. The logs, the one place where the player could learn a character, are cut off from the lock.

## 3. The core pillar for iteration 2

> **The logs are the key. The voice is the lock. ECHO is the guard.**

- **What you know** (facts from logs, recorders and bodies) is checked deterministically. It's reliable and authorable.
- **How you say it** (voice, register, consistency) is judged by the model. This is fuzzy and open-ended, which only an SLM can do.
- **Whether ECHO believes you** (suspicion) is a live state. The model's verdicts feed it, and it drives air, lights, sound and doors.

A door opens only when all three line up. Exploring for clues costs air, failing raises suspicion, and suspicion costs more air. That ties the loop together.

## 4. Feature redesigns

### 4.1 Doors become interrogations

ECHO no longer waits for any line. It **challenges** the player with a question drawn from a clue table for that door. The player has to answer with the right fact, in the right voice.

**Scoring a door answer (all must pass):**

1. **Fact check (deterministic).** The answer contains the clue's accepted answer set, such as `{"0412", "four twelve", "oh four twelve"}`. It is authored per clue, with synonyms.
2. **Voice check (model).** The target persona is the argmax, with the threshold raised from 0.28 to about 0.45. Recalibrate on held-out lines, and keep a per-persona override like Okafor has today.
3. **Costume check (model, anti-keyword).** Re-score the answer with its top-3 persona-marker tokens removed. Those are the tokens that contribute most to `log P(t|X) − mean log P(t|others)`, which needs per-token log-probs from `scorePrefixes`. If the persona collapses, ECHO says *"You wear their words like a borrowed coat."* This makes the player write in the character's rhythm and not just use the character's nouns.
4. **Length and memory.** The answer needs at least 10 words. ECHO also remembers every answer, and one too close to an earlier attempt (cosine similarity of `embed()` above a threshold) is rejected: *"You said that already. My sleepers never repeat themselves."*

> Risk: at 2.9M parameters, even genuine lines may lean on keywords. Calibrate check 3 against held-out corpus lines first. If faithful lines fail, soften it to capping any single token's contribution instead of removing tokens.

**Difficulty ladder across the five voice doors:**

| # | Door | New layer | Example challenge (clue source) |
|---|---|---|---|
| 1 | Kit, Hydroponics vault | Voice + costume check (tutorial, no fact) | *"Tell me how the garden is today, Kit."* |
| 2 | Okafor, Pharmacy | + **fact** | *"How many did you talk to sleep, Ben?"* (Okafor's recorder / med logs) |
| 3 | Cho, Engineering hatch | + **emotional register**, scored with the embedding-anchor method already used by the ending judge | Reactor alarm running. ECHO: *"She is screaming, Dae."* The answer must be urgent *and* tender, not calm. |
| 4 | Vega, Chart room | + **held voice over 3 turns**. ECHO interrupts and asks follow-ups, and the average persona score must hold. | *"Which star did you name first?"* → *"Why that one?"* → *"Say goodbye to it."* |
| 5 | Reyne, Core descent | All of the above + **no reuse**: words that carried earlier doors are banned + a fact that is only available from keepsakes (4.3) | *"Captain, in what order did my sleepers close their eyes?"* (Vega, Cho, Kit, Okafor: the day marked on each keepsake) |

**Failure now has consequences:** each fail adds suspicion (4.5). At high suspicion the door goes dark for 30–60 seconds, and ECHO tells the player to *"go and remember"*. It points them back to a clue source.

**Hints stay SLM-native:** after 2 fails, the door still "dreams aloud" generated voice lines. The hints now show *how* the character talks, never the fact.

### 4.2 Logs that matter: anchored generation

Keep the generated logs, because they're the showcase, but **anchor** them. The prompt becomes:

```
[LOG:KIT:D212]\n<authored clue sentence> <model continues in voice>
```

- The clue sentence is authored and guaranteed, so the fact is always present. The model writes the rest, so every run reads differently and the voice keeps its texture.
- Each deck gets a **clue table** in `story.json`: `clue_id`, author, day, anchor sentence, accepted answers, and which door uses it. The table lives in the shared data files so both engines read it.
- Every door clue must be findable **on the same deck or an earlier one**. Add a maplint rule for this: *every door clue has at least one reachable source*.
- The journal tags recovered clues (highlighted phrase, no spoilers about which door they open). The journal becomes the player's notebook.
- **Distractors:** some logs carry *wrong* but plausible facts, like a crew member misremembering or a corrupted entry. ECHO punishes a distractor answer with extra suspicion. Reading carefully, across more than one log, pays off.
- Logs also teach the voice. A player who needs to pass the costume check has to read how Cho actually talks.

### 4.3 Kneel becomes "Last Watch" (or gets cut)

Kneeling is where the game can be at its most human. That's also where an SLM beats a script.

1. **Keepsake.** Each body holds one item: Kit's seed packet, Okafor's pen light, Cho's torque wrench, Vega's star chart, Reyne's command key. Each keepsake unlocks a **unique clue** that door 5 needs, plus a short memory vignette (see 4.6).
2. **Say something.** The player can speak a farewell. The model judges it two ways: is it addressed to *this* person (voice/embedding similarity to their persona), and is it kind (rest/keep anchors)? ECHO answers in generated speech, and the lights in the room respond.
3. **Consequence.** A sincere farewell lowers suspicion and raises trust, which feeds the ending. Walking past a body is allowed, but ECHO notices: *"You did not stop for them."*

If this doesn't fit the scope, **cut the verb** rather than ship it as a no-op again.

### 4.4 Air becomes the clock

Air should force a choice between **reading for clues** and **moving on**.

| Change | From | To (starting point, tune by telemetry) |
|---|---|---|
| Drain while overlays are open | 0% | **60%** of normal. Reading authored recorders can stay at 30%. |
| Drain while typing at a door | 0% | **100%**. Speaking to ECHO costs breath. |
| Lift top-up | to 70% | **none**, or to 35% only on the first visit to a deck |
| Tank | 195 s | **150 s** |
| Canisters | 13 × 45% | **7 × 30%**, placed off the critical path next to hazards |
| Failed door | −4% | **−8%**, scaled up with suspicion |
| Garden regen | always on | **only while the garden lamps are powered** (a power-cell choice) |
| Suspicion | none | High suspicion makes ECHO **throttle air** to your deck (+50% drain). Low suspicion lets it **vent fresh air** as a reward. |

**Success criteria:** instrument minimum O2 per deck. Target a median run minimum ≤ 20%, at least one "under 15%" moment in most runs, and a 20–35% first-time death rate on Engineering or Bridge. Keep the checkpointed death so failure still feels fair.

### 4.5 ECHO's suspicion (new, visible system)

Iteration 1 already has a hidden trust score. Make it **visible and two-sided**:

- **Suspicion (short-term):** rises on failed doors, distractor answers, repeated lines and ignored bodies. It decays slowly while you do "crew-like" things.
- **Trust (long-term):** stays as it is and feeds the ending.
- It's shown **diegetically**, not as a bar: ECHO's light colour, how fast the lights flicker, the pitch and distortion of its voice, and how often the auto doors stutter.

### 4.6 Visuals that break the stillness

Priority order, from most impact per hour:

1. **ECHO as a presence.** A light, or an "eye" in the speaker panels, that moves through the deck with you and turns toward you when you speak. Its colour shows suspicion. When it talks, the lights pulse **per token as the stream arrives**.
2. **The model drives a glitch shader.** Measure the entropy or log-prob of each generated token. When ECHO's output is uncertain (the damaged mind the canon describes), increase chromatic aberration, scanline tear and light stutter. The model's own confidence becomes a visual state, which nothing hand-authored can reproduce.
3. **Lighting pass.** `PointLight2D` with occluders, shadows cast by bulkheads and crates, the suit lamp as a cone, and emergency strobes. This alone ends the flat look.
4. **One set piece per deck.** Hydroponics: lamps wake row by row when powered and vines sway. Med Bay: a surgical light swinging on a cable. Engineering: timed steam jets from hazard vents and a reactor that pulses in sync with the audio. Bridge: the burned forward glass showing the Reach nebula. Core: ECHO's heart.
5. **Memory ghosts.** Opening a recorder or keepsake plays a 5–10 second silhouette replay in the room: Okafor at the intercom grille, or Cho's hands on the feed levers. It's cheap to build (sprite silhouettes with an additive shader) and it turns text into an image.
6. **Events.** Hull groan and camera shake, a sudden depressurisation door slam, and ECHO locking a door behind you when suspicion spikes. Aim for at least one scripted surprise per deck.
7. **Tile art pass** with a TileMap and animated props like sparking cables, drifting debris and dripping condensation.

### 4.7 Audio that speaks

**ECHO's voice, options by cost:**

| Option | Cost | Notes |
|---|---|---|
| **Token babble** (per-token syllable blips, pitch and timbre per speaker, distortion by token entropy) | Low | Tied directly to the model stream, and runs on web and desktop. **Recommended baseline.** |
| **Godot built-in TTS** (`DisplayServer.tts_speak`, enable `audio/general/text_to_speech`) | Low | Real words, but it uses OS voices that differ per platform and can't go through Godot's audio buses for radio or reverb effects. Good as an accessibility option. |
| **Baked voice-over for authored lines** (5 final recorders, first contact, endings) | Medium | Voice actors or offline TTS, run through a "degraded recording" effects chain. High emotional payoff for a small number of lines. |
| **Neural TTS on device** (for example Piper via a GDExtension) | High | Real speech for generated lines. It adds tens of MB of voice model and a native dependency, so it's a desktop-first stretch goal. |

**Rest of the soundscape:**

- **Door "tuning" feedback.** While the model scores your answer, radio static fades into a clean tone as the target persona's probability rises. The player *hears* how close they are.
- **Adaptive music layers** driven by O2, suspicion and deck: a drone base, a pulse layer below 30% air, and a string layer when trust is high.
- **Diegetic, positional sound** (`AudioStreamPlayer2D`): reactor hum, the misters in the garden, intercom crackle, the hull ticking as it cools.
- **Stingers** for door open or fail, keepsake found, and suspicion threshold crossed.

## 5. The answer to "why an SLM?"

After iteration 2, the pitch is:

> The Vesper's doors listen to *how* you speak, not just *what* you say. ECHO is a real neural mind trained only on its dead crew. It can hear the difference between someone quoting a log and someone who has **become** the person who wrote it. It remembers everything you've said, it gets suspicious when you fake it, and its damaged voice and flickering lights are its actual uncertainty, not an animation.

Mechanics that **require** the model: voice and costume judgement, register judgement, held-voice conversations, farewells, repetition memory, and entropy-driven glitch and audio. Mechanics that **use** the model for texture: anchored logs, hints and ambient speech.

## 6. Scope and sequencing

**Must (the fun):**
1. Interrogation doors with fact, voice, costume and length checks, plus recalibration
2. Clue tables and anchored log generation, with a maplint clue-reachability rule
3. Air retune and overlay drain, with min-O2 telemetry
4. Visible suspicion (colour and flicker are enough at first)
5. Kneel redesign (keepsake and clue), or cut it

**Should (the feel):**
6. ECHO presence light, token-pulse lighting and the entropy glitch shader
7. Lighting pass and one set piece per deck
8. Token babble voice and door tuning audio
9. Adaptive music layers

**Could (the polish):**
10. Farewell judging at bodies
11. Memory ghosts
12. Baked VO for authored lines
13. On-device neural TTS (desktop)

**Port dependencies already known (from `godot/FINDINGS.md`):** the inference backend (a JS bridge for web, a GDExtension for desktop), the overlay UIs as Control scenes, and the save system. Token-streaming callbacks are needed for items 6 and 8, so build the streaming bridge early.

**Tip:** the HTML build is already playable. The "Must" gameplay changes (1–5) could be prototyped and tuned there in days, then ported to Godot once the numbers feel right.

## 7. Playtest metrics for iteration 2

| Question | Measure | Target |
|---|---|---|
| Are doors a challenge? | Attempts per door, and time per door | Door 1 ≈ 1–2 tries, door 5 ≈ 3–5 tries. No door solvable by a single keyword (automated test). |
| Do logs matter? | % of door successes where the player had read the clue source | > 90% (the rest are lucky guesses, which is fine) |
| Is air tense? | Minimum O2 per deck, deaths per deck | Median minimum ≤ 20%, and a first-time death rate of 20–35% on the hardest deck |
| Does kneel matter? | % of bodies visited, and whether players mention keepsakes | > 80% visited |
| Does it hold attention? | Session length, and the point where testers quit | Most testers reach the Core |
| Why the SLM? | Post-play question: *"What did ECHO do that a normal game couldn't?"* | Testers name the voice or costume judgement without prompting |

Add automated **cheese tests** to the gates: keyword-only answers, copied log sentences, profession-word salad and repeated answers must all fail every door.

## 8. Open questions

- Does the costume check separate genuine from stuffed answers at this model size, or do we need a small fine-tune on "stuffed vs genuine" pairs? (A calibration spike should answer this in a day.)
- Web first or desktop first for the Godot build? It decides which inference backend and which TTS option come first.
- Should ECHO's suspicion ever block progress for good, or always stay recoverable?
- Retrain or not? Distractor logs and farewell anchors might work with the current weights. A retrain means recalibrating everything (iron rule).
