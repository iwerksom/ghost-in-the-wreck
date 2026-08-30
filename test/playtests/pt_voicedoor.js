// Voice-door deep playtest
const { chromium } = require("playwright");
const fs = require("fs");

const SHOTS = "/home/claude/ghostwreck/test/shots";
const log = (...a) => console.log("[PT]", ...a);
const results = { pageErrors: [], consoleErrors: [], events: [] };

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on("pageerror", err => { results.pageErrors.push(String(err)); log("PAGEERROR:", String(err)); });
  page.on("console", m => { if (m.type() === "error") { results.consoleErrors.push(m.text()); log("CONSOLE ERROR:", m.text()); } });

  await page.goto("file:///home/claude/ghostwreck/artifact.html");
  await page.waitForSelector("#btnNew", { state: "visible", timeout: 180000 });
  await page.waitForFunction(() => typeof LM !== "undefined" && LM.isLoaded, undefined, { timeout: 180000 });
  log("LM loaded");
  await page.click("#btnNew");
  for (let i = 0; i < 4; i++) { await page.waitForTimeout(400); await page.click("#introOverlay"); }
  await page.waitForTimeout(600);
  try { await page.click("#deckOverlay", { timeout: 5000 }); } catch (e) {}
  await page.waitForTimeout(500);
  log("game started");

  async function stableText(sel, maxMs = 45000) {
    // wait until element text stops changing for 1.6s
    const t0 = Date.now();
    let last = "", lastChange = Date.now();
    while (Date.now() - t0 < maxMs) {
      const cur = await page.$eval(sel, el => el.textContent);
      if (cur !== last) { last = cur; lastChange = Date.now(); }
      else if (cur.length > 0 && Date.now() - lastChange > 1600) return cur;
      await page.waitForTimeout(300);
    }
    return last;
  }

  async function gotoDeck(n) {
    await page.evaluate((n) => gotoDeck(n), n);
    await page.waitForTimeout(700);
    try { await page.click("#deckOverlay", { timeout: 4000 }); } catch (e) {}
    await page.waitForTimeout(400);
  }

  async function interact(pred) {
    return await page.evaluate((predSrc) => {
      const pred = eval(predSrc);
      const e = Game.deck.entities.find(pred);
      if (!e) return null;
      Game.state.px = e.x * 32 + 16; Game.state.py = (e.y + 1) * 32 + 16;
      Game.nearEntity = e; Game.onInteract(e);
      return { type: e.type, label: e.label, persona: e.persona || e.author || null };
    }, pred);
  }

  async function readTerminalEntry() {
    // terminal already open, click read, wait for generation to finish (btn re-enabled)
    await page.click("#termBtnRead");
    await page.waitForFunction(() => !document.getElementById("termBtnRead").disabled, undefined, { timeout: 120000 });
    return await page.$eval("#termBody", el => el.textContent.trim());
  }

  async function getBars() {
    return await page.$$eval("#doorBars .barrow", rows => rows.map(r => ({
      name: r.querySelector(".barname").textContent.trim(),
      pct: r.querySelector(".barpct").textContent.trim(),
      width: r.querySelector(".barfill").style.width,
    })));
  }

  async function doorAttempt(text, shotName) {
    await page.fill("#doorInput", text);
    const barsBefore = await getBars();
    await page.click("#doorSpeak");
    await page.waitForFunction(() => /RECOGNIZED|WRONG VOICE|UNRECOGNIZED/.test(document.getElementById("doorVerdict").textContent), undefined, { timeout: 150000 });
    const verdict = await page.$eval("#doorVerdict", el => el.textContent);
    const verdictClass = await page.$eval("#doorVerdict", el => el.className);
    const bars = await getBars();
    const win = /^RECOGNIZED/.test(verdict);
    if (win) {
      // wait for auto-close
      await page.waitForFunction(() => !document.getElementById("doorOverlay").classList.contains("show") && document.getElementById("doorOverlay").style.display !== "flex" || getComputedStyle(document.getElementById("doorOverlay")).display === "none", undefined, { timeout: 120000 }).catch(() => {});
      await page.waitForTimeout(1000);
    } else {
      await page.waitForFunction(() => !document.getElementById("doorSpeak").disabled, undefined, { timeout: 150000 });
    }
    const hint = await page.$eval("#doorHint", el => el.textContent.trim()).catch(() => "");
    const hintLines = await page.$$eval("#doorHint .hintline", els => els.map(e => e.textContent)).catch(() => []);
    const o2 = await page.evaluate(() => Game.state.o2);
    if (shotName) await page.screenshot({ path: `${SHOTS}/${shotName}.png` });
    const rec = { text, verdict, verdictClass, win, bars, hint: hintLines, o2, barsChanged: JSON.stringify(barsBefore) !== JSON.stringify(bars) };
    results.events.push(rec);
    log("ATTEMPT:", JSON.stringify({ text, verdict, win, bars: bars.map(b => b.name + "=" + b.pct).join(" "), hintLines: hintLines.length }));
    return rec;
  }

  async function openDoorByPersona(persona) {
    const info = await interact(`(x) => x.type === "echodoor" && x.persona === ${JSON.stringify(persona)}`);
    log("opened door:", JSON.stringify(info));
    await page.waitForSelector("#doorOverlay", { state: "visible", timeout: 10000 });
    const echoLine = await stableText("#doorEchoLine", 60000);
    log("door echo line:", echoLine);
    const bars0 = await getBars();
    log("initial bars:", bars0.map(b => b.name + "=" + b.pct).join(" "));
    return bars0;
  }

  async function closeDoorIfOpen() {
    const vis = await page.$eval("#doorOverlay", el => getComputedStyle(el).display !== "none").catch(() => false);
    if (vis) { await page.click("#doorClose").catch(() => {}); await page.waitForTimeout(400); }
  }

  // keep o2 comfortable so suffocation doesn't interfere with door testing
  async function topUpO2() { await page.evaluate(() => { if (Game.state.o2 < 40) Game.state.o2 = 80; }); }

  // ================= DECK 1 : HYDROPONICS / KIT =================
  await gotoDeck(1);
  log("=== DECK 1 HYDROPONICS ===");

  // read 3 Kit logs (Garden Console x2, Misting Station x1)
  const kitLogs = [];
  let t = await interact(`(x) => x.type === "terminal" && x.author === "KIT" && x.label === "Garden Console"`);
  log("terminal:", JSON.stringify(t));
  await page.waitForTimeout(500);
  kitLogs.push(await readTerminalEntry());
  kitLogs.push(await readTerminalEntry());
  await page.screenshot({ path: `${SHOTS}/pt_voicedoor_kit_terminal.png` });
  await page.click("#termClose");
  await page.waitForTimeout(400);
  t = await interact(`(x) => x.type === "terminal" && x.label === "Misting Station"`);
  await page.waitForTimeout(500);
  kitLogs.push(await readTerminalEntry());
  await page.click("#termClose");
  await page.waitForTimeout(400);
  results.kitLogs = kitLogs;
  log("KIT LOG 1:", kitLogs[0]);
  log("KIT LOG 2:", kitLogs[1]);
  log("KIT LOG 3:", kitLogs[2]);
  await topUpO2();

  // Seed vault door: (b) Reyne-style fail, (c) mash fail -> (d) hints after 2 fails, then (a) Kit imitation
  await openDoorByPersona("KIT");
  const reyneLine = "This is the captain. My crew, my watch, my responsibility. Open this door. That is an order.";
  const r1 = await doorAttempt(reyneLine, "pt_voicedoor_kit_wrongvoice");
  const mash = "xkfj qwpz vvtt zzqk jjjx mmwp";
  const r2 = await doorAttempt(mash, "pt_voicedoor_kit_mash");
  results.hintAfterTwoFails = r2.hint.length > 0 || r2.hint !== "";
  log("hints after 2 fails:", JSON.stringify(r2.hint));
  await topUpO2();
  // (a) Kit imitation, up to 3 tries
  const kitTries = [
    "The seedlings came up green today. I misted the ferns and left the lamps on for the garden.",
    "Checked the seed trays this morning. The soil is damp and the little green shoots like the light.",
    "Gave the last of the water to the plants. Something green should outlive us. Leave the lamps on.",
  ];
  let kitOpened = false, kitAttempts = 0;
  for (const line of kitTries) {
    kitAttempts++;
    const r = await doorAttempt(line, `pt_voicedoor_kit_try${kitAttempts}`);
    if (r.win) { kitOpened = true; break; }
    await topUpO2();
  }
  results.kitDoor = { opened: kitOpened, attemptsToOpen: kitAttempts };
  log("KIT door opened:", kitOpened, "in", kitAttempts, "imitation tries");
  await closeDoorIfOpen();

  // re-interact with opened door: should toast "remembers your voice"
  if (kitOpened) {
    const reinfo = await page.evaluate(() => {
      const e = Game.deck.entities.find(x => x.type === "echodoor");
      Game.onInteract(e);
      return document.getElementById("toast") ? document.getElementById("toast").textContent : null;
    }).catch(() => null);
    log("reopen toast:", reinfo);
    results.reopenToast = reinfo;
  }
  await closeDoorIfOpen();

  // ================= DECK 3 : ENGINEERING / CHO =================
  await gotoDeck(3);
  log("=== DECK 3 ENGINEERING ===");
  await topUpO2();
  await openDoorByPersona("CHO");
  // attempt 1: wrong voice (Kit-style)
  await doorAttempt("The seedlings are green and the garden likes the light. I misted the ferns.", "pt_voicedoor_cho_wrong");
  await topUpO2();
  // attempt 2 (and 3 if needed): Cho imitation
  const choTries = [
    "Held the feed levers by hand all shift. The old girl wanted to breach and I talked her down. Reactor is stable.",
    "Coolant pressure is holding. I begged the old girl down and she sang one low note for me.",
  ];
  let choOpened = false, choAttempts = 0;
  for (const line of choTries) {
    choAttempts++;
    const r = await doorAttempt(line, `pt_voicedoor_cho_try${choAttempts}`);
    if (r.win) { choOpened = true; break; }
    await topUpO2();
  }
  results.choDoor = { opened: choOpened, attemptsToOpen: choAttempts };
  log("CHO door opened:", choOpened, "in", choAttempts, "imitation tries");
  await closeDoorIfOpen();

  // ================= DECK 4 : BRIDGE / VEGA + REYNE =================
  await gotoDeck(4);
  log("=== DECK 4 BRIDGE ===");
  await topUpO2();

  // VEGA door
  await openDoorByPersona("VEGA");
  await doorAttempt("Held the feed levers by hand. The reactor is stable and the old girl sang for me.", "pt_voicedoor_vega_wrong");
  await topUpO2();
  const vegaTries = [
    "The stars drifted a quarter degree off the charts tonight. I ran the parallax twice. The Reach is closer than it should be.",
    "Plotted our drift against the charts. The stars are private things and they are still where I left them.",
  ];
  let vegaOpened = false, vegaAttempts = 0;
  for (const line of vegaTries) {
    vegaAttempts++;
    const r = await doorAttempt(line, `pt_voicedoor_vega_try${vegaAttempts}`);
    if (r.win) { vegaOpened = true; break; }
    await topUpO2();
  }
  results.vegaDoor = { opened: vegaOpened, attemptsToOpen: vegaAttempts };
  log("VEGA door opened:", vegaOpened, "in", vegaAttempts, "imitation tries");
  await closeDoorIfOpen();

  // REYNE door
  await topUpO2();
  await openDoorByPersona("REYNE");
  await doorAttempt("The seedlings like the light. I left the lamps on over the garden for them.", "pt_voicedoor_reyne_wrong");
  await topUpO2();
  const reyneTries = [
    "Vesper command log. My crew, my watch, my responsibility. I will get them out. Reyne out.",
    "This is the captain. Storm protocol stands until I lift it. My crew is aboard and alive. Reyne out.",
  ];
  let reyneOpened = false, reyneAttempts = 0;
  for (const line of reyneTries) {
    reyneAttempts++;
    const r = await doorAttempt(line, `pt_voicedoor_reyne_try${reyneAttempts}`);
    if (r.win) { reyneOpened = true; break; }
    await topUpO2();
  }
  results.reyneDoor = { opened: reyneOpened, attemptsToOpen: reyneAttempts };
  log("REYNE door opened:", reyneOpened, "in", reyneAttempts, "imitation tries");
  await closeDoorIfOpen();

  await page.screenshot({ path: `${SHOTS}/pt_voicedoor_final.png` });
  fs.writeFileSync("/home/claude/ghostwreck/test/pt_voicedoor_results.json", JSON.stringify(results, null, 2));
  log("DONE. pageErrors:", results.pageErrors.length, "consoleErrors:", results.consoleErrors.length);
  await browser.close();
})().catch(async (e) => {
  console.error("FATAL:", e);
  fs.writeFileSync("/home/claude/ghostwreck/test/pt_voicedoor_results.json", JSON.stringify(results, null, 2));
  process.exit(1);
});
