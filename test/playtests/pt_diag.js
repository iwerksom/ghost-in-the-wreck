const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on("pageerror", e => console.log("PAGEERROR:", String(e)));
  await page.goto("file:///home/claude/ghostwreck/artifact.html");
  await page.waitForTimeout(2000);
  for (let i=0;i<40;i++){
    const st = await page.evaluate(()=>({ hasLM: typeof LM, loaded: (typeof LM!=="undefined")?LM.isLoaded:null, status: (document.getElementById("loadstatus")||{}).textContent }));
    console.log(i, JSON.stringify(st));
    if (st.loaded) break;
    await page.waitForTimeout(1000);
  }
  // Start game & inspect all deck door/intercom entities
  await page.click("#btnNew").catch(()=>{});
  await page.waitForTimeout(500);
  for (let i=0;i<6;i++){ await page.click("#introOverlay").catch(()=>{}); await page.waitForTimeout(300); }
  await page.click("#deckOverlay").catch(()=>{});
  await page.waitForTimeout(400);
  const ents = await page.evaluate(()=>{
    const out={};
    for (let d=0; d<6; d++){ try{ gotoDeck(d);}catch(e){} out[d]=(Game.deck&&Game.deck.entities||[]).map(e=>({type:e.type,persona:e.persona,label:e.label})); }
    return out;
  });
  console.log("ENTITIES:", JSON.stringify(ents,null,1));
  // Try opening a door and check overlay
  const r = await page.evaluate(()=>{
    for (let d=0; d<6; d++){ try{ gotoDeck(d);}catch(e){}
      const e=Game.deck.entities.find(x=>x.type==="door");
      if(e){ Game.state.px=e.x*32+16; Game.state.py=(e.y+1)*32+16; Game.nearEntity=e; Game.onInteract(e);
        return {deck:d, doorOverlayShown: document.getElementById("doorOverlay").classList.contains("show"), inputVisible: !document.getElementById("doorInput").offsetParent===false }; }
    }
    return null;
  });
  await page.waitForTimeout(500);
  const dv = await page.isVisible("#doorInput").catch(()=>null);
  console.log("DOOR OPEN RESULT:", JSON.stringify(r), "isVisible#doorInput=", dv);
  await page.screenshot({ path: "/home/claude/ghostwreck/test/shots/pt_inputs_diag.png" });
  await browser.close();
})();
