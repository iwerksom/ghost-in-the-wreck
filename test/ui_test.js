// UI interaction test: teleports to entities, opens each overlay, screenshots.
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");
const SHOTS = __dirname + "/shots/";
fs.mkdirSync(SHOTS, { recursive: true });

(async () => {
  const browser = await chromium.launch(Object.assign({ args: ["--no-sandbox"] },
    process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}));
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on("console", m => { if (m.type() === "error" && !m.text().includes("weights.js")) errors.push(m.text()); });
  page.on("pageerror", e => errors.push("PAGEERROR: " + e.message));
  await page.goto("file://" + path.resolve(__dirname, "../game/index.html"));
  await page.waitForTimeout(800);
  await page.click("#btnNew");
  for (let i = 0; i < 10; i++) {
    await page.click("#introOverlay").catch(() => {});
    await page.waitForTimeout(150);
    if (!(await page.$eval("#introOverlay", el => el.classList.contains("show")))) break;
  }
  await page.click("#deckOverlay");
  await page.waitForTimeout(300);

  async function tpAndInteract(type) {
    return page.evaluate((type) => {
      const e = Game.deck.entities.find(x => x.type === type);
      if (!e) return "no " + type;
      // find adjacent floor
      for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        if (!solidAt(e.x + dx, e.y + dy)) {
          Game.state.px = (e.x + dx) * 32 + 16;
          Game.state.py = (e.y + dy) * 32 + 16;
          Game.nearEntity = e;
          Game.onInteract(e);
          return "ok";
        }
      }
      return "no adjacent floor for " + type;
    }, type);
  }

  // terminal
  console.log("terminal:", await tpAndInteract("terminal"));
  await page.waitForTimeout(1200);
  await page.screenshot({ path: SHOTS + "10_terminal.png" });
  await page.click("#termClose");

  // archive
  console.log("archive:", await tpAndInteract("archive"));
  await page.waitForTimeout(2500);
  await page.screenshot({ path: SHOTS + "11_archive.png" });
  await page.click("#termClose");

  // intercom
  console.log("intercom:", await tpAndInteract("intercom"));
  await page.waitForTimeout(400);
  await page.fill("#comInput", "Hello? Is anyone there?");
  await page.click("#comSpeak");
  await page.waitForTimeout(1500);
  await page.screenshot({ path: SHOTS + "12_intercom.png" });
  await page.click("#comClose");

  // socket without cell
  console.log("socket:", await tpAndInteract("socket"));
  await page.waitForTimeout(600);
  await page.screenshot({ path: SHOTS + "13_socket.png" });

  // go to hydro to test echo door
  await page.evaluate(() => { gotoDeck(1); });
  await page.waitForTimeout(300);
  await page.click("#deckOverlay");
  await page.waitForTimeout(300);
  console.log("echodoor:", await tpAndInteract("echodoor"));
  await page.waitForTimeout(1500);
  await page.fill("#doorInput", "the ferns need misting, green little hands");
  await page.click("#doorSpeak");
  await page.waitForTimeout(2500);
  await page.screenshot({ path: SHOTS + "14_door.png" });

  // journal (door may have auto-closed on success)
  await page.waitForTimeout(2800);
  await page.evaluate(() => { if (Game.overlayOpen) UI.closeOverlays(); });
  await page.click("#btnJournal");
  await page.waitForTimeout(400);
  await page.screenshot({ path: SHOTS + "15_journal.png" });
  await page.click("#journalClose");

  // finale flow (teleport to core)
  await page.evaluate(() => { Game.state.trust = 20; gotoDeck(5); });
  await page.waitForTimeout(300);
  await page.click("#deckOverlay");
  console.log("corealtar:", await tpAndInteract("corealtar"));
  await page.waitForTimeout(3500);
  await page.fill("#finaleInput", "I came to bring you peace");
  await page.click("#finaleSpeak");
  await page.waitForTimeout(3500);
  await page.screenshot({ path: SHOTS + "16_finale.png" });
  await page.fill("#finaleInput", "Kit Aune, the one who loved the garden");
  await page.click("#finaleSpeak");
  await page.waitForTimeout(4000);
  await page.fill("#finaleInput", "Let them go and rest now");
  await page.click("#finaleSpeak");
  await page.waitForTimeout(9000);
  await page.screenshot({ path: SHOTS + "17_ending.png" });

  const ended = await page.evaluate(() => Game.state.ended);
  console.log("ending:", ended);
  console.log("ERRORS:", errors.length ? errors : "none");
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})();
