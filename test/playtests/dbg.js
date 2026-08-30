const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on("pageerror", e => console.log("PAGEERROR:", String(e)));
  page.on("console", m => console.log("CONSOLE[" + m.type() + "]:", m.text().slice(0, 300)));
  page.on("requestfailed", r => console.log("REQFAIL:", r.url().slice(0, 120), r.failure() && r.failure().errorText));
  await page.goto("file:///home/claude/ghostwreck/artifact.html");
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(5000);
    const st = await page.evaluate(() => ({
      lm: typeof LM !== "undefined" ? { loaded: LM.isLoaded } : null,
      loadstatus: document.getElementById("loadstatus") ? document.getElementById("loadstatus").textContent : null,
      btnNew: document.getElementById("btnNew") ? getComputedStyle(document.getElementById("btnNew")).display : null,
    }));
    console.log(i, JSON.stringify(st));
    if (st.lm && st.lm.loaded) break;
  }
  await page.screenshot({ path: "shots/pt_voicedoor_dbg_title.png" });
  await browser.close();
})();
