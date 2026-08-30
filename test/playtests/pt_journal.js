const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  let xss=false; page.on("pageerror", e=>console.log("PAGEERROR",String(e)));
  await page.exposeFunction("__xssHit", s=>{ xss=true; console.log("XSS!!",s); });
  await page.addInitScript(()=>{ window.alert=x=>window.__xssHit("alert:"+x); });
  await page.goto("file:///home/claude/ghostwreck/artifact.html");
  await page.waitForTimeout(2000);
  await page.click("#btnNew").catch(()=>{});
  await page.waitForTimeout(400);
  for (let i=0;i<6;i++){ await page.click("#introOverlay").catch(()=>{}); await page.waitForTimeout(250); }
  await page.click("#deckOverlay").catch(()=>{});
  await page.waitForTimeout(400);
  // ensure no overlay open, then inject malicious journal entries and open journal
  await page.evaluate(()=>{
    try{ UI.closeOverlays(); }catch(e){}
    Game.state.journal.push({ title:"<img src=x onerror=window.__xssHit('journal-title')>TITLE", author:"a", day:1,
      text:"<script>window.__xssHit('journal-text')</script><img src=y onerror=window.__xssHit('journal-text-img')> & \"quotes\" <b>bold</b>", deck:"<i>DECK</i>" });
  });
  await page.click("#btnJournal");
  await page.waitForTimeout(1500);
  const info = await page.evaluate(()=>({
    open: document.getElementById("journalOverlay").classList.contains("show"),
    scriptEl: !!document.querySelector("#journalBody script"),
    imgOnerr: !!document.querySelector("#journalBody img"),
    boldEl: !!document.querySelector("#journalBody .jtext b"),
    titleImg: !!document.querySelector("#journalBody .jtitle img"),
    html: document.getElementById("journalBody").innerHTML.slice(0,600)
  }));
  console.log("XSS_FIRED:", xss);
  console.log(JSON.stringify(info,null,1));
  await page.screenshot({ path:"/home/claude/ghostwreck/test/shots/pt_inputs_journal2.png" });
  await browser.close();
})();
