// Interactive playtest controller: polls cmd file, executes, writes result.
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const DIR = "/home/claude/ghostwreck/test";
const CMD = path.join(DIR, "pt_cmd.js");
const OUT = path.join(DIR, "pt_out.txt");
const SHOTS = path.join(DIR, "shots");

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push("CONSOLEERR: " + m.text());
  });
  await page.goto("file:///home/claude/ghostwreck/artifact.html");
  fs.writeFileSync(OUT, "READY\n");
  console.log("controller ready");

  let lastMtime = 0;
  while (true) {
    await new Promise((r) => setTimeout(r, 300));
    let st;
    try { st = fs.statSync(CMD); } catch { continue; }
    if (st.mtimeMs === lastMtime) continue;
    lastMtime = st.mtimeMs;
    const code = fs.readFileSync(CMD, "utf8");
    let result;
    try {
      // The cmd file exports an async fn(page, errors, shot)
      const fn = eval("(" + code + ")");
      const shot = async (name) => {
        await page.screenshot({ path: path.join(SHOTS, name + ".png") });
        return name;
      };
      result = await fn(page, errors, shot);
    } catch (e) {
      result = "ERROR: " + (e.stack || e.message);
    }
    fs.writeFileSync(OUT, "DONE\n" + (typeof result === "string" ? result : JSON.stringify(result, null, 2)) + "\nERRORS:\n" + errors.join("\n"));
  }
})();
