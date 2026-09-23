# Ghost in the Wreck: Iteration 2 Design (Godot)

September 2026 · Draft 2 · Builds on the iteration 1 review, updated with what the HTML prototype found

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

1. **Fact check (deterministic).** The answer contains the clue's accepted answer set, such as `{"second", "two", "2nd"}`. It is authored per clue, with synonyms and small typo tolerance for long names.
2. **Voice check (model).** The target persona is the argmax, with the threshold raised from 0.28 to **0.40** (Okafor 0.30). Recalibrate on held-out lines.
3. **Speech check (deterministic, anti-cheese).** At least 10 words; a real sentence (function words present, so a list of profession words fails); no asking for doors; no "I am the medic"; no reading 10+ words back from a log; nothing too close to an earlier attempt (word overlap). A final model-side backstop rejects answers where most words are marker words for the persona ("a costume of words").
4. **Memory.** ECHO remembers every answer across doors, so retries have to be new.

> **Spike result (prototype):** the original costume check, re-scoring with the top-3 marker words removed, was **rejected**. It broke genuine imitations as often as cheese (genuine pass rate fell from 17/20 to 8/20) and missed pure keyword lists entirely, because every word in a list is a marker. Cheese turned out to have *structural* signatures (no function words, begging, self-naming, copying) that plain code catches reliably, so check 3 became deterministic. See `test/costume_spike.js`.
>
> **Honest limit found:** at 2.9M parameters the voice layer mostly hears *topic*, not *style*. A flat sentence with the right fact ("The names of the plants are Bea and Old Tom…") still opens 3 of 5 doors. The challenge in the prototype therefore comes from finding the memory, the speech rules, time and suspicion, with the model as a real but soft judge. Judging style properly needs a bigger model or a small classifier fine-tuned on voiced vs flat pairs. `test/door_test.js` reports this number on every run.

**Difficulty ladder across the five voice doors:**

| # | Door | New layer | Example challenge (clue source) |
|---|---|---|---|
| 1 | Kit, Hydroponics vault | Voice + speech rules + an easy memory (tutorial) | *"Tell me about your plants. Say their names."* (Bea, Old Tom: Garden Console, Kit's recorder) |
| 2 | Okafor, Pharmacy (optional) | + a memory with a **distractor** | *"What did you prescribe for them?"* (warm milk in Patient Records; "sleeping pills" in Triage Console is a trap) |
| 3 | Cho, Engineering hatch | + **75-second reactor alarm** | *"Which lever do you hold?"* (the second feed lever: Reactor Console, Cho's wrench) |
| 4 | Vega, Chart room (optional) | + **held voice over 3 answers** | *"Which star did you name first?"* → *"Why that one?"* → *"Say goodbye to it."* |
| 5 | Reyne, Captain's Seal | + **ordered memory**, and nothing said before | *"Name my sleepers in the order they closed their eyes."* (the final log, and the day on each keepsake) |

> Changed in the prototype: the emotional-register layer was replaced by a timer. The embedding separation the ending judge relies on is very small (+0.012 to +0.042), too weak to fail a player on. The fact words were also chosen so they don't push the voice toward another crew member (a "blue" lever was heard as Vega, a lever named "bypass" as Reyne).

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

> Prototype: keepsakes, clues on keepsakes, farewells and the "you did not stop for them" penalty are in. The farewell is only checked for being real words (4+ words, not gibberish); judging *who* it is addressed to and *how kind* it is was left out, for the same weak-embedding reason as the Cho register layer.

### 4.4 Air becomes the clock

Air should force a choice between **reading for clues** and **moving on**.

| Change | From | Draft 1 | Prototype (from `tools/econ_sim.js`) |
|---|---|---|---|
| Drain while reading (terminal, keepsake, journal) | 0% | 60% | **30%** |
| Drain while answering a door | 0% | 100% | **50%** |
| Lift top-up | to 70% | none / 35% | **none**; first visit to a deck tops up to **55%** |
| Tank | 195 s | 150 s | **240 s** |
| Canisters | 13 × 45% | 7 × 30% | **9 × 40%** |
| Failed door | −4% | −8% | **−6%**, scaled up with suspicion |
| Garden regen | 3.2/s | lamp-powered | **1.6/s** |
| Suspicion | none | +50% drain | up to **+60% drain** when hostile; a door opened while calm vents **+10%** |

> Why the prototype numbers are gentler than draft 1: the simulator walks real map distances with a fast and a slow player profile. Draft 1 numbers killed the slow player 8 times and the fast one twice. The iteration 1 numbers, run through the same simulator, give a slow player a lowest air of 71%, which matches the review. The prototype numbers give: fast player lowest 50%, slow player lowest 13% on Hydroponics and one narrow death on the Bridge. Playtests should confirm or correct this.

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

- ~~Does the costume check separate genuine from stuffed answers at this model size?~~ Answered by the prototype spike: not by ablation. Structural checks stop cheese; style (as opposed to topic) still needs a bigger model or a fine-tuned classifier.
- Web first or desktop first for the Godot build? It decides which inference backend and which TTS option come first.
- Should ECHO's suspicion ever block progress for good, or always stay recoverable?
- Retrain or not? Distractor logs and farewell anchors might work with the current weights. A retrain means recalibrating everything (iron rule).

## 9. Prototype status (HTML build, branch `proto/iteration-2`)

**In:** interrogation doors on all five voice doors (`game/doors.js`), clue tables and anchored logs, distractor log, keepsakes and farewells, visible suspicion (HUD eye, dimming and flickering lights, amber flash on a miss, lockouts), the air retune, and a **playtest report** in the game (the PLAYTEST button or the ending screen), which produces a code for the playtest form.

**Gates added:** `test/door_test.js` (joined to the calibrate gate: 0 cheese answers may open a door, genuine imitations must open ≥ 60% first try, currently 79%), a clue-reachability rule in `test/maplint.js`, and `test/iter2_playtest.js`, a scripted run through every new system in the real page (18 checks).

**Not in yet:** the "Should" and "Could" visuals and audio (4.6, 4.7), apart from the suspicion lighting. The Godot port is untouched apart from copying the shared data files.
