export const meta = {
  name: 'ghostwreck-playtest',
  description: 'Adversarial playtest squad for Ghost in the Wreck',
  phases: [{ title: 'Playtest' }],
}

const FINDINGS = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['critical', 'major', 'minor', 'polish'] },
          area: { type: 'string' },
          description: { type: 'string' },
          repro: { type: 'string' },
        },
        required: ['severity', 'area', 'description'],
      },
    },
    notes: { type: 'string' },
  },
  required: ['findings'],
}

const ROOT = require("path").resolve(__dirname, "..");
const BOILER = `You are playtesting a finished browser game located at ${ROOT}/dist/ghost-in-the-wreck.html (a self-contained page; open via file:// URL). It embeds a real neural language model, so text generation takes a few seconds; use generous waitForTimeout after actions that trigger generation (3-8s).
Drive it with Playwright from ${ROOT}/test (playwright is installed there). Boilerplate:
  const { chromium } = require("playwright");
  const browser = await chromium.launch(Object.assign({ args: ["--no-sandbox"] },
    process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}));
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto("file://${ROOT}/dist/ghost-in-the-wreck.html");
Collect page errors: page.on("pageerror", ...) and console errors. Screenshots help you see state: save under ${ROOT}/test/shots/pt_<yourarea>_*.png and READ them with your Read tool to actually look.
Game structure: title (#btnNew starts; #introOverlay click-through x4; #deckOverlay click to dismiss). Player moves with WASD (hold via keyboard.down/up). Interact: teleport helper is acceptable for deep testing:
  page.evaluate(() => { const e = Game.deck.entities.find(x => x.type === "terminal"); Game.state.px=(e.x)*32+16; Game.state.py=(e.y+1)*32+16; Game.nearEntity=e; Game.onInteract(e); })
Decks 0-5 via page.evaluate(() => gotoDeck(N)) then dismiss #deckOverlay. Useful globals: Game.state (o2, cells, trust, opened, journal), LM.isLoaded, Story, UI.
Overlays and controls: terminals (#termBtnRead, #termBtnStatus, #termClose), voice doors (#doorInput + #doorSpeak, bars #doorBars, verdict #doorVerdict, close #doorClose; door opens and auto-closes on success), intercom (#comInput #comSpeak #comClose), journal (#btnJournal), finale at deck 5 corealtar (three questions, #finaleInput #finaleSpeak), endings overlay #endingOverlay.
Report only REAL findings you verified, with repro steps. Severity: critical = crash/softlock/blocker, major = mechanic misbehaves, minor = friction, polish = cosmetic. If everything in your area works, return an empty findings list and say so in notes. Do NOT modify any game files.
YOUR MISSION: `

const jobs = [
  { key: 'new-player', prompt: `Play the opening 10 minutes as a genuine new player WITHOUT teleport cheats: title, intro, docking ring. Move with real key presses. Try to: find the power cell, feed the socket, take the lift to Hydroponics. Evaluate: is the goal discoverable, does the interact prompt appear reliably, does anything block progress? Screenshot each stage and look at them: is anything visually broken or unreadably dark?` },
  { key: 'voice-doors', prompt: `Deep-test the voice door mechanic. Go to deck 1 (Hydroponics), read 3 Kit logs at terminals, then attempt the seed vault door: (a) with a plausible Kit imitation you write yourself from what the logs taught you, (b) with a Reyne-style line (should fail with WRONG VOICE naming REYNE or similar), (c) with keyboard mash (should be UNRECOGNIZED/static), (d) fail twice then check hint lines appear. Then test deck 3 (eng) CHO door and deck 4 REYNE + VEGA doors the same way, 2 attempts each. Report pass/fail behavior, whether the probability bars update, and whether a reasonable imitation succeeds within 3 tries.` },
  { key: 'hostile-input', prompt: `Attack every text input (#doorInput, #comInput, #finaleInput, #probeInput in THE MIND panel): empty submit, 200+ char strings, <script>alert(1)</script> and <img src=x onerror=...> (verify they render inert as text everywhere including the journal), emoji and CJK unicode, newlines via paste (page.fill), rapid double-submits, submitting while a previous generation is still streaming. Watch for pageerrors, duplicated/interleaved text, layout breakage, XSS execution.` },
  { key: 'resources', prompt: `Audit the survival economy. On each deck 0-4 (use gotoDeck), count reachable O2 canisters and power cells vs distances. Verify: standing on hazard vents (deck 3) drains fast and shakes; garden tiles (deck 1) regenerate air; O2 hitting 0 triggers the death overlay and WAKE respawns at deck spawn with items kept and doors still open. Hunt softlocks: can cells be wasted so a lift can never power? (Check deck 0: one cell, one socket; deck 3: two cells, two sockets.) Can the player reach deck 5 with 0 trust and still finish? Report any state where progress is impossible.` },
  { key: 'full-run', prompt: `Complete one honest full playthrough at normal speed (teleports allowed between rooms you have already visited, but do every required interaction for real): dock -> hydro -> med -> eng -> bridge -> core, read at least one log per terminal, open every voice door (retry as needed; you may study logs to imitate), finish the finale with earnest answers, reach an ending. Time it. Then via state manipulation (Game.state.trust) verify the other two endings are reachable (trust>=16 + rest answer = release; trust 7-15 = keeper; trust<7 = static). Report total duration, which ending you got honestly, and any narrative or mechanical breaks along the way.` },
  { key: 'mobile', prompt: `Test mobile: viewport 390x730 with hasTouch:true, isMobile:true. Verify the touch joystick moves the player (dispatch touchstart/touchmove on #joyzone), the interact button appears near entities and works, every overlay fits the screen without horizontal scroll or clipped buttons (screenshot each overlay and LOOK at them: title, terminal, door, intercom, journal, finale, ending, THE MIND). Check the door input keyboard flow does not hide the SPEAK button.` },
  { key: 'persistence', prompt: `Test save/continue integrity: start a run, make progress (open the dock lift, collect items, read 2 logs, gain trust), reload the page mid-game, CONTINUE, and verify: deck, trust, journal entries, opened doors, collected items all survive; player spawns at deck spawn; no duplicate pickups. Also reload the page while a terminal overlay is open and while the finale is mid-question, then continue: is the state sane? Verify NEW GAME after an ending fully resets (fresh seed, trust 0, empty journal).` },
  { key: 'model-quality', prompt: `Audit the neural model's in-game quality (LM must be loaded; check LM.isLoaded). In page context generate 4 logs for each of the 5 crew authors via await Story.generateLog(author, "test"+i) and read them: score each 1-5 for (a) English coherence, (b) voice distinctiveness (does a CHO log talk engines while KIT talks plants?), (c) lore consistency (no contradictions like wrong death facts). Then test ECHO replies via await Story.echoReply(...) on 8 varied player lines (greeting, question about crew, telling it the crew are dead, gibberish). Then persona judging: await Story.judgeVoice(...) on 3 fresh self-written imitations per crew member, report accuracy. Include representative quotes. This is a quality report, not a bug hunt; put scores and quotes in notes, and file findings only for systemic problems (e.g. logs frequently degenerate into repetition).` },
  { key: 'performance', prompt: `Measure performance: page load to title time; model load time (the #loadstatus text reports it); time for one terminal log generation; time for one door judgment (speak at a door, measure until verdict text changes); FPS during generation (sample requestAnimationFrame deltas over 5s in page.evaluate while a terminal entry streams). Also run 10 consecutive generations to hunt memory growth (performance.memory.usedJSHeapSize if available). File findings only if: load > 10s, generation > 25s, judgment > 12s, sustained FPS < 24, or unbounded memory growth.` },
]

phase('Playtest')
const results = await parallel(jobs.map(j => () =>
  agent(BOILER + j.prompt, { label: j.key, phase: 'Playtest', schema: FINDINGS })
))
const all = []
results.forEach((r, i) => {
  if (!r) { log(`${jobs[i].key}: agent failed`); return }
  for (const f of (r.findings || [])) all.push(Object.assign({ tester: jobs[i].key }, f))
  log(`${jobs[i].key}: ${(r.findings || []).length} findings`)
})
const notes = {}
results.forEach((r, i) => { if (r && r.notes) notes[jobs[i].key] = r.notes })
return { findings: all, notes }
