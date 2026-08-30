const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on("pageerror", e => console.log("PAGEERROR:", String(e)));
  page.on("console", m => { if (m.type() === "error") console.log("CERR:", m.text()); });
  await page.goto("file:///home/claude/ghostwreck/artifact.html");
  await page.waitForFunction(() => typeof LM !== "undefined" && LM.isLoaded, null, { timeout: 120000 });
  // skip title/intro by direct start
  await page.click("#btnNew");
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(700);
    const vis = await page.evaluate(() => document.getElementById("introOverlay").classList.contains("show"));
    if (!vis) break;
    await page.click("#introOverlay");
  }
  await page.waitForTimeout(500);
  await page.click("#deckOverlay").catch(()=>{});
  await page.waitForTimeout(1000);
  await page.evaluate(() => { gotoDeck(5); });
  await page.waitForTimeout(800);
  await page.click("#deckOverlay").catch(()=>{});
  await page.waitForTimeout(500);
  await page.evaluate(() => { Game.state.trust = 20; const e = Game.deck.entities.find(x => x.type === "corealtar"); Game.nearEntity = e; Game.onInteract(e); });
  // poll state every second for 60s, answer when question done
  let answered = false;
  const t0 = Date.now();
  for (let i = 0; i < 120; i++) {
    const s = await page.evaluate(() => ({
      step: document.getElementById("finaleStep").textContent,
      q: document.getElementById("finaleQ").textContent.length,
      reply: document.getElementById("finaleReply").textContent.slice(0, 80),
      speakDisabled: document.getElementById("finaleSpeak").disabled,
      show: document.getElementById("finaleOverlay").classList.contains("show"),
      ending: document.getElementById("endingOverlay").classList.contains("show"),
    }));
    console.log(((Date.now()-t0)/1000).toFixed(0)+"s", JSON.stringify(s));
    if (!answered && s.q > 100 && i > 3) {
      await page.fill("#finaleInput", "My ship died out in the Reach. I came for air and a way home.");
      await page.click("#finaleSpeak");
      console.log("ANSWERED Q1");
      answered = true;
    }
    if (s.reply.length > 5 && answered) { console.log("REPLY SEEN"); break; }
    await page.waitForTimeout(1000);
  }
  await browser.close();
})();
