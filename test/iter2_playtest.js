// Iteration 2 prototype: scripted run through every new system in the real
// page (real model, real UI).  Run: node test/iter2_playtest.js
// Screenshots land in test/shots/iter2_*.png.
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");
const SHOTS = __dirname + "/shots/";
fs.mkdirSync(SHOTS, { recursive: true });

const checks = [];
const check = (name, ok, detail = "") => { checks.push({ name, ok: !!ok, detail }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  : " + detail : ""}`); };

(async () => {
  const browser = await chromium.launch(Object.assign({ args: ["--no-sandbox"] },
    process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}));
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", e => errors.push("PAGEERROR: " + e.message));
  const url = process.env.URL || "file://" + path.resolve(__dirname, "../game/index.html");
  await page.goto(url);
  await page.waitForFunction(() => typeof LM !== "undefined" && LM.isLoaded, null, { timeout: 30000 });
  await page.click("#btnNew");
  for (let i = 0; i < 12; i++) {
    await page.click("#introOverlay").catch(() => {});
    await page.waitForTimeout(150);
    if (!(await page.$eval("#introOverlay", el => el.classList.contains("show")))) break;
  }
  await page.click("#deckOverlay");
  await page.waitForTimeout(300);
  const shot = n => page.screenshot({ path: SHOTS + "iter2_" + n + ".png" });
  const S = () => page.evaluate(() => ({ o2: Game.state.o2, sus: Game.state.suspicion, trust: Game.state.trust, deck: Game.deck.src.id }));

  async function interact(pred) {
    return page.evaluate((pred) => {
      const f = new Function("x", "return " + pred);
      const e = Game.deck.entities.find(x => f(x));
      if (!e) return "missing";
      for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        if (!solidAt(e.x + dx, e.y + dy)) {
          Game.state.px = (e.x + dx) * 32 + 16; Game.state.py = (e.y + dy) * 32 + 16;
          Game.nearEntity = e; Game.onInteract(e); return "ok";
        }
      }
      return "blocked";
    }, pred);
  }
  async function toDeck(idx) {
    await page.evaluate(i => { UI.closeOverlays(); gotoDeck(i); }, idx);
    await page.waitForTimeout(250);
    await page.click("#deckOverlay");
    await page.waitForTimeout(250);
  }
  async function waitTerminal() {
    await page.waitForFunction(() => !document.getElementById("termBtnRead").disabled, null, { timeout: 60000 });
  }
  // speak at the open door and wait for the verdict
  async function speak(text) {
    await page.fill("#doorInput", text);
    await page.click("#doorSpeak");
    await page.waitForFunction(() => {
      const v = document.getElementById("doorVerdict").textContent;
      return v && !v.startsWith("ECHO is listening");
    }, null, { timeout: 60000 });
    const verdict = await page.$eval("#doorVerdict", el => el.textContent);
    await page.waitForFunction(() => !document.getElementById("doorOverlay").classList.contains("show") ||
      !document.getElementById("doorSpeak").disabled || document.getElementById("doorInput").disabled, null, { timeout: 60000 });
    await page.waitForTimeout(300);
    return verdict;
  }
  async function openDoorAndAnswer(persona, answers, label) {
    let opened = false, tries = 0;
    for (const a of answers) {
      tries++;
      const state = await page.evaluate(p => {
        const e = Game.deck.entities.find(x => x.type === "echodoor" && x.persona === p);
        return { opened: isOpened(e), overlay: Game.overlayId };
      }, persona);
      if (state.opened) { opened = true; break; }
      if (state.overlay !== "doorOverlay") {
        await interact(`x.type === "echodoor" && x.persona === "${persona}"`);
        await page.waitForTimeout(1800);
      }
      const v = await speak(a);
      console.log(`   ${label} try ${tries}: ${v}`);
      await page.waitForTimeout(400);
      opened = await page.evaluate(p => isOpened(Game.deck.entities.find(x => x.type === "echodoor" && x.persona === p)), persona);
      if (opened) break;
    }
    return { opened, tries };
  }

  // ---------- 1. air drains while reading ----------
  let s0 = await S();
  await interact(`x.type === "terminal"`);
  await waitTerminal();
  await page.waitForTimeout(4000);
  let s1 = await S();
  check("air drains while a terminal is open", s1.o2 < s0.o2 - 0.3, `${s0.o2.toFixed(1)} -> ${s1.o2.toFixed(1)}`);
  await page.click("#termClose");

  // ---------- 2. keepsake + farewell on the dock ----------
  await page.evaluate(() => { Game.state.suspicion = 30; });
  await interact(`x.type === "body"`);
  await page.waitForTimeout(1200);
  const journalHasKeepsake = await page.evaluate(() => Game.state.journal.some(j => j.keepsake));
  check("kneeling gives a keepsake in the journal", journalHasKeepsake);
  await page.fill("#noteInput", "Rest now, Captain. Your crew is safe and the watch is kept.");
  await page.click("#noteSpeak");
  await page.waitForFunction(() => document.getElementById("noteEcho").textContent.length > 8, null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  await shot("01_keepsake");
  const s2 = await S();
  check("a farewell lowers suspicion", s2.sus < 26, `suspicion ${s2.sus.toFixed(1)}`);
  await page.click("#noteClose");
  await page.evaluate(() => { Game.state.suspicion = 0; });

  // ---------- 3. hydroponics: clue log, cheese, genuine ----------
  await toDeck(1);
  await interact(`x.type === "terminal" && (x.clues || []).includes("kit_plants")`);
  await waitTerminal();
  const termHtml = await page.$eval("#termBody", el => el.innerHTML);
  check("clue terminal log contains the anchored memory", termHtml.includes("<mark") && termHtml.includes("Bea the fern"), termHtml.slice(0, 120));
  await shot("02_clue_log");
  await page.click("#termClose");

  await interact(`x.type === "echodoor" && x.persona === "KIT"`);
  await page.waitForTimeout(2200);
  await shot("03_door_open");
  const sBefore = await S();
  let v = await speak("Bea Old Tom plants seedlings soil misting roots leaves green light lamps fern tomato garden");
  const sAfter = await S();
  check("keyword salad is refused at the Kit door", /NOT A SENTENCE/.test(v), v);
  check("a refusal costs air and raises suspicion", sAfter.o2 < sBefore.o2 - 4 && sAfter.sus > sBefore.sus, `air ${sBefore.o2.toFixed(0)}->${sAfter.o2.toFixed(0)} sus ${sBefore.sus.toFixed(0)}->${sAfter.sus.toFixed(0)}`);
  v = await speak("Bea and Old Tom.");
  check("short answer is refused", /TOO SHORT/.test(v), v);
  await shot("04_door_refused");
  const kit = await openDoorAndAnswer("KIT", [
    "Oh, they are doing so well. Bea has a curl of new green, and Old Tom is reaching for the lamps again.",
    "I misted Bea this morning and she drank it right up. Old Tom is heavy with little tomatoes, I talk to him every day.",
    "Good morning, little ones. Bea is unfurling a new frond and Old Tom has three green tomatoes coming, I checked every root.",
  ], "KIT");
  check("genuine Kit imitation opens the seed vault", kit.opened, `${kit.tries} tries`);

  // ---------- 4. lift without kneeling: ECHO notices ----------
  await page.evaluate(() => { UI.closeOverlays(); Game.state.suspicion = 0; });
  await interact(`x.type === "lift"`);
  await page.waitForTimeout(400);
  const skipped = await page.evaluate(() => ({ noted: !!Game.state.skipNoted.hydro, sus: Game.state.suspicion, deck: Game.deck.src.id }));
  check("walking past a sleeper raises suspicion", skipped.noted && skipped.sus >= 9, JSON.stringify(skipped));
  await page.click("#deckOverlay").catch(() => {});

  // ---------- 5. med bay: distractor, then the right memory ----------
  await toDeck(2);
  await page.evaluate(() => { Game.state.suspicion = 0; Game.state.o2 = 100; });
  const okd = await openDoorAndAnswer("OKAFOR", [
    "Patient presents with insomnia again, crew wide, so I gave them all sleeping pills and told the patients to rest.",
  ], "OKAFOR distractor");
  const lastVerdict = await page.$eval("#doorVerdict", el => el.textContent);
  check("distractor memory is refused as a misread", !okd.opened && /MISREAD|WRONG VOICE/.test(lastVerdict), lastVerdict);
  const ok = await openDoorAndAnswer("OKAFOR", [
    "Patient presents with the usual insomnia, all five of them. I prescribed warm milk at 0100 and lights down early, which nobody followed.",
    "I told them warm milk before the sleep cycle and lights down by ten. Tired patients, stubborn patients, good people, every one.",
    "Patient notes, again. Warm milk, one cup, lights down. Second time this month I have written it, and I will write it a third.",
  ], "OKAFOR");
  check("genuine Okafor imitation opens the pharmacy", ok.opened, `${ok.tries} tries`);

  // ---------- 6. engineering: timer ----------
  await toDeck(3);
  await page.evaluate(() => { Game.state.suspicion = 0; Game.state.o2 = 100; Game.deck.entities.filter(x => x.type === "socket").forEach(setOpened); });
  await interact(`x.type === "echodoor" && x.persona === "CHO"`);
  await page.waitForTimeout(1500);
  const timerText = await page.$eval("#doorTimer", el => el.textContent);
  check("Cho door runs a reactor alarm timer", /REACTOR ALARM \d+s/.test(timerText), timerText);
  await shot("05_cho_timer");
  const cho = await openDoorAndAnswer("CHO", [
    "Hell, the second lever, always the second one! Easy, old girl, easy, I have got you, just hold on and sing for me.",
    "Second lever, both hands on it, and I keep talking to her like she is a scared animal, she always comes back to me.",
    "The second one, damn it, I grab the second lever and I hold on and I talk to her until she stops screaming.",
  ], "CHO");
  check("genuine Cho imitation opens the hatch before the alarm", cho.opened, `${cho.tries} tries`);

  // ---------- 7. bridge: held voice over three answers, then the captain ----------
  await toDeck(4);
  await page.evaluate(() => { UI.closeOverlays(); Game.state.suspicion = 0; Game.state.o2 = 100; });
  await interact(`x.type === "echodoor" && x.persona === "VEGA"`);
  await page.waitForTimeout(2000);
  const vegaAnswers = [
    ["Cassiel, the little blue ember off the port glass, she was the first friend I ever made out in the Reach.",
     "I named Cassiel first, a small blue ember drifting off the glass, and she kept me company through every long night."],
    ["Because she was awake when I was awake, burning quietly at 0300, and she never once asked me why I could not sleep.",
     "Because out of all the lightyears of dark she was the one that looked back, patient and bright, like an old friend waiting."],
    ["Goodbye, Cassiel. Drift well through all those lightyears, old friend, and keep the glass warm for whoever comes next.",
     "Goodbye, little ember. Keep burning out there in the Reach, and remember the navigator who talked to you at night."],
  ];
  let vegaOpened = false;
  for (let turn = 0; turn < 3 && !vegaOpened; turn++) {
    for (const a of vegaAnswers[turn]) {
      const cur = await page.evaluate(() => (Game.state.doorTurn || {})[entKey(Game.deck.entities.find(x => x.persona === "VEGA"))] || 0);
      if (cur !== turn) break;
      if (!(await page.evaluate(() => Game.overlayId === "doorOverlay"))) { await interact(`x.type === "echodoor" && x.persona === "VEGA"`); await page.waitForTimeout(1800); }
      const vv = await speak(a);
      console.log(`   VEGA turn ${turn + 1}: ${vv}`);
      await page.waitForTimeout(1500);
      vegaOpened = await page.evaluate(() => isOpened(Game.deck.entities.find(x => x.persona === "VEGA")));
      const now = await page.evaluate(() => (Game.state.doorTurn || {})[entKey(Game.deck.entities.find(x => x.persona === "VEGA"))] || 0);
      if (now > turn || vegaOpened) break;
    }
    if (turn === 1) await shot("06_vega_turns");
  }
  check("Vega chart room needs and accepts three held answers", vegaOpened);
  await page.evaluate(() => { UI.closeOverlays(); Game.state.suspicion = 0; Game.state.o2 = 100; });
  const wrongOrder = await openDoorAndAnswer("REYNE", ["Okafor first, then Aune, then Cho, then Vega. All accounted for, as the manifest states. Reyne out."], "REYNE wrong order");
  const wv = await page.$eval("#doorVerdict", el => el.textContent);
  check("wrong order of the sleepers is refused", !wrongOrder.opened && /WRONG ORDER|WRONG VOICE/.test(wv), wv);
  const rey = await openDoorAndAnswer("REYNE", [
    "Vega first, on the Bridge. Then Cho in Engineering. Then Aune in Hydroponics. Then Okafor. My crew. My watch. Reyne out.",
    "In order: Vega on day 390, Cho on day 392, Aune on day 394, Okafor on day 396. All accounted for. Reyne out.",
    "Casualty order, for the log. Vega. Cho. Aune. Okafor. I held the watch for every one of them. Reyne out.",
  ], "REYNE");
  check("captain's seal opens for the right order in Reyne's voice", rey.opened, `${rey.tries} tries`);

  // ---------- 8. lockout ----------
  await toDeck(2);
  await page.evaluate(() => { UI.closeOverlays(); Game.state.suspicion = 70; Game.state.o2 = 100; delete Game.state.doorLock; });
  // any unopened door will do; re-seal the pharmacy for the test
  await page.evaluate(() => { const e = Game.deck.entities.find(x => x.persona === "OKAFOR"); delete Game.state.opened[entKey(e)]; });
  await interact(`x.type === "echodoor" && x.persona === "OKAFOR"`);
  await page.waitForTimeout(1500);
  await page.fill("#doorInput", "please open the door for me now, I am just a visitor passing through here");
  await page.click("#doorSpeak");
  await page.waitForTimeout(5000);
  const lock = await page.evaluate(() => ({ overlay: Game.overlayId, locked: Object.values(Game.state.doorLock || {}).some(t => t > Date.now()) }));
  check("high suspicion locks the door and sends you away", lock.locked && lock.overlay !== "doorOverlay", JSON.stringify(lock));

  // ---------- 9. report ----------
  await page.evaluate(() => UI.closeOverlays());
  await page.click("#btnReport");
  await page.waitForTimeout(400);
  await shot("07_report");
  const codeStr = await page.$eval("#reportCode", el => el.value);
  let rep = null;
  try { rep = JSON.parse(Buffer.from(codeStr.replace(/^GITW2:/, ""), "base64").toString("utf8")); } catch (e) {}
  check("report code decodes to telemetry", rep && rep.build && rep.doors && rep.doors.KIT && rep.doors.KIT.attempts >= 3, rep ? `doors ${Object.keys(rep.doors).join(",")}, logs ${rep.logsRead}, keepsakes ${rep.keepsakes.length}` : codeStr.slice(0, 40));
  if (rep) fs.writeFileSync(__dirname + "/shots/iter2_report.json", JSON.stringify(rep, null, 1));
  await page.click("#reportClose");

  console.log("page errors:", errors.length ? errors.slice(0, 8) : "none");
  const failed = checks.filter(c => !c.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
  await browser.close();
  process.exit(failed.length || errors.length ? 1 : 0);
})();
