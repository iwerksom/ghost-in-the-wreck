const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.goto("file:///home/claude/ghostwreck/artifact.html");
  await page.waitForFunction(() => typeof LM !== "undefined" && LM.isLoaded, undefined, { timeout: 120000 });
  const outs = await page.evaluate(async () => {
    const res = [];
    for (let i = 0; i < 8; i++) {
      const raw = await LM.generate("[VOICE:REYNE] ", { maxTokens: 60, maxChars: 150, temp: 0.72, topP: 0.87 });
      res.push(raw);
    }
    return res;
  });
  console.log(JSON.stringify(outs, null, 1));
  await browser.close();
})();
