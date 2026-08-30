// Stage D: finale mid-question reload + ending + NEW GAME reset
const { chromium } = require("playwright");
const SHOTS = "/home/claude/ghostwreck/test/shots";
const log = (...a) => console.log("[PT]", ...a);

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on("pageerror", e => { errors.push("PAGEERROR: " + e.message); console.log("PAGEERROR:", e.message); });
  page.on("console", m => { if (m.type() === "error") console.log("CONSOLEERR:", m.text()); });
  page.on("requestfailed", r => console.log("REQFAILED:", r.url().slice(0, 120), r.failure() && r.failure().errorText));

  const waitLM = () => page.waitForFunction(() => typeof LM !== "undefined" && LM.isLoaded, null, { timeout: 180000 });
  const dismissDeck = async () => {
    await page.waitForSelector("#deckOverlay.show", { timeout: 15000 });
    await page.waitForTimeout(400);
    await page.click("#deckOverlay");
    await page.waitForTimeout(500);
  };
  const snap = n => page.screenshot({ path: `${SHOTS}/pt_save_${n}.png` });

  await page.goto("file:///home/claude/ghostwreck/artifact.html");
  await waitLM();
  await page.click("#btnNew");
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(600);
    const still = await page.evaluate(() => document.querySelector("#introOverlay").classList.contains("show"));
    if (!still) break;
    await page.click("#introOverlay");
  }
  await dismissDeck();
  await page.waitForTimeout(1000);

  // make some real progress: read one log on deck 0 (journal+trust)
  await page.evaluate(() => {
    const e = Game.deck.entities.find(x => x.type === "terminal");
    Game.state.px = e.x * 32 + 16; Game.state.py = (e.y + 1) * 32 + 16;
    Game.nearEntity = e; Game.onInteract(e);
  });
  await page.waitForFunction(() => !document.getElementById("termBtnRead").disabled, null, { timeout: 60000 });
  await page.click("#termClose");
  await page.waitForTimeout(300);

  // jump to the core
  await page.evaluate(() => gotoDeck(5));
  await dismissDeck();
  const pre = await page.evaluate(() => ({ trust: Game.state.trust, journalLen: Game.state.journal.length, seed: Game.state.seed }));
  log("pre-finale:", JSON.stringify(pre));

  const interactAltar = () => page.evaluate(() => {
    const e = Game.deck.entities.find(x => x.type === "corealtar");
    Game.state.px = e.x * 32 + 16; Game.state.py = (e.y + 1) * 32 + 16;
    Game.nearEntity = e; Game.onInteract(e);
  });
  const answer = async (text, expectStep) => {
    await page.waitForFunction(() => !document.getElementById("finaleSpeak").disabled, null, { timeout: 30000 });
    await page.fill("#finaleInput", text);
    await page.click("#finaleSpeak");
    if (expectStep) {
      await page.waitForFunction(s => document.getElementById("finaleStep").textContent.includes(s), expectStep, { timeout: 90000 });
    }
  };

  // --- mid-finale reload ---
  log("STAGE D1: reload mid-finale (during question 2)");
  await interactAltar();
  await page.waitForSelector("#finaleOverlay.show", { timeout: 10000 });
  await snap("d_finale_q1");
  await answer("I came to bring you home. I heard the beacon and I could not leave you alone.", "2 / 3");
  await page.waitForTimeout(1200); // mid question 2 typing
  await snap("d_finale_q2_mid");
  const midTrust = await page.evaluate(() => Game.state.trust);
  log("trust after Q1 (pre-reload):", midTrust);

  await page.reload();
  await waitLM();
  await page.click("#btnContinue");
  await dismissDeck();
  const afterMid = await page.evaluate(() => ({
    deckIdx: Game.state.deckIdx, trust: Game.state.trust, ended: Game.state.ended,
    journalLen: Game.state.journal.length,
    overlay: (document.querySelector(".overlay.show") || {}).id || null,
    atSpawn: Game.state.px === Game.deck.spawn.x * 32 + 16 && Game.state.py === Game.deck.spawn.y * 32 + 16,
  }));
  log("after mid-finale reload+continue:", JSON.stringify(afterMid));
  await snap("d_after_midfinale_reload");

  // finale restarts cleanly?
  await interactAltar();
  await page.waitForSelector("#finaleOverlay.show", { timeout: 10000 });
  const stepTxt = await page.evaluate(() => document.getElementById("finaleStep").textContent);
  log("finale restarted at:", stepTxt);

  // --- complete the finale ---
  log("STAGE D2: complete finale");
  await answer("I came because the beacon called and someone should answer.", "2 / 3");
  await answer("Reyne. I say it kindly, the way a friend would.", "3 / 3");
  await answer("Let them rest. You have kept them long enough. Release the watch and sleep.", null);
  await page.waitForSelector("#endingOverlay.show", { timeout: 120000 });
  await page.waitForFunction(() => document.getElementById("endingStats").textContent.length > 0, null, { timeout: 180000 });
  const endedState = await page.evaluate(() => ({
    ended: Game.state.ended, seed: Game.state.seed, trust: Game.state.trust,
    journalLen: Game.state.journal.length,
    saved: JSON.parse(localStorage.getItem("gitw_save") || "{}").ended || null,
    title: document.getElementById("endingTitle").textContent,
    stats: document.getElementById("endingStats").textContent,
  }));
  log("ending reached:", JSON.stringify(endedState));
  await snap("d_ending");

  // --- reload after ending, before clicking anything ---
  log("STAGE D3: reload while ending overlay shown, then continue");
  await page.reload();
  await waitLM();
  const contShown = await page.evaluate(() => document.getElementById("btnContinue").style.display);
  await page.click("#btnContinue");
  await dismissDeck();
  const afterEndReload = await page.evaluate(() => ({ deckIdx: Game.state.deckIdx, ended: Game.state.ended }));
  log("continue after ended save:", JSON.stringify(afterEndReload), "contBtn:", contShown);
  // altar should replay the ending
  await interactAltar();
  const replayShown = await page.waitForSelector("#endingOverlay.show", { timeout: 15000 }).then(() => true).catch(() => false);
  log("altar replays ending:", replayShown);
  await page.waitForFunction(() => document.getElementById("endingStats").textContent.length > 0, null, { timeout: 180000 });
  await snap("d_ending_replay");

  // --- NEW GAME from ending overlay ---
  log("STAGE D4: NEW GAME after ending");
  await page.click("#endingNew");
  await page.waitForTimeout(800);
  const fresh = await page.evaluate(() => ({
    trust: Game.state.trust, journalLen: Game.state.journal.length,
    cells: Game.state.cells, seed: Game.state.seed, ended: Game.state.ended,
    opened: Object.keys(Game.state.opened).length, collected: Object.keys(Game.state.collected).length,
    visited: Object.keys(Game.state.visited).length, deckIdx: Game.state.deckIdx,
    lsSave: localStorage.getItem("gitw_save"),
    overlay: (document.querySelector(".overlay.show") || {}).id || null,
  }));
  log("after NEW GAME:", JSON.stringify({ ...fresh, lsSave: fresh.lsSave ? "present" : null }));
  log("seed changed:", fresh.seed !== endedState.seed, `(old ${endedState.seed} new ${fresh.seed})`);
  await snap("d_newgame_intro");

  // play the fresh intro through to confirm a clean new run boots
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(600);
    const still = await page.evaluate(() => document.querySelector("#introOverlay").classList.contains("show"));
    if (!still) break;
    await page.click("#introOverlay");
  }
  await dismissDeck();
  const boot2 = await page.evaluate(() => ({ deckIdx: Game.state.deckIdx, trust: Game.state.trust, journalLen: Game.state.journal.length, saveNow: !!localStorage.getItem("gitw_save") }));
  log("fresh run in play:", JSON.stringify(boot2));
  await snap("d_fresh_run");
  log("page errors:", errors.length ? errors : "none");
  await browser.close();
})().catch(e => { console.error("FATAL", e); process.exit(1); });
