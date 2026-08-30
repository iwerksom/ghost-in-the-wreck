const { chromium } = require("playwright");

(async () => {
  const R = { errors: [] };
  const browser = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    args: ["--no-sandbox", "--enable-precise-memory-info"],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on("pageerror", e => R.errors.push("pageerror: " + e.message));
  page.on("console", m => { if (m.type() === "error") R.errors.push("console: " + m.text()); });

  // 1. page load -> title visible
  const t0 = Date.now();
  await page.goto("file:///home/claude/ghostwreck/artifact.html");
  await page.waitForSelector("#btnNew", { state: "visible", timeout: 60000 });
  R.loadToTitleMs = Date.now() - t0;

  // 2. model load time: wait until LM.isLoaded, capture #loadstatus text
  const tLM = Date.now();
  await page.waitForFunction(() => typeof LM !== "undefined" && LM.isLoaded, null, { timeout: 300000, polling: 200 });
  R.modelLoadMsFromNav = Date.now() - t0;
  R.modelLoadMsFromTitle = Date.now() - tLM;
  R.loadStatusText = await page.$eval("#loadstatus", el => el.textContent);

  await page.screenshot({ path: "shots/pt_perf_title.png" });

  // start game
  await page.click("#btnNew");
  for (let i = 0; i < 4; i++) {
    await page.waitForTimeout(400);
    const vis = await page.$eval("#introOverlay", el => getComputedStyle(el).display !== "none").catch(() => false);
    if (vis) await page.click("#introOverlay");
  }
  await page.waitForTimeout(500);
  const deckVis = await page.$eval("#deckOverlay", el => getComputedStyle(el).display !== "none").catch(() => false);
  if (deckVis) await page.click("#deckOverlay");
  await page.waitForTimeout(500);
  await page.screenshot({ path: "shots/pt_perf_ingame.png" });

  // helper: open a terminal via teleport
  async function openTerminal() {
    await page.evaluate(() => {
      const e = Game.deck.entities.find(x => x.type === "terminal");
      Game.state.px = e.x * 32 + 16; Game.state.py = (e.y + 1) * 32 + 16;
      Game.nearEntity = e; Game.onInteract(e);
    });
  }

  await openTerminal();
  await page.waitForTimeout(300);
  // The initial open may already trigger a generation; wait for read btn enabled
  await page.waitForFunction(() => !document.getElementById("termBtnRead").disabled, null, { timeout: 60000 });
  await page.screenshot({ path: "shots/pt_perf_terminal.png" });

  // 3. one terminal log generation, with FPS sampling concurrently
  const fpsPromise = page.evaluate(() => new Promise(res => {
    const deltas = [];
    let last = performance.now();
    const end = last + 5000;
    function tick(now) {
      deltas.push(now - last); last = now;
      if (now < end) requestAnimationFrame(tick); else {
        deltas.sort((a, b) => a - b);
        const avg = deltas.reduce((a, b) => a + b, 0) / deltas.length;
        res({
          frames: deltas.length,
          avgFps: 1000 / avg,
          worstDeltaMs: deltas[deltas.length - 1],
          p95DeltaMs: deltas[Math.floor(deltas.length * 0.95)],
          medianDeltaMs: deltas[Math.floor(deltas.length * 0.5)],
        });
      }
    }
    requestAnimationFrame(tick);
  }));
  const tGen = Date.now();
  await page.click("#termBtnRead");
  await page.waitForFunction(() => !document.getElementById("termBtnRead").disabled, null, { timeout: 90000, polling: 100 });
  R.terminalGenMs = Date.now() - tGen;
  R.fpsDuringGen = await fpsPromise;
  await page.screenshot({ path: "shots/pt_perf_gen1.png" });

  // 4. 10 consecutive generations, memory tracking
  R.memRuns = [];
  const heap = () => page.evaluate(() => (performance.memory ? performance.memory.usedJSHeapSize : null));
  R.heapBefore = await heap();
  for (let i = 0; i < 10; i++) {
    const ts = Date.now();
    await page.click("#termBtnRead");
    await page.waitForFunction(() => !document.getElementById("termBtnRead").disabled, null, { timeout: 90000, polling: 100 });
    const ms = Date.now() - ts;
    const h = await heap();
    R.memRuns.push({ run: i + 1, ms, heapMB: h ? +(h / 1048576).toFixed(1) : null });
  }
  R.heapAfter = await heap();
  await page.click("#termClose");
  await page.waitForTimeout(300);

  // 5. door judgment time (voice doors are type "echodoor")
  try {
    let doorDeck = null;
    for (let d = 0; d < 6; d++) {
      await page.evaluate((n) => gotoDeck(n), d);
      await page.waitForTimeout(400);
      const dv = await page.$eval("#deckOverlay", el => getComputedStyle(el).display !== "none").catch(() => false);
      if (dv) await page.click("#deckOverlay");
      await page.waitForTimeout(200);
      const found = await page.evaluate(() => {
        const key = e => Game.deck.src.id + ":" + e.ch + ":" + e.x + "," + e.y;
        const e = Game.deck.entities.find(x => x.type === "echodoor" && !Game.state.opened[key(x)]);
        return !!e;
      });
      if (found) { doorDeck = d; break; }
    }
    R.doorDeck = doorDeck;
    if (doorDeck !== null) {
      await page.evaluate(() => {
        const key = e => Game.deck.src.id + ":" + e.ch + ":" + e.x + "," + e.y;
        const e = Game.deck.entities.find(x => x.type === "echodoor" && !Game.state.opened[key(x)]);
        Game.state.px = e.x * 32 + 16; Game.state.py = (e.y + 1) * 32 + 16;
        Game.nearEntity = e; Game.onInteract(e);
      });
      await page.waitForTimeout(700);
      await page.screenshot({ path: "shots/pt_perf_door.png" });
      await page.fill("#doorInput", "It is me. Open the door, I am coming home to rest.");
      const tJ = Date.now();
      await page.click("#doorSpeak");
      await page.waitForFunction(() => {
        const v = document.getElementById("doorVerdict").textContent;
        return v && !v.includes("listening") && v.trim() !== "";
      }, null, { timeout: 60000, polling: 100 });
      R.doorJudgmentMs = Date.now() - tJ;
      R.doorVerdict = await page.$eval("#doorVerdict", el => el.textContent);
      await page.screenshot({ path: "shots/pt_perf_verdict.png" });
    }
  } catch (e) {
    R.doorPhaseError = String(e.message || e);
    await page.screenshot({ path: "shots/pt_perf_doorfail.png" }).catch(() => {});
  }

  console.log(JSON.stringify(R, null, 2));
  await browser.close();
})().catch(e => { console.error("FATAL", e); process.exit(1); });
