// Dynamic survival-economy tests: pickups, sockets, hazard, garden, death/respawn, lift gating
const { chromium } = require("playwright");
const log = (...a) => console.log(...a);
(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  page.on("pageerror", e => errs.push("PAGEERROR: " + e.message));
  await page.goto("file:///home/claude/ghostwreck/artifact.html");
  await page.waitForTimeout(3500);
  await page.click("#btnNew");
  for (let i = 0; i < 4; i++) { await page.click("#introOverlay"); await page.waitForTimeout(200); }
  await page.waitForTimeout(300);
  await page.click("#deckOverlay");
  await page.waitForTimeout(2500); // let first-contact subtitles play a bit

  const snap = () => page.evaluate(() => ({
    deck: Game.deck.src.id, o2: Game.state.o2, cells: Game.state.cells, trust: Game.state.trust,
    opened: Object.keys(Game.state.opened), collected: Object.keys(Game.state.collected),
    px: Game.state.px, py: Game.state.py, paused: Game.paused, overlayOpen: Game.overlayOpen,
  }));
  const tp = (x, y) => page.evaluate(([x, y]) => { Game.state.px = x * 32 + 16; Game.state.py = y * 32 + 16; }, [x, y]);
  const lastToast = () => page.evaluate(() => Game.toasts.length ? Game.toasts[Game.toasts.length - 1].text : null);
  const interactNear = (pred) => page.evaluate((predSrc) => {
    const pred = eval(predSrc);
    const e = Game.deck.entities.find(pred);
    if (!e) return "NOT FOUND";
    Game.state.px = e.x * 32 + 16; Game.state.py = (e.y + 1) * 32 + 16;
    Game.nearEntity = e; Game.onInteract(e);
    return e.label || e.type;
  }, pred);

  // ---------- DECK 0: socket with no cell / lift locked / pickup / power / double-use ----------
  log("=== DECK 0 ===");
  log("socket w/ 0 cells:", await interactNear("e => e.type==='socket'"), "| toast:", await lastToast());
  log("lift locked:", await interactNear("e => e.type==='lift'"), "| toast:", await lastToast());
  let s = await snap();
  log("still on deck:", s.deck, "cells:", s.cells);
  // pick up the cell via real pickup path (stand on it)
  await tp(5, 10); await page.waitForTimeout(400);
  s = await snap();
  log("after standing on P: cells =", s.cells, "collected:", s.collected.length);
  const o2Before = s.o2;
  // pick up o2 canister at (14,15) with lowered o2 to see +45
  await page.evaluate(() => { Game.state.o2 = 40; });
  await tp(14, 15); await page.waitForTimeout(400);
  s = await snap();
  log("o2 pickup: 40 ->", s.o2.toFixed(1), "(expect ~85)");
  // use socket
  log("socket w/ 1 cell:", await interactNear("e => e.type==='socket'"), "| toast:", await lastToast());
  s = await snap();
  log("cells after socket:", s.cells, "opened:", s.opened);
  // give a spare cell and try socket again (should NOT consume)
  await page.evaluate(() => { Game.state.cells = 1; });
  await interactNear("e => e.type==='socket'");
  s = await snap();
  log("double-use socket: cells =", s.cells, "(expect 1) toast:", await lastToast());
  await page.evaluate(() => { Game.state.cells = 0; });
  // lift should now work
  await interactNear("e => e.type==='lift'");
  await page.waitForTimeout(600);
  s = await snap();
  log("lift ->", s.deck, "o2 topped to:", s.o2.toFixed(1));
  await page.click("#deckOverlay"); await page.waitForTimeout(300);

  // ---------- DECK 1: garden regen ----------
  log("=== DECK 1 garden ===");
  const g = await page.evaluate(() => {
    for (let y = 0; y < Game.deck.h; y++) for (let x = 0; x < Game.deck.w; x++)
      if (Game.deck.grid[y][x] === 4) return { x, y };
    return null;
  });
  await tp(g.x, g.y);
  await page.evaluate(() => { Game.state.o2 = 50; });
  await page.waitForTimeout(3000);
  s = await snap();
  log(`garden 3s: 50 -> ${s.o2.toFixed(1)} (expect ~+7.8, i.e. ~57.8)`);
  // plain floor drain for contrast
  await tp(5, 4);
  await page.evaluate(() => { Game.state.o2 = 50; });
  await page.waitForTimeout(3000);
  s = await snap();
  log(`floor 3s: 50 -> ${s.o2.toFixed(1)} (expect ~48.2)`);
  // garden cap at 100
  await tp(g.x, g.y);
  await page.evaluate(() => { Game.state.o2 = 99; });
  await page.waitForTimeout(1500);
  s = await snap();
  log("garden cap:", s.o2.toFixed(1), "(expect 100)");

  // ---------- DECK 3: hazard drain + shake, death, respawn ----------
  log("=== DECK 3 hazard/death ===");
  await page.evaluate(() => gotoDeck(3));
  await page.waitForTimeout(300);
  await page.click("#deckOverlay"); await page.waitForTimeout(300);
  const h = await page.evaluate(() => {
    for (let y = 0; y < Game.deck.h; y++) for (let x = 0; x < Game.deck.w; x++)
      if (Game.deck.grid[y][x] === 5) return { x, y };
    return null;
  });
  await tp(h.x, h.y);
  await page.evaluate(() => { Game.state.o2 = 60; });
  await page.waitForTimeout(2000);
  const hz = await page.evaluate(() => ({ o2: Game.state.o2, shake: Game.shakeT }));
  log(`hazard 2s: 60 -> ${hz.o2.toFixed(1)} (expect ~40.8), shakeT: ${hz.shake} (expect >0)`);
  // collect a cell + open a socket first so we can verify persistence through death
  await tp(5, 12); await page.waitForTimeout(300); // o2 canister
  await page.evaluate(() => { // walk to cell at 5,18 directly
    Game.state.px = 5 * 32 + 16; Game.state.py = 18 * 32 + 16;
  });
  await page.waitForTimeout(400);
  log("socket A insert:", await interactNear("e => e.type==='socket' && e.label.includes('A')"), "| toast:", await lastToast());
  s = await snap();
  const openedBefore = s.opened.slice(), collectedBefore = s.collected.slice(), trustBefore = s.trust;
  log("pre-death: cells", s.cells, "opened", openedBefore, "collected#", collectedBefore.length);
  // die on the hazard tile
  await tp(h.x, h.y);
  await page.evaluate(() => { Game.state.o2 = 2; });
  await page.waitForTimeout(3500); // drain to 0 + 1.4s overlay delay
  const deathVisible = await page.evaluate(() => document.getElementById("deathOverlay").classList.contains("show"));
  log("death overlay visible:", deathVisible);
  await page.screenshot({ path: "shots/pt_econ_death.png" });
  await page.waitForTimeout(4500); // let the death text finish typing
  await page.click("#deathWake");
  await page.waitForTimeout(500);
  s = await snap();
  const atSpawn = await page.evaluate(() => Game.state.px === Game.deck.spawn.x * 32 + 16 && Game.state.py === Game.deck.spawn.y * 32 + 16);
  log("after WAKE: deck", s.deck, "o2", s.o2.toFixed(1), "atSpawn:", atSpawn,
      "opened kept:", JSON.stringify(s.opened) === JSON.stringify(openedBefore),
      "collected kept:", s.collected.length === collectedBefore.length,
      "cells:", s.cells, "trust:", s.trust === trustBefore);
  const deathGone = await page.evaluate(() => !document.getElementById("deathOverlay").classList.contains("show"));
  log("death overlay dismissed:", deathGone, "overlayOpen:", s.overlayOpen, "paused:", s.paused);

  // ---------- DECK 3 lift gating: echodoor+power ----------
  log("=== DECK 3 lift gating ===");
  // grab second cell (behind auto-door at row 4)
  await tp(31, 4); await page.waitForTimeout(200);
  await tp(32, 4); await page.waitForTimeout(400);
  s = await snap();
  log("cells after 2nd pickup:", s.cells);
  log("lift w/ 1 socket, no hatch:", await interactNear("e => e.type==='lift'"), "| toast:", await lastToast());
  s = await snap(); log("still deck:", s.deck);
  log("socket B insert:", await interactNear("e => e.type==='socket' && e.label.includes('B')"), "| toast:", await lastToast());
  log("lift w/ both sockets, no hatch:", await interactNear("e => e.type==='lift'"), "| toast:", await lastToast());
  s = await snap(); log("still deck:", s.deck, "cells:", s.cells);
  // open the echodoor via state (voice system is another tester's area)
  await page.evaluate(() => { const e = Game.deck.entities.find(x => x.type === "echodoor"); setOpened(e); });
  await interactNear("e => e.type==='lift'");
  await page.waitForTimeout(500);
  s = await snap();
  log("lift after hatch+power ->", s.deck);
  await page.click("#deckOverlay").catch(() => {});
  await page.waitForTimeout(300);

  log("ERRORS:", JSON.stringify(errs));
  await browser.close();
})().catch(e => { console.error("FATAL", e); process.exit(1); });
