// Verify keeper & static endings via state manipulation + finale replay bug.
const { chromium } = require("playwright");
const fs = require("fs");
const LOG = "/home/claude/ghostwreck/test/pt_endings.log";
fs.writeFileSync(LOG, "");
const T0 = Date.now();
function log(...a) {
  const line = `[${((Date.now() - T0) / 1000).toFixed(1)}s] ` + a.join(" ");
  console.log(line); fs.appendFileSync(LOG, line + "\n");
}

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on("pageerror", e => log("PAGEERROR:", String(e)));
  await page.goto("file:///home/claude/ghostwreck/artifact.html");
  await page.waitForFunction(() => typeof LM !== "undefined" && LM.isLoaded, null, { timeout: 120000 });
  log("LM loaded");

  async function fps() {
    return page.evaluate(() => new Promise(r => {
      let n = 0; const t0 = performance.now();
      function f() { n++; if (performance.now() - t0 < 1500) requestAnimationFrame(f); else r((n / 1.5).toFixed(1)); }
      requestAnimationFrame(f);
    }));
  }

  async function newGameToCore() {
    await page.click("#btnNew");
    for (let i = 0; i < 8; i++) {
      await page.waitForTimeout(600);
      const vis = await page.evaluate(() => document.getElementById("introOverlay").classList.contains("show"));
      if (!vis) break;
      await page.click("#introOverlay");
    }
    await page.waitForTimeout(600);
    await page.click("#deckOverlay").catch(() => {});
    await page.waitForTimeout(600);
    await page.evaluate(() => gotoDeck(5));
    await page.waitForTimeout(800);
    await page.click("#deckOverlay").catch(() => {});
    await page.waitForTimeout(400);
  }

  async function openFinale() {
    await page.evaluate(() => {
      const e = Game.deck.entities.find(x => x.type === "corealtar");
      Game.state.px = e.x * 32 + 16; Game.state.py = (e.y + 1) * 32 + 16;
      Game.nearEntity = e; Game.onInteract(e);
    });
    await page.waitForTimeout(300);
    return page.evaluate(() => ({
      show: document.getElementById("finaleOverlay").classList.contains("show"),
      speakDisabled: document.getElementById("finaleSpeak").disabled,
      inputDisabled: document.getElementById("finaleInput").disabled,
    }));
  }

  // answer via Enter key; wait until step changes or ending shows
  async function answer(text, expectStepAfter) {
    // wait for question to finish typing
    await page.waitForFunction(() => document.getElementById("finaleQ").textContent.length > 60, null, { timeout: 60000 });
    await page.waitForTimeout(2500);
    await page.fill("#finaleInput", text);
    const t = Date.now();
    await page.press("#finaleInput", "Enter");
    log(`fps just after submit: ${await fps()}`);
    const end = Date.now() + 600000;
    while (Date.now() < end) {
      const s = await page.evaluate(() => ({
        step: document.getElementById("finaleStep").textContent,
        reply: document.getElementById("finaleReply").textContent.slice(0, 100),
        ending: document.getElementById("endingOverlay").classList.contains("show"),
      }));
      if (s.ending || (expectStepAfter && s.step.includes(expectStepAfter))) {
        log(`answer "${text.slice(0, 40)}" done in ${((Date.now() - t) / 1000).toFixed(1)}s; reply="${s.reply}"`);
        return s;
      }
      await page.waitForTimeout(1500);
    }
    throw new Error("answer timed out");
  }

  async function runFinale(trustAtQ3, label) {
    const f = await openFinale();
    log(`${label}: finale opened ${JSON.stringify(f)}`);
    await answer("I came to bring word home to their families.", "2 / 3");
    await answer("Mara Reyne, your captain.", "3 / 3");
    await page.evaluate(t => { Game.state.trust = t; }, trustAtQ3);
    await answer("Let them rest now. The watch is over. Open the doors and sleep.", null);
    await page.waitForFunction(() => document.getElementById("endingOverlay").classList.contains("show"), null, { timeout: 120000 });
    await page.waitForFunction(() => document.getElementById("endingStats").textContent.length > 0, null, { timeout: 180000 });
    const title = await page.evaluate(() => document.getElementById("endingTitle").textContent);
    const stats = await page.evaluate(() => document.getElementById("endingStats").textContent);
    log(`${label}: ENDING "${title}" | ${stats}`);
    await page.screenshot({ path: `/home/claude/ghostwreck/test/shots/pt_full_06_${label}.png` });
    return title;
  }

  // ---- run 1: keeper (trust 10 at Q3) ----
  await newGameToCore();
  log("baseline fps on core:", await fps());
  const keeper = await runFinale(10, "keeper");

  // ---- replay bug check: NEW RUN from ending, then finale again ----
  await page.click("#endingNew");
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(600);
    const vis = await page.evaluate(() => document.getElementById("introOverlay").classList.contains("show"));
    if (!vis) break;
    await page.click("#introOverlay");
  }
  await page.waitForTimeout(600);
  await page.click("#deckOverlay").catch(() => {});
  await page.waitForTimeout(400);
  await page.evaluate(() => gotoDeck(5));
  await page.waitForTimeout(800);
  await page.click("#deckOverlay").catch(() => {});
  await page.waitForTimeout(400);
  const f2 = await openFinale();
  log("REPLAY-BUG CHECK: second-run finale state:", JSON.stringify(f2));
  await page.screenshot({ path: "/home/claude/ghostwreck/test/shots/pt_full_07_replay_finale.png" });
  if (f2.speakDisabled) {
    // confirm Enter still works as a workaround
    await page.waitForFunction(() => document.getElementById("finaleQ").textContent.length > 60, null, { timeout: 60000 });
    await page.waitForTimeout(2000);
    await page.fill("#finaleInput", "I am here again.");
    await page.press("#finaleInput", "Enter");
    await page.waitForTimeout(4000);
    const st = await page.evaluate(() => ({
      step: document.getElementById("finaleStep").textContent,
      reply: document.getElementById("finaleReply").textContent.slice(0, 60),
      speakDisabled: document.getElementById("finaleSpeak").disabled,
    }));
    log("REPLAY-BUG: after Enter:", JSON.stringify(st));
  }

  // ---- run 2: static (trust 3 at Q3): close and restart the finale cleanly ----
  await page.keyboard.press("Escape");
  await page.waitForTimeout(600);
  await page.evaluate(() => { Game.state.ended = null; });
  const staticTitle = await runFinale(3, "static");
  log(`SUMMARY: keeper="${keeper}" static="${staticTitle}"`);
  log("DONE");
  await browser.close();
})().catch(e => { log("SCRIPT CRASH:", e.stack || String(e)); process.exit(1); });
