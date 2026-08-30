// Mobile playtest: 390x730, hasTouch, isMobile
const { chromium } = require("playwright");
const fs = require("fs");
const SHOT = "/home/claude/ghostwreck/test/shots";
if (!fs.existsSync(SHOT)) fs.mkdirSync(SHOT, { recursive: true });

const log = (...a) => console.log("[PT]", ...a);
const errors = [];

(async () => {
  const browser = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    args: ["--no-sandbox"],
  });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 730 },
    hasTouch: true,
    isMobile: true,
    userAgent: "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36",
  });
  const page = await ctx.newPage();
  page.on("pageerror", e => { errors.push("pageerror: " + e.message); log("PAGEERROR:", e.message); });
  page.on("console", m => { if (m.type() === "error") { errors.push("console: " + m.text()); log("CONSOLE ERROR:", m.text()); } });

  const shot = async name => { await page.screenshot({ path: `${SHOT}/pt_mobile_${name}.png` }); log("shot", name); };
  const hscroll = async label => {
    const r = await page.evaluate(() => ({
      iw: window.innerWidth, sw: document.documentElement.scrollWidth,
      bsw: document.body.scrollWidth, sx: window.scrollX,
    }));
    log(`hscroll[${label}]`, JSON.stringify(r), r.sw > r.iw || r.bsw > r.iw ? "*** OVERFLOW ***" : "ok");
    return r;
  };
  const box = async (sel) => {
    try {
      return await page.evaluate(s => {
        const el = document.querySelector(s);
        if (!el) return null;
        const b = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return { x: +b.x.toFixed(1), y: +b.y.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1), display: cs.display, vis: cs.visibility };
      }, sel);
    } catch (e) { return { err: e.message }; }
  };
  const checkBtns = async (label, sels) => {
    for (const s of sels) {
      const b = await box(s);
      if (!b) { log(`BTN[${label}] ${s} MISSING`); continue; }
      const off = b.display === "none" ? " HIDDEN" :
        (b.x < 0 || b.y < 0 || b.x + b.w > 390 || b.y + b.h > 730) ? " *** OUT OF VIEWPORT ***" : "";
      log(`BTN[${label}] ${s}`, JSON.stringify(b), off || "ok");
    }
  };

  await page.goto("file:///home/claude/ghostwreck/artifact.html");
  log("loaded page, waiting for LM ...");
  try {
    await page.waitForFunction(() => window.LM && LM.isLoaded, { timeout: 180000 });
    log("LM loaded");
  } catch (e) { log("LM LOAD TIMEOUT:", e.message); }
  await page.waitForTimeout(1500);

  // ---- TITLE ----
  const touchClass = await page.evaluate(() => document.body.classList.contains("touch"));
  log("body.touch class:", touchClass);
  await hscroll("title");
  await checkBtns("title", ["#btnNew", "#btnAbout", "#titleOverlay .titlebox"]);
  await shot("01_title");

  // ---- THE MIND (about) from title ----
  await page.tap("#btnAbout");
  await page.waitForTimeout(800);
  await hscroll("about");
  await checkBtns("about", ["#aboutClose", "#probeInput", "#probeBtn", "#aboutOverlay .panel"]);
  await shot("02_about_mind");
  // probe test on mobile
  try {
    await page.tap("#probeInput");
    await page.fill("#probeInput", "The garden is");
    await page.tap("#probeBtn");
    await page.waitForTimeout(5000);
    await shot("03_about_probe");
  } catch (e) { log("probe error:", e.message); }
  await page.tap("#aboutClose");
  await page.waitForTimeout(400);

  // ---- START GAME ----
  await page.tap("#btnNew");
  await page.waitForTimeout(1200);
  await shot("04_intro");
  await hscroll("intro");
  for (let i = 0; i < 4; i++) { await page.tap("#introOverlay"); await page.waitForTimeout(700); }
  const introGone = await page.evaluate(() => !document.getElementById("introOverlay").classList.contains("show"));
  log("intro dismissed:", introGone);
  // deck overlay
  const deckShown = await page.evaluate(() => document.getElementById("deckOverlay").classList.contains("show"));
  if (deckShown) { await shot("05_deckoverlay"); await hscroll("deckoverlay"); await page.tap("#deckOverlay"); await page.waitForTimeout(600); }
  await shot("06_ingame");
  await hscroll("ingame");

  // ---- JOYSTICK ----
  const joyVis = await box("#joyzone");
  log("joyzone box:", JSON.stringify(joyVis));
  const before = await page.evaluate(() => ({ px: Game.state.px, py: Game.state.py }));
  // real CDP touch on joyzone center, drag right
  let moved = false;
  try {
    const cdp = await ctx.newCDPSession(page);
    const cx = joyVis.x + joyVis.w / 2, cy = joyVis.y + joyVis.h / 2;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: cx, y: cy, id: 1 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: cx + 38, y: cy, id: 1 }] });
    await page.waitForTimeout(300);
    const joyState = await page.evaluate(() => ({ ...Game.joy }));
    log("joy state during CDP drag:", JSON.stringify(joyState));
    await shot("07_joystick_live");
    await page.waitForTimeout(900);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    const after = await page.evaluate(() => ({ px: Game.state.px, py: Game.state.py }));
    log("player before:", JSON.stringify(before), "after:", JSON.stringify(after));
    moved = Math.abs(after.px - before.px) + Math.abs(after.py - before.py) > 4;
    log("CDP joystick moved player:", moved);
  } catch (e) { log("CDP touch failed:", e.message); }
  if (!moved) {
    // fallback: synthetic TouchEvent
    const r = await page.evaluate(async () => {
      const zone = document.getElementById("joyzone");
      const b = zone.getBoundingClientRect();
      const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
      const mk = (type, x, y) => {
        const t = new Touch({ identifier: 1, target: zone, clientX: x, clientY: y });
        return new TouchEvent(type, { touches: [t], changedTouches: [t], bubbles: true, cancelable: true });
      };
      const p0 = { px: Game.state.px, py: Game.state.py };
      zone.dispatchEvent(mk("touchstart", cx, cy));
      zone.dispatchEvent(mk("touchmove", cx + 38, cy));
      await new Promise(r => setTimeout(r, 1200));
      zone.dispatchEvent(mk("touchend", cx + 38, cy));
      const p1 = { px: Game.state.px, py: Game.state.py };
      return { p0, p1, joyWasActive: true };
    });
    log("synthetic touch result:", JSON.stringify(r));
    moved = Math.abs(r.p1.px - r.p0.px) + Math.abs(r.p1.py - r.p0.py) > 4;
    log("synthetic joystick moved player:", moved);
  }
  // check knob reset + joy reset
  const joyAfter = await page.evaluate(() => ({ ...Game.joy, knob: document.getElementById("joyknob").style.transform }));
  log("joy after release:", JSON.stringify(joyAfter));

  // ---- INTERACT BUTTON near terminal ----
  const found = await page.evaluate(() => {
    const e = Game.deck.entities.find(x => x.type === "terminal");
    if (!e) return null;
    Game.state.px = e.x * 32 + 16; Game.state.py = (e.y + 1) * 32 + 16;
    return { x: e.x, y: e.y, label: e.label };
  });
  log("teleported near terminal:", JSON.stringify(found));
  await page.waitForTimeout(600);
  const ibShown = await page.evaluate(() => document.getElementById("interactBtn").classList.contains("show"));
  const ibBox = await box("#interactBtn");
  log("interactBtn shown:", ibShown, JSON.stringify(ibBox));
  await shot("08_interactbtn");
  if (ibShown) {
    await page.tap("#interactBtn");
    await page.waitForTimeout(1000);
    const termOpen = await page.evaluate(() => document.getElementById("termOverlay").classList.contains("show"));
    log("terminal opened via interactBtn tap:", termOpen);
    log("waiting for terminal generation ...");
    await page.waitForTimeout(9000);
    await hscroll("terminal");
    await checkBtns("terminal", ["#termBtnRead", "#termBtnStatus", "#termClose", "#termOverlay .panel"]);
    await shot("09_terminal");
    await page.tap("#termClose");
    await page.waitForTimeout(500);
  }

  // ---- find decks containing echodoor / intercom / corealtar ----
  const deckMap = await page.evaluate(() => {
    const m = {};
    for (const [i, d] of (Game.decks || []).entries ? [] : []) {}
    return null;
  }).catch(() => null);
  // do it by walking decks live
  const findOnDecks = async type => {
    for (let n = 0; n <= 5; n++) {
      const has = await page.evaluate(({ n, type }) => {
        gotoDeck(n);
        return !!Game.deck.entities.find(x => x.type === type);
      }, { n, type });
      await page.waitForTimeout(400);
      await page.evaluate(() => { const d = document.getElementById("deckOverlay"); if (d.classList.contains("show")) d.click(); });
      await page.waitForTimeout(200);
      if (has) return n;
    }
    return -1;
  };

  // ---- VOICE DOOR ----
  const doorDeck = await findOnDecks("echodoor");
  log("echodoor on deck", doorDeck);
  if (doorDeck >= 0) {
    await page.evaluate(() => {
      const e = Game.deck.entities.find(x => x.type === "echodoor");
      Game.state.px = e.x * 32 + 16; Game.state.py = (e.y + 1) * 32 + 16;
      Game.nearEntity = e; Game.onInteract(e);
    });
    await page.waitForTimeout(2500);
    await hscroll("door");
    await checkBtns("door", ["#doorInput", "#doorSpeak", "#doorClose", "#doorOverlay .panel"]);
    await shot("10_door");
    // keyboard flow: tap input, check SPEAK still visible
    await page.tap("#doorInput");
    await page.waitForTimeout(400);
    const focusInfo = await page.evaluate(() => {
      const sp = document.getElementById("doorSpeak").getBoundingClientRect();
      const inp = document.getElementById("doorInput").getBoundingClientRect();
      return { focused: document.activeElement.id, speak: { x: sp.x, y: sp.y, w: sp.width, h: sp.height }, input: { x: inp.x, y: inp.y, w: inp.width } };
    });
    log("door focus info:", JSON.stringify(focusInfo));
    await page.keyboard.type("Bring the garden back to bloom, my dear, the seedlings need me");
    await shot("11_door_typed");
    const spBox = await box("#doorSpeak");
    log("doorSpeak after typing:", JSON.stringify(spBox));
    await page.tap("#doorSpeak");
    log("spoke at door, waiting for judgment ...");
    await page.waitForTimeout(9000);
    await hscroll("door_verdict");
    await shot("12_door_verdict");
    const verdict = await page.evaluate(() => ({
      verdict: document.getElementById("doorVerdict").textContent,
      barsRows: document.getElementById("doorBars").children.length,
      open: document.getElementById("doorOverlay").classList.contains("show"),
    }));
    log("door verdict:", JSON.stringify(verdict));
    await page.evaluate(() => { const d = document.getElementById("doorClose"); if (d && document.getElementById("doorOverlay").classList.contains("show")) d.click(); });
    await page.waitForTimeout(400);
  }

  // ---- INTERCOM ----
  const comDeck = await findOnDecks("intercom");
  log("intercom on deck", comDeck);
  if (comDeck >= 0) {
    await page.evaluate(() => {
      const e = Game.deck.entities.find(x => x.type === "intercom");
      Game.state.px = e.x * 32 + 16; Game.state.py = (e.y + 1) * 32 + 16;
      Game.nearEntity = e; Game.onInteract(e);
    });
    await page.waitForTimeout(1500);
    await hscroll("intercom");
    await checkBtns("intercom", ["#comInput", "#comSpeak", "#comClose", "#comOverlay .panel"]);
    await shot("13_intercom");
    await page.tap("#comInput");
    await page.keyboard.type("hello? is anyone alive out there?");
    await page.tap("#comSpeak");
    log("intercom spoke, waiting ...");
    await page.waitForTimeout(9000);
    await shot("14_intercom_reply");
    await hscroll("intercom_reply");
    await page.tap("#comClose");
    await page.waitForTimeout(400);
  }

  // ---- JOURNAL ----
  await page.tap("#btnJournal");
  await page.waitForTimeout(800);
  await hscroll("journal");
  await checkBtns("journal", ["#journalClose", "#journalOverlay .panel"]);
  await shot("15_journal");
  await page.tap("#journalClose");
  await page.waitForTimeout(400);

  // ---- FINALE ----
  const coreDeck = await findOnDecks("corealtar");
  log("corealtar on deck", coreDeck);
  if (coreDeck >= 0) {
    await page.evaluate(() => {
      const e = Game.deck.entities.find(x => x.type === "corealtar");
      Game.state.px = e.x * 32 + 16; Game.state.py = (e.y + 1) * 32 + 16;
      Game.nearEntity = e; Game.onInteract(e);
    });
    await page.waitForTimeout(4000);
    await hscroll("finale");
    await checkBtns("finale", ["#finaleInput", "#finaleSpeak", "#finaleOverlay .panel"]);
    await shot("16_finale");
    const answers = [
      "I searched every deck and read every log you kept for them",
      "Sona kept the garden alive and I remember her name",
      "Rest now, you have carried them long enough, let go",
    ];
    for (let i = 0; i < 3; i++) {
      // wait for input ready
      try { await page.waitForFunction(() => !document.getElementById("finaleSpeak").disabled, { timeout: 20000 }); } catch (e) { log("finaleSpeak stuck disabled"); }
      await page.tap("#finaleInput");
      await page.keyboard.type(answers[i]);
      await page.tap("#finaleSpeak");
      log("finale answer", i + 1, "sent, waiting ...");
      await page.waitForTimeout(12000);
      await shot(`17_finale_step${i + 1}`);
    }
    // ending should appear ~3.2s after step 3 reply
    try {
      await page.waitForFunction(() => document.getElementById("endingOverlay").classList.contains("show"), { timeout: 30000 });
      log("ending overlay shown");
    } catch (e) { log("ENDING NEVER SHOWED"); }
    await page.waitForTimeout(3000);
    await hscroll("ending");
    await checkBtns("ending", ["#endingNew", "#endingTitleBtn", "#endingOverlay .endingbox"]);
    await shot("18_ending");
    // let ending text finish typing
    await page.waitForTimeout(8000);
    await shot("19_ending_full");
    await hscroll("ending_full");
  }

  log("ERRORS COLLECTED:", errors.length);
  errors.forEach(e => log("  ", e));
  await browser.close();
  log("DONE");
})().catch(e => { console.error("FATAL", e); process.exit(1); });
