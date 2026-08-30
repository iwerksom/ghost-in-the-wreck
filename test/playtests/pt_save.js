// Save/continue integrity playtest
const { chromium } = require("playwright");
const fs = require("fs");
const SHOTS = "/home/claude/ghostwreck/test/shots";
const log = (...a) => console.log("[PT]", ...a);

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on("pageerror", e => { errors.push("PAGEERROR: " + e.message); console.log("PAGEERROR:", e.message); });
  page.on("console", m => { if (m.type() === "error") { errors.push("CONSOLE: " + m.text()); console.log("CONSOLEERR:", m.text()); } });

  const gotoGame = async () => {
    await page.goto("file:///home/claude/ghostwreck/artifact.html");
    await page.waitForFunction(() => typeof LM !== "undefined" && LM.isLoaded, null, { timeout: 180000 });
  };
  const dismissDeckOverlay = async () => {
    await page.waitForSelector("#deckOverlay.show", { timeout: 15000 });
    await page.waitForTimeout(400);
    await page.click("#deckOverlay");
    await page.waitForTimeout(600);
  };
  const snap = async (name) => { await page.screenshot({ path: `${SHOTS}/pt_save_${name}.png` }); };
  const getState = () => page.evaluate(() => ({
    deckIdx: Game.state.deckIdx, px: Game.state.px, py: Game.state.py,
    o2: Game.state.o2, cells: Game.state.cells, trust: Game.state.trust,
    opened: Object.keys(Game.state.opened).sort(),
    collected: Object.keys(Game.state.collected).sort(),
    journalLen: Game.state.journal.length,
    journalTitles: Game.state.journal.map(j => j.title),
    seed: Game.state.seed, ended: Game.state.ended,
    visited: Object.keys(Game.state.visited).sort(),
    spawn: { x: Game.deck.spawn.x * 32 + 16, y: Game.deck.spawn.y * 32 + 16 },
    saveInLS: !!localStorage.getItem("gitw_save"),
  }));

  // ============================ STAGE A: new game + progress ============================
  log("STAGE A: boot + new game");
  await gotoGame();
  log("LM loaded");
  await page.click("#btnNew");
  for (let i = 0; i < 4; i++) { await page.waitForTimeout(700); await page.click("#introOverlay"); }
  await page.waitForTimeout(500);
  // could need one extra click if typing timing differs
  const introStill = await page.evaluate(() => document.querySelector("#introOverlay").classList.contains("show"));
  if (introStill) { await page.click("#introOverlay"); await page.waitForTimeout(500); }
  await dismissDeckOverlay();
  await page.waitForTimeout(3500); // let FIRST_CONTACT subtitles start
  await snap("a_deck0");

  // collect all o2 + cells on deck 0 by teleporting onto them
  const nPickups = await page.evaluate(() => Game.deck.entities.filter(e => e.type === "o2" || e.type === "cell").length);
  log("deck0 pickups available:", nPickups);
  for (let i = 0; i < nPickups; i++) {
    await page.evaluate((idx) => {
      const list = Game.deck.entities.filter(e => e.type === "o2" || e.type === "cell");
      const e = list[idx];
      Game.state.px = e.x * 32 + 16; Game.state.py = e.y * 32 + 16;
    }, i);
    await page.waitForTimeout(400);
  }
  let s = await getState();
  log("after pickups: cells=", s.cells, "collected=", s.collected.length);

  // kneel at body (trust +1)
  const hasBody = await page.evaluate(() => {
    const e = Game.deck.entities.find(x => x.type === "body");
    if (!e) return false;
    Game.state.px = e.x * 32 + 16; Game.state.py = (e.y + 1) * 32 + 16;
    Game.nearEntity = e; Game.onInteract(e); return true;
  });
  if (hasBody) { await page.waitForTimeout(2500); await page.click("#noteClose"); await page.waitForTimeout(300); }
  log("knelt at body:", hasBody);

  // read 2 logs at a terminal
  await page.evaluate(() => {
    const e = Game.deck.entities.find(x => x.type === "terminal");
    Game.state.px = e.x * 32 + 16; Game.state.py = (e.y + 1) * 32 + 16;
    Game.nearEntity = e; Game.onInteract(e);
  });
  // wait for first read to finish (btn re-enabled)
  await page.waitForFunction(() => !document.getElementById("termBtnRead").disabled, null, { timeout: 60000 });
  await page.waitForTimeout(400);
  await page.click("#termBtnRead");
  await page.waitForTimeout(1000);
  await page.waitForFunction(() => !document.getElementById("termBtnRead").disabled, null, { timeout: 60000 });
  await page.click("#termClose");
  await page.waitForTimeout(300);
  s = await getState();
  log("after 2 log reads: journalLen=", s.journalLen, "trust=", s.trust);
  await snap("a_after_logs");

  // power the socket (opens dock lift)
  const socketRes = await page.evaluate(() => {
    const e = Game.deck.entities.find(x => x.type === "socket");
    if (!e) return "no socket";
    Game.state.px = e.x * 32 + 16; Game.state.py = (e.y + 1) * 32 + 16;
    Game.nearEntity = e; Game.onInteract(e);
    const k = Game.deck.src.id + ":" + e.ch + ":" + e.x + "," + e.y;
    return { opened: !!Game.state.opened[k], cells: Game.state.cells };
  });
  log("socket:", JSON.stringify(socketRes));

  // take the lift to deck 1
  const liftRes = await page.evaluate(() => {
    const e = Game.deck.entities.find(x => x.type === "lift");
    if (!e) return "no lift";
    Game.state.px = e.x * 32 + 16; Game.state.py = (e.y + 1) * 32 + 16;
    Game.nearEntity = e; Game.onInteract(e);
    return { unlocked: typeof liftUnlocked === "function" ? liftUnlocked(e) : "?", deckIdx: Game.state.deckIdx };
  });
  log("lift:", JSON.stringify(liftRes));
  await dismissDeckOverlay();
  const pre = await getState();
  log("PRE-RELOAD STATE:", JSON.stringify(pre, null, 1));
  await snap("a_deck1_pre_reload");

  // ============================ STAGE B: reload + continue ============================
  log("STAGE B: reload mid-game + CONTINUE");
  await page.reload();
  await page.waitForFunction(() => typeof LM !== "undefined" && LM.isLoaded, null, { timeout: 180000 });
  await page.waitForTimeout(500);
  const contVisible = await page.evaluate(() => document.getElementById("btnContinue").style.display);
  log("CONTINUE button display:", contVisible);
  await snap("b_title_after_reload");
  await page.click("#btnContinue");
  await dismissDeckOverlay();
  const post = await getState();
  log("POST-RELOAD STATE:", JSON.stringify(post, null, 1));
  await snap("b_after_continue");

  const diffs = [];
  for (const k of ["deckIdx", "cells", "trust", "journalLen", "seed", "ended"]) {
    if (JSON.stringify(pre[k]) !== JSON.stringify(post[k])) diffs.push(`${k}: ${JSON.stringify(pre[k])} -> ${JSON.stringify(post[k])}`);
  }
  for (const k of ["opened", "collected", "journalTitles", "visited"]) {
    if (JSON.stringify(pre[k]) !== JSON.stringify(post[k])) diffs.push(`${k}: ${JSON.stringify(pre[k])} -> ${JSON.stringify(post[k])}`);
  }
  log("STATE DIFFS after continue:", diffs.length ? diffs.join(" | ") : "none");
  log("spawn check: px/py=", post.px, post.py, "expected spawn=", post.spawn.x, post.spawn.y,
      "match=", post.px === post.spawn.x && post.py === post.spawn.y);

  // duplicate pickup test: go back to deck 0, stand on a collected pickup tile
  const dup = await page.evaluate(async () => {
    gotoDeck(0);
    return { deckIdx: Game.state.deckIdx };
  });
  await dismissDeckOverlay();
  const dupTest = await page.evaluate(() => {
    const before = { cells: Game.state.cells, o2: Game.state.o2, nCollected: Object.keys(Game.state.collected).length };
    const e = Game.deck.entities.find(x => (x.type === "cell" || x.type === "o2") && Game.state.collected[Game.deck.src.id + ":" + x.ch + ":" + x.x + "," + x.y]);
    if (!e) return { err: "no collected entity found on deck0" };
    Game.state.px = e.x * 32 + 16; Game.state.py = e.y * 32 + 16;
    return { before, ent: e.type };
  });
  await page.waitForTimeout(800);
  const dupAfter = await page.evaluate(() => ({ cells: Game.state.cells, nCollected: Object.keys(Game.state.collected).length }));
  log("dup pickup test:", JSON.stringify(dupTest), "after:", JSON.stringify(dupAfter));

  // socket still opened / lift still unlocked after reload?
  const persist = await page.evaluate(() => {
    const sock = Game.deck.entities.find(x => x.type === "socket");
    const lift = Game.deck.entities.find(x => x.type === "lift");
    return { socketOpened: sock ? isOpened(sock) : null, liftUnlocked: lift ? liftUnlocked(lift) : null };
  });
  log("persistence on deck0:", JSON.stringify(persist));

  // ============================ STAGE C: reload with terminal overlay open ============================
  log("STAGE C: reload while terminal overlay open (mid-generation)");
  await page.evaluate(() => {
    const e = Game.deck.entities.find(x => x.type === "terminal");
    Game.state.px = e.x * 32 + 16; Game.state.py = (e.y + 1) * 32 + 16;
    Game.nearEntity = e; Game.onInteract(e);
  });
  await page.waitForTimeout(1500); // mid-generation
  const preTermReload = await getState();
  await snap("c_terminal_open");
  await page.reload();
  await page.waitForFunction(() => typeof LM !== "undefined" && LM.isLoaded, null, { timeout: 180000 });
  await page.waitForTimeout(500);
  await page.click("#btnContinue");
  await dismissDeckOverlay();
  const postTermReload = await getState();
  const overlayState = await page.evaluate(() => ({
    anyOverlay: !!document.querySelector(".overlay.show"),
    overlayId: (document.querySelector(".overlay.show") || {}).id || null,
    paused: Game.paused, overlayOpen: Game.overlayOpen,
  }));
  log("after terminal-open reload: overlay=", JSON.stringify(overlayState),
      "journalLen", preTermReload.journalLen, "->", postTermReload.journalLen,
      "trust", preTermReload.trust, "->", postTermReload.trust);
  // can we still interact / move?
  const canPlay = await page.evaluate(() => {
    const e = Game.deck.entities.find(x => x.type === "terminal");
    Game.state.px = e.x * 32 + 16; Game.state.py = (e.y + 1) * 32 + 16;
    Game.nearEntity = e; Game.onInteract(e);
    return !!document.querySelector("#termOverlay.show");
  });
  log("terminal reopens after that reload:", canPlay);
  await page.waitForFunction(() => !document.getElementById("termBtnRead").disabled, null, { timeout: 60000 }).catch(() => log("WARN: term read never finished"));
  await page.click("#termClose");
  await snap("c_after");

  fs.writeFileSync("/home/claude/ghostwreck/test/pt_save_stageABC.json", JSON.stringify({ pre, post, diffs, dupTest, dupAfter, persist, overlayState, errors }, null, 2));
  log("errors so far:", errors.length);
  await browser.close();
})().catch(e => { console.error("FATAL", e); process.exit(1); });
