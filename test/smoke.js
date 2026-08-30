// Headless smoke test of the game shell (works with or without weights.js).
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");
const ROOT = require("path").resolve(__dirname, "..");
const SHOTS = __dirname + "/shots/";
fs.mkdirSync(SHOTS, { recursive: true });

(async () => {
  const browser = await chromium.launch(Object.assign({ args: ["--no-sandbox"] },
    process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}));
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", e => errors.push("PAGEERROR: " + e.message));

  const url = "file://" + path.resolve(__dirname, "../game/index.html");
  await page.goto(url);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: SHOTS + "01_title.png" });

  // start new game
  await page.click("#btnNew");
  await page.waitForTimeout(700);
  // click through intro (4 frames x2 clicks each: skip type + advance)
  for (let i = 0; i < 10; i++) {
    await page.click("#introOverlay");
    await page.waitForTimeout(250);
    const visible = await page.$eval("#introOverlay", el => el.classList.contains("show"));
    if (!visible) break;
  }
  await page.waitForTimeout(400);
  await page.screenshot({ path: SHOTS + "02_deckintro.png" });
  // dismiss deck intro
  await page.click("#deckOverlay");
  await page.waitForTimeout(600);
  await page.screenshot({ path: SHOTS + "03_ingame.png" });

  // walk around
  for (const [key, ms] of [["d", 900], ["s", 500], ["d", 800], ["w", 300]]) {
    await page.keyboard.down(key);
    await page.waitForTimeout(ms);
    await page.keyboard.up(key);
  }
  await page.screenshot({ path: SHOTS + "04_walked.png" });

  // state dump
  const state = await page.evaluate(() => ({
    o2: Game.state.o2, px: Game.state.px, py: Game.state.py,
    deck: Game.deck.src.id, near: Game.nearEntity ? Game.nearEntity.type : null,
    lm: LM.isLoaded,
  }));
  console.log("STATE:", JSON.stringify(state));
  console.log("ERRORS:", errors.length ? errors.slice(0, 10) : "none");
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})();
