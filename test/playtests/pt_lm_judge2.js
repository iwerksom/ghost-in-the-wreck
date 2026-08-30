const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto("file:///home/claude/ghostwreck/artifact.html");
  await page.waitForFunction(() => typeof LM !== "undefined" && LM.isLoaded, null, { timeout: 120000 });
  await page.click("#btnNew");
  await page.waitForTimeout(500);
  for (let i = 0; i < 4; i++) { try { await page.click("#introOverlay", { timeout: 1500 }); await page.waitForTimeout(200); } catch (e) { break; } }
  try { await page.click("#deckOverlay", { timeout: 2000 }); } catch (e) {}

  const tests = [
    ["OKAFOR", "Patient presents with mild dehydration. Administered saline, logged the dose, vitals steady."],
    ["OKAFOR", "Checked everyone's vitals at 0800. Doses logged. A medic's first job is a level voice."],
    ["OKAFOR", "I kept my voice level and talked the patient to sleep. Vitals faded one by one."],
    ["OKAFOR", "Sick bay is quiet tonight. One patient with a burn dressing, dose charted, sleeping now."],
    ["REYNE", "All hands accounted for at first watch. The captain holds the bridge. Reyne out."],
    ["REYNE", "I gave the order and I will stand by it. My crew, my watch, my responsibility."],
  ];
  for (const [expected, text] of tests) {
    const r = await page.evaluate(async (t) => {
      const j = await Story.judgeVoice(t);
      const probs = {}; for (const k in j.probs) probs[k] = +j.probs[k].toFixed(3);
      return { best: j.best, bestProb: +j.bestProb.toFixed(3), probs };
    }, text);
    console.log(`exp=${expected} got=${r.best} p=${r.bestProb} probs=${JSON.stringify(r.probs)} :: ${text}`);
  }
  await browser.close();
})().catch(e => { console.error("FATAL", e); process.exit(1); });
