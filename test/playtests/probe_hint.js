const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.goto("file:///home/claude/ghostwreck/artifact.html");
  await page.waitForFunction(() => typeof LM !== "undefined" && LM.isLoaded, undefined, { timeout: 120000 });
  // need Game.state for seedFrom? voiceHint doesn't use seedFrom. But Story functions may reference Game — start a game to be safe.
  await page.click("#btnNew");
  for (let i = 0; i < 4; i++) { await page.waitForTimeout(300); await page.click("#introOverlay"); }
  await page.waitForTimeout(500);
  try { await page.click("#deckOverlay", { timeout: 3000 }); } catch (e) {}
  for (const who of ["KIT", "CHO", "REYNE", "VEGA"]) {
    const outs = [];
    for (let i = 0; i < 6; i++) outs.push(await page.evaluate((w) => Story.voiceHint(w), who));
    console.log(who, JSON.stringify(outs, null, 1));
  }
  await browser.close();
})();
