# TRAINING DATA FORMAT (strict)

The corpus trains a very small character/BPE language model. Format errors poison it.
Every writer MUST follow these rules exactly.

## General rules
1. Plain ASCII only. No smart quotes, no em dashes, no unicode, no tabs. Use commas and
   periods instead of dashes. Apostrophes (') and double quotes (") are allowed.
2. One SAMPLE per block. Blocks are separated by exactly one blank line.
3. No markdown, no headings, no numbering inside samples.
4. Marker tokens are uppercase in square brackets, exactly as shown. Never invent new markers.
5. Day numbers: D001 through D397 only (crew logs stop at each writer's death day, see CANON).
   Zero-pad to 3 digits.
6. Keep every sample self-contained; no references like "see my last log" that depend on
   another specific sample.

## Sample types

### 1. Crew log (the bulk of what crew writers produce)
[LOG:CHO:D214]
Text of the log entry. 250 to 600 characters. First person, in that crew member's exact
voice per CANON.md. Concrete daily life aboard the Vesper.
[END]

Author codes: REYNE, CHO, OKAFOR, VEGA, KIT. Also ECHO for ship-mind log entries.

### 2. Voice line (short first-person lines, used to teach the model WHO sounds like WHAT)
[VOICE:KIT] The seedlings doubled overnight, little green hands reaching for the lamps. [END]

One line, 30 to 140 characters, unmistakably that speaker. These are CRITICAL: in the game,
the model must recognize a player imitating a crew member. Include easy, obvious lines
(the kind a player might type after reading two logs) as well as richer ones. Vary openings;
do NOT start every line the same way.

### 3. Dialogue pair (the visitor speaks, ECHO answers)
[HEAR] Is anyone alive on this ship? [ECHO] Alive. The word has weight. Five sleep and one keeps. I keep. State your watch, crewman. [END]

The [HEAR] part is anything a player might realistically type: questions, greetings, demands,
comfort, nonsense, single words, apologies, names. The [ECHO] reply is 80 to 300 characters,
in ECHO's liturgical grieving voice per CANON.md, and should REACT to the content of the
heard line (echo a word from it where natural). Include some samples where [HEAR] is
gibberish (e.g. "asdf kjh qwe") and ECHO replies that the voice is static, unformed, say again.

### 4. ECHO monologue (ambient ship-mind speech)
[ECHO] Watch 41,209. Hull temperature steady. Kit's garden is quiet tonight. I water nothing. I keep the light on anyway. [END]

100 to 350 characters.

### 5. System text (terse broadcasts, door litanies, alarms)
[SYS] Deck seal engaged. Atmosphere divergence detected. Remain where you are. The ship remembers you. [END]

30 to 200 characters. Half procedural, half faintly wrong/haunted.

## Style guardrails
- No em dashes anywhere. No lists. No ALL CAPS words except marker tokens and ship name SSV VESPER is written normally as "the Vesper".
- Crew logs D389 to D397 are the Silence: only write these if your assignment says so.
- Every writer: at least 30% of samples should mention concrete recurring canon nouns
  (the Reach, the Shear, Meridian Station, deck names, other crew by name) so the model
  learns the world's vocabulary deeply.
