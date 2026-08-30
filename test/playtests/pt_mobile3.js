// Simulate virtual keyboard: shrink viewport to 390x420 with door overlay open
const { chromium } = require("playwright");
const log = (...a) => console.log("[PT3]", ...a);
const SHOT = "/home/claude/ghostwreck/test/shots";

(async () => {
  const browser = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    args: ["--no-sandbox"],
  });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 730 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  page.on("pageerror", e => log("PAGEERROR:", e.message));
  await page.goto("file:///home/claude/ghostwreck/artifact.html");
  await page.waitForFunction(() => typeof LM !== "undefined" && LM.isLoaded, null, { timeout: 180000 });
  await page.tap("#btnNew");
  await page.waitForTimeout(800);
  for (let i = 0; i < 4; i++) { await page.tap("#introOverlay"); await page.waitForTimeout(400); }
  await page.evaluate(() => { const d = document.getElementById("deckOverlay"); if (d.classList.contains("show")) d.click(); });
  await page.evaluate(() => {
    gotoDeck(1);
    const d = document.getElementById("deckOverlay"); if (d.classList.contains("show")) d.click();
    const e = Game.deck.entities.find(x => x.type === "echodoor");
    Game.state.px = e.x * 32 + 16; Game.state.py = (e.y + 1) * 32 + 16;
    Game.nearEntity = e; Game.onInteract(e);
  });
  await page.waitForTimeout(2500);
  await page.tap("#doorInput");
  // keyboard appears: viewport shrinks (resizes-content worst case)
  await page.setViewportSize({ width: 390, height: 420 });
  await page.waitForTimeout(600);
  const info = await page.evaluate(() => {
    const sp = document.getElementById("doorSpeak").getBoundingClientRect();
    const inp = document.getElementById("doorInput").getBoundingClientRect();
    const panel = document.querySelector("#doorOverlay .panel");
    return {
      vh: window.innerHeight,
      speak: { y: +sp.y.toFixed(0), bot: +(sp.y + sp.height).toFixed(0), inView: sp.y >= 0 && sp.y + sp.height <= window.innerHeight },
      input: { y: +inp.y.toFixed(0), inView: inp.y >= 0 },
      panelScroll: { scrollH: panel.scrollHeight, clientH: panel.clientHeight, scrollTop: panel.scrollTop },
      focused: document.activeElement.id,
    };
  });
  log("door with keyboard-sized viewport:", JSON.stringify(info, null, 1));
  await page.screenshot({ path: SHOT + "/pt_mobile_23_door_kbd.png" });
  if (!info.speak.inView) {
    // can the panel scroll to reveal it?
    await page.evaluate(() => { document.getElementById("doorSpeak").scrollIntoView({ block: "center" }); });
    await page.waitForTimeout(300);
    const sp2 = await page.evaluate(() => {
      const b = document.getElementById("doorSpeak").getBoundingClientRect();
      return { y: +b.y.toFixed(0), inView: b.y >= 0 && b.y + b.height <= window.innerHeight };
    });
    log("doorSpeak after scrollIntoView:", JSON.stringify(sp2));
    await page.screenshot({ path: SHOT + "/pt_mobile_24_door_kbd_scrolled.png" });
  }
  // type and speak in shrunk viewport
  await page.keyboard.type("the seedlings in bay three need water and warm light my love");
  const canTap = await page.evaluate(() => {
    const b = document.getElementById("doorSpeak").getBoundingClientRect();
    const el = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
    return { hit: el ? el.id : null };
  });
  log("elementFromPoint at doorSpeak center:", JSON.stringify(canTap));
  if (canTap.hit === "doorSpeak") {
    await page.tap("#doorSpeak");
    await page.waitForTimeout(8000);
    const v = await page.evaluate(() => document.getElementById("doorVerdict").textContent);
    log("verdict in shrunk viewport:", v);
    await page.screenshot({ path: SHOT + "/pt_mobile_25_door_kbd_verdict.png" });
  }
  await browser.close();
  log("DONE3");
})().catch(e => { console.error("FATAL", e); process.exit(1); });
