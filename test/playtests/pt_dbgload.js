const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on("pageerror", e => console.log("PAGEERROR:", String(e)));
  await page.goto("file:///home/claude/ghostwreck/artifact.html");
  for (const s of [3000, 5000, 10000, 15000]) {
    await page.waitForTimeout(s);
    const r = await page.evaluate(() => ({
      lm: typeof LM, loaded: (typeof LM !== "undefined") ? LM.isLoaded : null,
      status: document.getElementById("loadStatus")?.textContent || document.querySelector(".loadstatus")?.textContent || "?",
      pack: typeof MODEL_PACK, tok: typeof TOKENIZER,
    })).catch(e => String(e));
    console.log(s, JSON.stringify(r));
  }
  await browser.close();
})();
