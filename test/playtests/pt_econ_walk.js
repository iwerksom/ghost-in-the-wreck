// Walk (keyboard) from deck 0 spawn eastward through the proximity door D at (15,4) toward O at (28,3)
const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  page.on("pageerror", e => errs.push("PAGEERROR: " + e.message));
  await page.goto("file:///home/claude/ghostwreck/artifact.html");
  await page.waitForTimeout(3000);
  await page.click("#btnNew");
  for (let i = 0; i < 4; i++) { await page.click("#introOverlay"); await page.waitForTimeout(200); }
  await page.waitForTimeout(300);
  await page.click("#deckOverlay");
  await page.waitForTimeout(400);
  const pos = () => page.evaluate(() => ({ tx: Math.floor(Game.state.px / 32), ty: Math.floor(Game.state.py / 32), o2: Game.state.o2 }));
  console.log("start:", JSON.stringify(await pos()));
  // spawn (5,4). Walk right along row 4 through doors at (15,4) and (20,4), then up-right to O at (28,3)
  await page.keyboard.down("d");
  await page.waitForTimeout(6500); // ~118px/s => ~24 tiles max; walls stop us at x=28 area
  await page.keyboard.up("d");
  let p = await pos();
  console.log("after walking right:", JSON.stringify(p));
  const passedDoors = p.tx >= 21;
  await page.keyboard.down("w");
  await page.waitForTimeout(600);
  await page.keyboard.up("w");
  p = await pos();
  const picked = await page.evaluate(() => Object.keys(Game.state.collected));
  console.log("final:", JSON.stringify(p), "passed both doors:", passedDoors, "picked up:", JSON.stringify(picked));
  await page.screenshot({ path: "shots/pt_econ_walk.png" });
  console.log("ERRORS:", JSON.stringify(errs));
  await browser.close();
})().catch(e => { console.error("FATAL", e); process.exit(1); });
