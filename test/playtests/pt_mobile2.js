// Mobile follow-up: touch scrolling inside panels, corner artifact, interact tap on live entity path
const { chromium } = require("playwright");
const log = (...a) => console.log("[PT2]", ...a);
const SHOT = "/home/claude/ghostwreck/test/shots";

(async () => {
  const browser = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    args: ["--no-sandbox"],
  });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 730 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  page.on("pageerror", e => log("PAGEERROR:", e.message));
  await page.goto("file:///home/claude/ghostwreck/artifact.html");
  await page.waitForFunction(() => typeof LM !== "undefined" && LM.isLoaded, null, { timeout: 180000 });
  await page.waitForTimeout(1000);

  // 1) identify bottom-right corner element on title screen
  const corner = await page.evaluate(() => {
    const pts = [[380, 710], [370, 700], [385, 725]];
    return pts.map(([x, y]) => {
      const el = document.elementFromPoint(x, y);
      return el ? { x, y, tag: el.tagName, id: el.id, cls: el.className, text: (el.textContent || "").slice(0, 30) } : { x, y, el: null };
    });
  });
  log("corner elements:", JSON.stringify(corner, null, 1));

  // 2) touch-scroll test in ABOUT panel
  await page.tap("#btnAbout");
  await page.waitForTimeout(600);
  const cdp = await ctx.newCDPSession(page);
  const before = await page.evaluate(() => document.querySelector("#aboutOverlay .panel").scrollTop);
  // drag upward (finger moves up => content scrolls down)
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 195, y: 500, id: 1 }] });
  for (let i = 1; i <= 8; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 195, y: 500 - i * 40, id: 1 }] });
    await page.waitForTimeout(30);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(600);
  const after = await page.evaluate(() => document.querySelector("#aboutOverlay .panel").scrollTop);
  log("about panel scrollTop before/after touch drag:", before, "->", after, after > before ? "SCROLLS OK" : "*** DOES NOT SCROLL ***");
  await page.screenshot({ path: SHOT + "/pt_mobile_20_about_scrolled.png" });

  // can we reach the probe input by touch scroll only?
  const probeVisible = await page.evaluate(() => {
    const b = document.getElementById("probeInput").getBoundingClientRect();
    return { y: b.y, inView: b.y >= 0 && b.y + b.height <= window.innerHeight };
  });
  log("probeInput after scroll:", JSON.stringify(probeVisible));
  await page.tap("#aboutClose");
  await page.waitForTimeout(300);

  // 3) start game quickly and test ending box scroll via forced ending
  await page.tap("#btnNew");
  await page.waitForTimeout(800);
  for (let i = 0; i < 4; i++) { await page.tap("#introOverlay"); await page.waitForTimeout(500); }
  await page.evaluate(() => { const d = document.getElementById("deckOverlay"); if (d.classList.contains("show")) d.click(); });
  await page.waitForTimeout(400);

  // walk finale fast: teleport to corealtar and run finale with short answers
  await page.evaluate(() => {
    gotoDeck(5);
    const d = document.getElementById("deckOverlay"); if (d.classList.contains("show")) d.click();
    const e = Game.deck.entities.find(x => x.type === "corealtar");
    Game.state.px = e.x * 32 + 16; Game.state.py = (e.y + 1) * 32 + 16;
    Game.nearEntity = e; Game.onInteract(e);
  });
  await page.waitForTimeout(3500);
  const answers = ["I came to find what was left", "Sona", "rest now, sleep, let go"];
  for (let i = 0; i < 3; i++) {
    try { await page.waitForFunction(() => !document.getElementById("finaleSpeak").disabled, null, { timeout: 25000 }); } catch (e) { log("finale stuck"); }
    await page.fill("#finaleInput", answers[i]);
    await page.tap("#finaleSpeak");
    await page.waitForTimeout(11000);
  }
  try {
    await page.waitForFunction(() => document.getElementById("endingOverlay").classList.contains("show"), null, { timeout: 30000 });
  } catch (e) { log("no ending overlay"); }
  await page.waitForTimeout(9000); // let text finish typing
  const eb0 = await page.evaluate(() => {
    const b = document.querySelector("#endingOverlay .endingbox");
    return { scrollTop: b.scrollTop, scrollH: b.scrollHeight, clientH: b.clientHeight };
  });
  log("endingbox metrics:", JSON.stringify(eb0));
  await page.screenshot({ path: SHOT + "/pt_mobile_21_ending2.png" });
  if (eb0.scrollH > eb0.clientH) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 195, y: 500, id: 1 }] });
    for (let i = 1; i <= 8; i++) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 195, y: 500 - i * 40, id: 1 }] });
      await page.waitForTimeout(30);
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.waitForTimeout(600);
    const eb1 = await page.evaluate(() => document.querySelector("#endingOverlay .endingbox").scrollTop);
    log("endingbox scrollTop after touch drag:", eb0.scrollTop, "->", eb1, eb1 > eb0.scrollTop ? "SCROLLS OK" : "*** DOES NOT SCROLL ***");
    await page.screenshot({ path: SHOT + "/pt_mobile_22_ending_scrolled.png" });
    // is TITLE btn now reachable/tappable?
    const tb = await page.evaluate(() => {
      const b = document.getElementById("endingTitleBtn").getBoundingClientRect();
      return { y: +b.y.toFixed(0), bot: +(b.y + b.height).toFixed(0), inView: b.y >= 0 && b.y + b.height <= window.innerHeight };
    });
    log("endingTitleBtn after scroll:", JSON.stringify(tb));
    if (tb.inView) {
      await page.tap("#endingTitleBtn");
      await page.waitForTimeout(800);
      const backToTitle = await page.evaluate(() => document.getElementById("titleOverlay").classList.contains("show"));
      log("TITLE button tap returned to title:", backToTitle);
    }
  }
  await browser.close();
  log("DONE2");
})().catch(e => { console.error("FATAL", e); process.exit(1); });
