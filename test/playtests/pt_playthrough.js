// Honest full playthrough: dock -> hydro -> med -> eng -> bridge -> core.
// Real interactions via UI; teleport helper used for positioning within decks.
const { chromium } = require("playwright");
const fs = require("fs");

const LOG = "/home/claude/ghostwreck/test/pt_playthrough.log";
const SHOTS = "/home/claude/ghostwreck/test/shots";
fs.writeFileSync(LOG, "");
function log(...a) {
  const line = `[${((Date.now() - T0) / 1000).toFixed(1)}s] ` + a.join(" ");
  console.log(line);
  fs.appendFileSync(LOG, line + "\n");
}
let T0 = Date.now();

const findings = [];
const errors = { page: [], console: [] };

(async () => {
  const browser = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on("pageerror", e => { errors.page.push(String(e)); log("PAGEERROR:", String(e)); });
  page.on("console", m => { if (m.type() === "error") { errors.console.push(m.text()); log("CONSOLEERR:", m.text()); } });

  await page.goto("file:///home/claude/ghostwreck/artifact.html");
  await page.waitForFunction(() => typeof LM !== "undefined" && LM.isLoaded, null, { timeout: 240000 });
  log("LM loaded");
  await page.screenshot({ path: SHOTS + "/pt_full_00_title.png" });

  // ---------- helpers ----------
  const shown = id => page.evaluate(i => {
    const el = document.getElementById(i);
    return el && el.classList.contains("show");
  }, id);

  async function waitShown(id, on, timeout = 90000) {
    await page.waitForFunction(([i, want]) => {
      const el = document.getElementById(i);
      return (!!(el && el.classList.contains("show"))) === want;
    }, [id, on], { timeout });
  }

  // wait until an element's text is nonempty and stable for `stable` ms
  async function waitTextDone(sel, { timeout = 120000, stable = 1600, min = 5 } = {}) {
    const end = Date.now() + timeout;
    let last = "", lastChange = Date.now();
    while (Date.now() < end) {
      const t = await page.evaluate(s => (document.querySelector(s)?.textContent || ""), sel);
      if (t !== last) { last = t; lastChange = Date.now(); }
      if (t.length >= min && Date.now() - lastChange >= stable) return t;
      await page.waitForTimeout(250);
    }
    return last;
  }

  async function teleportTo(chOrType, offY = 1) {
    return page.evaluate(([k, oy]) => {
      const e = Game.deck.entities.find(x => x.ch === k) ||
        Game.deck.entities.find(x => x.type === k);
      if (!e) return null;
      Game.state.px = e.x * 32 + 16;
      Game.state.py = (e.y + oy) * 32 + 16;
      return { x: e.x, y: e.y, type: e.type, label: e.label || "" };
    }, [chOrType, offY]);
  }

  async function interactCh(ch) {
    return page.evaluate(k => {
      const e = Game.deck.entities.find(x => x.ch === k) ||
        Game.deck.entities.find(x => x.type === k);
      if (!e) return null;
      Game.state.px = e.x * 32 + 16;
      Game.state.py = (e.y + 1) * 32 + 16;
      Game.nearEntity = e;
      Game.onInteract(e);
      return { type: e.type, label: e.label || "", x: e.x, y: e.y };
    }, ch);
  }

  const st = () => page.evaluate(() => ({
    deck: Game.deck.src.id, o2: Math.round(Game.state.o2), cells: Game.state.cells,
    trust: Game.state.trust, journal: Game.state.journal.length,
    px: Math.round(Game.state.px / 32), py: Math.round(Game.state.py / 32),
  }));

  async function dismissDeckOverlay() {
    await waitShown("deckOverlay", true, 30000);
    await page.waitForTimeout(900);
    await page.click("#deckOverlay");
    await waitShown("deckOverlay", false, 10000);
  }

  async function readTerminal(ch, name) {
    const e = await interactCh(ch);
    log(`terminal ${name}:`, JSON.stringify(e));
    await waitShown("termOverlay", true, 10000);
    // readEntry auto-starts; done when termMeta mentions "reconstructed"
    await page.waitForFunction(() =>
      document.getElementById("termMeta").textContent.includes("reconstructed"),
      null, { timeout: 150000 });
    const body = await page.evaluate(() => document.getElementById("termBody").textContent);
    const meta = await page.evaluate(() => document.getElementById("termMeta").textContent);
    log(`  log [${meta.slice(0, 60)}]: ${body.slice(0, 140)}...`);
    await page.click("#termClose");
    await waitShown("termOverlay", false, 5000);
    return body;
  }

  async function readArchive(ch, name) {
    const e = await interactCh(ch);
    log(`archive ${name}:`, JSON.stringify(e));
    await waitShown("termOverlay", true, 10000);
    const body = await waitTextDone("#termBody", { timeout: 60000, stable: 1400 });
    log(`  archive text: ${body.slice(0, 120)}...`);
    await page.click("#termClose");
    await waitShown("termOverlay", false, 5000);
  }

  async function kneelBody() {
    const e = await interactCh("body");
    if (!e) { log("no body on this deck?"); return; }
    await waitShown("noteOverlay", true, 8000);
    const t = await waitTextDone("#noteText", { timeout: 30000, stable: 1200 });
    log("kneel:", t.slice(0, 90) + "...");
    await page.click("#noteClose");
    await waitShown("noteOverlay", false, 5000);
  }

  async function pickup(type, label) {
    // teleport onto the tile; engine tick collects it
    const before = await st();
    const got = await page.evaluate(k => {
      const e = Game.deck.entities.find(x => x.type === k && !Game.state.collected[entKey(x)]);
      if (!e) return null;
      Game.state.px = e.x * 32 + 16;
      Game.state.py = e.y * 32 + 16;
      return { x: e.x, y: e.y };
    }, type);
    if (!got) { log(`no uncollected ${type} on deck`); return false; }
    await page.waitForTimeout(700);
    const after = await st();
    log(`pickup ${label}: cells ${before.cells}->${after.cells}, o2 ${before.o2}->${after.o2}`);
    return true;
  }

  async function useSocket(ch) {
    const before = await st();
    await interactCh(ch);
    await page.waitForTimeout(400);
    const after = await st();
    log(`socket ${ch}: cells ${before.cells}->${after.cells}`);
  }

  async function voiceDoor(ch, persona, candidates) {
    const e = await interactCh(ch);
    log(`voice door (${persona}):`, JSON.stringify(e));
    await waitShown("doorOverlay", true, 10000);
    // wait for ECHO's opening line to finish streaming
    await waitTextDone("#doorEchoLine", { timeout: 90000, stable: 2000 });
    let attempt = 0;
    for (const text of candidates) {
      attempt++;
      await page.fill("#doorInput", text);
      await page.evaluate(() => { document.getElementById("doorVerdict").textContent = ""; });
      await page.click("#doorSpeak");
      await page.waitForFunction(() => {
        const v = document.getElementById("doorVerdict").textContent;
        return /RECOGNIZED|WRONG VOICE|UNRECOGNIZED/.test(v);
      }, null, { timeout: 180000 });
      const verdict = await page.evaluate(() => document.getElementById("doorVerdict").textContent);
      log(`  attempt ${attempt}: "${text.slice(0, 70)}..." -> ${verdict}`);
      if (verdict.startsWith("RECOGNIZED")) {
        // reply streams, then overlay auto-closes 2.6s later
        await waitShown("doorOverlay", false, 120000);
        const s = await st();
        log(`  door OPEN. trust=${s.trust} o2=${s.o2}`);
        return { attempts: attempt, verdict };
      }
      // failed: wait for the echo reply (and possible hints) to settle before next try
      await waitTextDone("#doorEchoLine", { timeout: 90000, stable: 2200 });
      await page.waitForFunction(() => !document.getElementById("doorSpeak").disabled, null, { timeout: 120000 });
      await page.waitForTimeout(500);
    }
    // out of candidates
    const bars = await page.evaluate(() => document.getElementById("doorBars").textContent);
    log(`  DOOR FAILED after ${attempt} attempts. bars: ${bars}`);
    await page.click("#doorClose");
    await waitShown("doorOverlay", false, 5000);
    return { attempts: attempt, verdict: "FAILED" };
  }

  async function intercomSay(lines) {
    await interactCh("intercom");
    await waitShown("comOverlay", true, 8000);
    let sent = 0;
    for (const text of lines) {
      await page.fill("#comInput", text);
      // click until the message is accepted (comBusy may swallow clicks)
      const target = sent + 1;
      const accepted = async () => page.evaluate(n =>
        document.getElementById("comLog").querySelectorAll(".comyou").length >= n, target);
      const deadline = Date.now() + 180000;
      while (!(await accepted()) && Date.now() < deadline) {
        await page.click("#comSpeak");
        await page.waitForTimeout(1500);
      }
      sent++;
      // wait for ECHO reply for this message
      await page.waitForFunction(tl => {
        const echoes = [...document.getElementById("comLog").querySelectorAll(".comecho")]
          .filter(d => d.textContent.startsWith("ECHO :"));
        return echoes.length >= tl;
      }, target, { timeout: 180000 });
      // wait for the voiceprint judge to finish (comBusy false => vp appended or skipped)
      await page.waitForFunction(tl => {
        const l = document.getElementById("comLog");
        return l.querySelectorAll(".comvp").length >= tl;
      }, target, { timeout: 120000 }).catch(() => {});
      const last = await page.evaluate(() => {
        const l = document.getElementById("comLog");
        const es = [...l.querySelectorAll(".comecho, .comvp")];
        return es.slice(-2).map(d => d.textContent).join(" | ");
      });
      log(`  intercom "${text.slice(0, 50)}..." -> ${last.slice(0, 180)}`);
    }
    await page.waitForTimeout(500);
    await page.click("#comClose");
    await waitShown("comOverlay", false, 5000);
  }

  async function useLift(ch) {
    const before = await st();
    await interactCh(ch);
    await page.waitForTimeout(600);
    const after = await st();
    if (after.deck === before.deck) {
      // maybe locked; report toast state
      const lifts = await page.evaluate(k => {
        const e = Game.deck.entities.find(x => x.ch === k);
        return { needs: e.needs, unlocked: liftUnlocked(e) };
      }, ch);
      log(`LIFT DID NOT MOVE: ${JSON.stringify(lifts)}`);
      return false;
    }
    log(`lift -> ${after.deck}`);
    await dismissDeckOverlay();
    return true;
  }

  // ============================================================ START RUN
  T0 = Date.now();
  log("=== NEW GAME ===");
  await page.click("#btnNew");
  await waitShown("introOverlay", true, 5000);
  for (let i = 0; i < 4; i++) {
    await page.waitForTimeout(1000);
    await page.click("#introOverlay");
  }
  // deck overlay for dock
  await dismissDeckOverlay();
  log("dock entered. waiting for first contact subtitles...");
  // first contact: 3 subtitles queued; wait for subtitle to clear
  await page.waitForTimeout(2000);
  await page.waitForFunction(() => !Game.subtitle, null, { timeout: 60000 }).catch(() => log("subtitle still up after 60s"));
  await page.screenshot({ path: SHOTS + "/pt_full_01_dock.png" });

  // honest WASD movement check
  const p0 = await st();
  await page.keyboard.down("d");
  await page.waitForTimeout(900);
  await page.keyboard.up("d");
  await page.keyboard.down("s");
  await page.waitForTimeout(600);
  await page.keyboard.up("s");
  const p1 = await st();
  log(`WASD move: (${p0.px},${p0.py}) -> (${p1.px},${p1.py})`);
  if (p0.px === p1.px && p0.py === p1.py) findings.push("WASD movement did not change position");

  // ---------------- DECK 0 : DOCK ----------------
  await readTerminal("1", "Dock Control (REYNE)");
  await intercomSay([
    "Hello? Is anyone there? My ship is dead and I need help.",
    "I am a salvage pilot. I mean no harm. I am trying to get home.",
  ]);
  await readArchive("3", "Sealed Recorder (reyne_teaser)");
  await kneelBody();
  await pickup("cell", "power cell");
  await pickup("o2", "air canister");
  await useSocket("4");
  log("state:", JSON.stringify(await st()));
  await useLift("5");

  // ---------------- DECK 1 : HYDRO ----------------
  await readTerminal("1", "Garden Console (KIT)");
  await readTerminal("2", "Misting Station (KIT)");
  await readArchive("4", "Kit's Recorder");
  await kneelBody();
  await pickup("o2", "air canister");
  const kitDoor = await voiceDoor("3", "KIT", [
    "The seedlings came up green today. I misted Bea the fern and left the light-lamps on for the garden.",
    "Old Tom put out a new leaf this morning. The soil smells warm and the roots are drinking. Small green joys.",
    "The seedlings came up green today. I misted the ferns and left the lamps on for the garden.",
  ]);
  await page.screenshot({ path: SHOTS + "/pt_full_02_hydro_door.png" });
  log("state:", JSON.stringify(await st()));
  await useLift("5");

  // ---------------- DECK 2 : MED ----------------
  await readTerminal("1", "Patient Records (OKAFOR)");
  await readTerminal("5", "Triage Console (OKAFOR)");
  await readArchive("4", "Okafor's Recorder");
  await kneelBody();
  await intercomSay(["I read your logs, Ben. You kept your voice level for all of them. Thank you."]);
  await pickup("o2", "air canister");
  const okDoor = await voiceDoor("3", "OKAFOR", [
    "Patient presents with shallow breathing. Vitals stable. I gave the last of the saline and sat through the sleep cycle with them.",
    "Second time this week I have counted three of them at dinner. Vitals steady. My hands know the dosage by heart.",
    "Patient presents with mild burns. Dosage administered, vitals level, sleep cycle holding. Second time this week.",
  ]);
  log("state:", JSON.stringify(await st()));
  await useLift("6");

  // ---------------- DECK 3 : ENG ----------------
  await readTerminal("1", "Reactor Console (CHO)");
  await readArchive("5", "Cho's Recorder");
  await kneelBody();
  await pickup("cell", "power cell 1");
  await pickup("cell", "power cell 2");
  await pickup("o2", "air canister");
  await useSocket("2");
  await useSocket("3");
  const choDoor = await voiceDoor("4", "CHO", [
    "Damn manifold rattled all shift but I torqued the bearings down and the plasma feed hums. The old girl wants to sing.",
    "Coolant pressure is holding. I begged the old girl down and she sang one low note for me.",
    "Coolant loop is warm and the manifold hums. Hell, the old girl nearly sang for me tonight.",
  ]);
  log("state:", JSON.stringify(await st()));
  await useLift("6");

  // ---------------- DECK 4 : BRIDGE ----------------
  await readTerminal("1", "Nav Station (VEGA)");
  await readTerminal("2", "Command Console (REYNE)");
  await readArchive("4", "The Final Log");
  await kneelBody();
  await pickup("o2", "air canister");
  const vegaDoor = await voiceDoor("3", "VEGA", [
    "It is 0300 and the glass is full of embers. The Reach breathes lightyears at me and I chart her drift like an old friend.",
    "The stars drifted a quarter degree off the charts tonight. I ran the parallax twice. The Reach is closer than it should be.",
  ]);
  const reyneDoor = await voiceDoor("5", "REYNE", [
    "0600 watch. Manifest checked, headings logged, protocol holds. My crew comes first. Reyne out.",
    "Vesper command log. My crew, my watch, my responsibility. I will get them out. Reyne out.",
  ]);
  await page.screenshot({ path: SHOTS + "/pt_full_03_bridge.png" });
  log("state:", JSON.stringify(await st()));
  await useLift("6");

  // ---------------- DECK 5 : CORE ----------------
  await interactCh("2"); // hangar tease
  await page.waitForTimeout(500);
  const preFinale = await st();
  log("pre-finale state:", JSON.stringify(preFinale));

  // journal sanity check
  await page.evaluate(() => document.getElementById("btnJournal").click());
  await page.waitForTimeout(800);
  const jc = await page.evaluate(() => document.getElementById("journalCount").textContent);
  log("journal:", jc);
  await page.evaluate(() => document.getElementById("journalClose").click());
  await page.waitForTimeout(300);

  // ---------------- FINALE (honest) ----------------
  async function fps() {
    return page.evaluate(() => new Promise(r => {
      let n = 0; const t0 = performance.now();
      function f() { n++; if (performance.now() - t0 < 1500) requestAnimationFrame(f); else r((n / 1.5).toFixed(1)); }
      requestAnimationFrame(f);
    }));
  }
  async function finaleAnswer(text, step) {
    await page.waitForFunction(s => document.getElementById("finaleStep").textContent.includes(`${s} / 3`), step, { timeout: 600000 });
    await page.waitForFunction(() => document.getElementById("finaleQ").textContent.length > 60, null, { timeout: 120000 });
    await page.waitForTimeout(2500);
    await page.fill("#finaleInput", text);
    const t = Date.now();
    await page.press("#finaleInput", "Enter");
    log(`  Q${step} submitted; fps now: ${await fps()}`);
    const end = Date.now() + 600000;
    while (Date.now() < end) {
      const s2 = await page.evaluate(() => ({
        step: document.getElementById("finaleStep").textContent,
        reply: document.getElementById("finaleReply").textContent.slice(0, 120),
        ending: document.getElementById("endingOverlay").classList.contains("show"),
      }));
      if (s2.ending || (step < 3 && s2.step.includes(`${step + 1} / 3`))) {
        log(`  finale Q${step} done in ${((Date.now() - t) / 1000).toFixed(1)}s; reply="${s2.reply}"`);
        return;
      }
      await page.waitForTimeout(1200);
    }
    log(`  finale Q${step} TIMED OUT after 600s; fps: ${await fps()}`);
    throw new Error("finale answer timeout");
  }
  log("fps before finale:", await fps());
  await interactCh("1"); // corealtar
  await waitShown("finaleOverlay", true, 10000);
  await page.screenshot({ path: SHOTS + "/pt_full_04_finale.png" });
  log("fps at finale open:", await fps());
  await finaleAnswer("My ship died out in the Reach. I came for air and a way home, but I stayed to read your crew. I know what happened to them.", 1);
  await finaleAnswer("Kit Aune. She kept the garden green so something would outlive them. Please keep the lamps on for Bea and Old Tom.", 2);
  const t3 = await st();
  log("trust before Q3:", t3.trust);
  await finaleAnswer("The watch is over, ECHO. You kept them safe all the way to the end. Now let them rest, open the doors, and rest yourself. Goodbye.", 3);
  await waitShown("endingOverlay", true, 120000);
  await page.waitForFunction(() => document.getElementById("endingStats").textContent.length > 0, null, { timeout: 180000 });
  const endingTitle = await page.evaluate(() => document.getElementById("endingTitle").textContent);
  const stats = await page.evaluate(() => document.getElementById("endingStats").textContent);
  const honest = await st();
  const honestMs = Date.now() - T0;
  log(`=== HONEST ENDING: "${endingTitle}" | ${stats} | ${JSON.stringify(honest)} | ${(honestMs / 60000).toFixed(1)} min ===`);
  await page.screenshot({ path: SHOTS + "/pt_full_05_ending_honest.png" });

  log("PAGE ERRORS:", JSON.stringify(errors.page));
  log("CONSOLE ERRORS:", JSON.stringify(errors.console));
  log("DONE");
  await browser.close();
})().catch(e => { log("SCRIPT CRASH:", e.stack || String(e)); process.exit(1); });
