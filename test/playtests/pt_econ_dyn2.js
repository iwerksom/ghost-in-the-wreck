// Deck 3 full power-up + zero-trust finale completion
const { chromium } = require("playwright");
const log = (...a) => console.log(...a);
(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  page.on("pageerror", e => errs.push("PAGEERROR: " + e.message));
  await page.goto("file:///home/claude/ghostwreck/artifact.html");
  await page.waitForTimeout(3500);
  log("LM loaded:", await page.evaluate(() => LM.isLoaded));
  await page.click("#btnNew");
  for (let i = 0; i < 4; i++) { await page.click("#introOverlay"); await page.waitForTimeout(200); }
  await page.waitForTimeout(300);
  await page.click("#deckOverlay");
  await page.waitForTimeout(500);

  const snap = () => page.evaluate(() => ({
    deck: Game.deck.src.id, o2: Game.state.o2, cells: Game.state.cells, trust: Game.state.trust,
    opened: Object.keys(Game.state.opened),
  }));
  const tp = (x, y) => page.evaluate(([x, y]) => { Game.state.px = x * 32 + 16; Game.state.py = y * 32 + 16; }, [x, y]);
  const lastToast = () => page.evaluate(() => Game.toasts.length ? Game.toasts[Game.toasts.length - 1].text : null);
  const interactLabel = (label) => page.evaluate((label) => {
    const e = Game.deck.entities.find(x => x.label === label);
    if (!e) return "NOT FOUND";
    Game.state.px = e.x * 32 + 16; Game.state.py = (e.y + 1) * 32 + 16;
    Game.nearEntity = e; Game.onInteract(e);
    return e.label;
  }, label);

  // ---------- DECK 3 complete power-up ----------
  log("=== DECK 3 exact-cells completion ===");
  await page.evaluate(() => gotoDeck(3));
  await page.waitForTimeout(300);
  await page.click("#deckOverlay"); await page.waitForTimeout(300);
  // collect both cells via real pickup
  await tp(32, 4); await page.waitForTimeout(350);
  await tp(5, 18); await page.waitForTimeout(350);
  let s = await snap();
  log("cells collected:", s.cells, "(expect 2)");
  log(await interactLabel("Main Bus Socket A"), "toast:", await lastToast());
  log(await interactLabel("Main Bus Socket B"), "toast:", await lastToast());
  s = await snap();
  log("cells after both sockets:", s.cells, "opened:", s.opened);
  // lift still needs voice hatch
  log(await interactLabel("Lift : Bridge"), "toast:", await lastToast());
  s = await snap(); log("deck now:", s.deck, "(expect eng)");
  await page.evaluate(() => { const e = Game.deck.entities.find(x => x.type === "echodoor"); setOpened(e); });
  await interactLabel("Lift : Bridge");
  await page.waitForTimeout(500);
  s = await snap();
  log("deck after hatch opened:", s.deck, "(expect bridge)");
  await page.click("#deckOverlay"); await page.waitForTimeout(300);

  // ---------- DECK 4 lift gating ----------
  log("=== DECK 4 lift gating ===");
  log(await interactLabel("Descent : The Core"), "toast:", await lastToast());
  s = await snap(); log("deck:", s.deck, "(expect bridge, locked)");
  // open the WRONG echodoor (Chart Room, opens:'chartroom') and confirm the lift stays locked
  await page.evaluate(() => { const e = Game.deck.entities.find(x => x.type === "echodoor" && x.opens === "chartroom"); setOpened(e); });
  await interactLabel("Descent : The Core");
  await page.waitForTimeout(300);
  s = await snap(); log("after chartroom door only, deck:", s.deck, "(expect bridge still)", "toast:", await lastToast());
  await page.evaluate(() => { const e = Game.deck.entities.find(x => x.type === "echodoor" && x.opens === "lift"); setOpened(e); });
  await interactLabel("Descent : The Core");
  await page.waitForTimeout(500);
  s = await snap(); log("after Captain's Seal, deck:", s.deck, "(expect core)");
  await page.click("#deckOverlay"); await page.waitForTimeout(300);

  // ---------- DECK 5 zero-trust finale ----------
  log("=== DECK 5 finale with trust = 0 ===");
  await page.evaluate(() => { Game.state.trust = 0; saveState(); });
  // hangar before finale
  log("hangar:", await interactLabel("Hangar Access"), "toast:", await lastToast());
  // altar
  await interactLabel("ECHO");
  await page.waitForTimeout(3000);
  const answers = ["I came to find a way home.", "Mara Reyne.", "Let them rest now. The watch is over."];
  for (let i = 0; i < 3; i++) {
    // wait for input to be ready
    await page.waitForFunction(() => document.getElementById("finaleQ").textContent.length > 20, { timeout: 30000 });
    await page.waitForTimeout(1000);
    await page.fill("#finaleInput", answers[i]);
    await page.click("#finaleSpeak");
    log("answered Q" + (i + 1) + ":", answers[i]);
    // wait for reply generation and next step
    await page.waitForTimeout(12000);
    const st = await page.evaluate(() => ({
      step: document.getElementById("finaleStep").textContent,
      reply: document.getElementById("finaleReply").textContent.slice(0, 120),
      trust: Game.state.trust,
      ending: !!Game.state.ended,
    }));
    log("  state:", JSON.stringify(st));
    if (st.ending) break;
  }
  // wait for ending overlay
  await page.waitForFunction(() => document.getElementById("endingOverlay").classList.contains("show"), { timeout: 30000 });
  await page.waitForTimeout(9000);
  const end = await page.evaluate(() => ({
    title: document.getElementById("endingTitle").textContent,
    ended: Game.state.ended, trust: Game.state.trust,
    stats: document.getElementById("endingStats").textContent,
  }));
  log("ENDING:", JSON.stringify(end));
  await page.screenshot({ path: "shots/pt_econ_ending.png" });
  log("ERRORS:", JSON.stringify(errs));
  await browser.close();
})().catch(e => { console.error("FATAL", e); process.exit(1); });
