const { chromium } = require("playwright");

const SHOTS = "/home/claude/ghostwreck/test/shots/";
const results = [];
const pageErrors = [];
const consoleErrors = [];

function log(...a){ console.log(...a); }

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on("pageerror", e => { pageErrors.push(String(e)); log("PAGEERROR:", String(e)); });
  page.on("console", m => { if (m.type()==="error") { consoleErrors.push(m.text()); log("CONSOLE.ERROR:", m.text()); } });
  // detect XSS execution
  await page.exposeFunction("__xssHit", (src) => { results.push({ xss: src }); log("!!! XSS EXECUTED from", src); });
  await page.addInitScript(() => { window.alert = (x) => { window.__xssHit("alert:"+x); }; window.$ = window.$ || (id=>document.getElementById(id)); });

  await page.goto("file:///home/claude/ghostwreck/artifact.html");
  await page.waitForTimeout(1500);

  // wait for LM to load
  log("waiting for LM.isLoaded...");
  for (let i=0;i<120;i++){
    const loaded = await page.evaluate(()=> (typeof LM!=="undefined" && LM.isLoaded) ? true : false).catch(()=>false);
    if (loaded) { log("LM loaded after", i, "s"); break; }
    await page.waitForTimeout(1000);
  }

  // Start game
  await page.click("#btnNew").catch(()=>{});
  await page.waitForTimeout(600);
  // intro click-through x4
  for (let i=0;i<6;i++){ await page.click("#introOverlay").catch(()=>{}); await page.waitForTimeout(500); }
  // dismiss deck overlay
  await page.click("#deckOverlay").catch(()=>{});
  await page.waitForTimeout(500);
  await page.screenshot({ path: SHOTS+"pt_inputs_00_start.png" });

  const XSS1 = "<script>alert(1)</script>";
  const XSS2 = "<img src=x onerror=alert(2)>";
  const LONG = "A".repeat(240);
  const EMOJI = "hello 😀🔥👾 world";
  const CJK = "你好世界 こんにちは 안녕하세요";
  const NEWLINES = "line one\nline two\r\nline three\ttabbed";

  async function snap(name){ await page.screenshot({ path: SHOTS+"pt_inputs_"+name+".png" }); }

  // Helper: open a voice door via teleport
  async function openDoor(){
    const ok = await page.evaluate(()=>{
      // find a door across decks
      for (let d=0; d<6; d++){
        try { gotoDeck(d); } catch(e){}
        const e = Game.deck && Game.deck.entities.find(x=>x.type==="echodoor");
        if (e){ Game.state.px=(e.x)*32+16; Game.state.py=(e.y+1)*32+16; Game.nearEntity=e; Game.onInteract(e); return {deck:d, persona:e.persona}; }
      }
      return null;
    });
    return ok;
  }

  // ---- DOOR INPUT ----
  log("\n=== DOOR INPUT ===");
  const dinfo = await openDoor();
  log("door:", JSON.stringify(dinfo));
  await page.waitForTimeout(800);
  await snap("10_door_open");
  const doorVisible = await page.isVisible("#doorInput").catch(()=>false);
  log("doorInput visible:", doorVisible);

  async function doorSubmit(text, label){
    try {
      await page.fill("#doorInput", text);
      await page.click("#doorSpeak");
      await page.waitForTimeout(text===""?800:6000);
      const verdict = await page.textContent("#doorVerdict").catch(()=>null);
      const echo = await page.textContent("#doorEchoLine").catch(()=>null);
      const html = await page.evaluate(()=> ({v: $("doorVerdict") && $("doorVerdict").innerHTML, e: $("doorEchoLine") && $("doorEchoLine").innerHTML, hint: $("doorHint") && $("doorHint").innerHTML}) ).catch(()=>({}));
      log(`[door ${label}] verdict="${(verdict||'').slice(0,60)}" echoLen=${(echo||'').length}`);
      // check for raw <script tag rendered as element
      const scriptInDom = await page.evaluate(()=> document.querySelector("#doorOverlay script, #doorOverlay img[onerror]") ? true : false);
      if (scriptInDom) log(`  !! door ${label}: injected element present in DOM`);
      return {verdict, echo, html, scriptInDom};
    } catch(e){ log(`[door ${label}] ERROR`, e.message); return {err:e.message}; }
  }

  // empty submit
  await doorSubmit("", "empty");
  // reopen if closed
  if (!(await page.isVisible("#doorInput").catch(()=>false))) { await openDoor(); await page.waitForTimeout(500); }
  await doorSubmit(XSS1, "xss-script");
  if (!(await page.isVisible("#doorInput").catch(()=>false))) { await openDoor(); await page.waitForTimeout(500); }
  await snap("11_door_xss");
  await doorSubmit(XSS2, "xss-img");
  if (!(await page.isVisible("#doorInput").catch(()=>false))) { await openDoor(); await page.waitForTimeout(500); }
  await doorSubmit(LONG, "long240");
  if (!(await page.isVisible("#doorInput").catch(()=>false))) { await openDoor(); await page.waitForTimeout(500); }
  await doorSubmit(EMOJI, "emoji");
  if (!(await page.isVisible("#doorInput").catch(()=>false))) { await openDoor(); await page.waitForTimeout(500); }
  await doorSubmit(CJK, "cjk");
  if (!(await page.isVisible("#doorInput").catch(()=>false))) { await openDoor(); await page.waitForTimeout(500); }
  await doorSubmit(NEWLINES, "newlines");

  // rapid double submit + submit while streaming
  log("\n=== DOOR rapid/streaming ===");
  if (!(await page.isVisible("#doorInput").catch(()=>false))) { await openDoor(); await page.waitForTimeout(500); }
  await page.fill("#doorInput", "I am the one who remembers you");
  await page.click("#doorSpeak");
  await page.waitForTimeout(150);
  // immediately click again several times
  for (let i=0;i<4;i++){ await page.click("#doorSpeak").catch(()=>{}); await page.waitForTimeout(80); }
  await page.waitForTimeout(6000);
  const drapidVerdict = await page.textContent("#doorVerdict").catch(()=>null);
  const drapidEcho = await page.textContent("#doorEchoLine").catch(()=>null);
  log("[door rapid] verdict=", (drapidVerdict||'').slice(0,60), " echoLen=", (drapidEcho||'').length);
  await snap("12_door_rapid");

  // submit-while-streaming: fire, then during stream fire a different text
  if (!(await page.isVisible("#doorInput").catch(()=>false))) { await openDoor(); await page.waitForTimeout(500); }
  await page.fill("#doorInput", "First voice speaking now");
  await page.click("#doorSpeak");
  await page.waitForTimeout(1200);
  await page.fill("#doorInput", "Second interrupts mid stream").catch(()=>{});
  await page.click("#doorSpeak").catch(()=>{});
  await page.waitForTimeout(6000);
  const dstreamEcho = await page.textContent("#doorEchoLine").catch(()=>null);
  log("[door stream-interrupt] echo=", (dstreamEcho||'').slice(0,120));
  await snap("13_door_streaminterrupt");

  await page.click("#doorClose").catch(()=>{});
  await page.waitForTimeout(400);

  // ---- INTERCOM ----
  log("\n=== INTERCOM INPUT ===");
  async function openCom(){
    return await page.evaluate(()=>{
      for (let d=0; d<6; d++){
        try { gotoDeck(d); } catch(e){}
        const e = Game.deck && Game.deck.entities.find(x=>x.type==="intercom");
        if (e){ Game.state.px=(e.x)*32+16; Game.state.py=(e.y+1)*32+16; Game.nearEntity=e; Game.onInteract(e); return {deck:d}; }
      }
      return null;
    });
  }
  const cinfo = await openCom();
  log("intercom:", JSON.stringify(cinfo));
  await page.waitForTimeout(600);
  const comVisible = await page.isVisible("#comInput").catch(()=>false);
  log("comInput visible:", comVisible);
  await snap("20_com_open");

  async function comSubmit(text, label){
    try {
      if (!(await page.isVisible("#comInput").catch(()=>false))) { await openCom(); await page.waitForTimeout(400); }
      await page.fill("#comInput", text);
      await page.click("#comSpeak");
      await page.waitForTimeout(text===""?800:6000);
      const logHtml = await page.evaluate(()=> $("comLog") ? $("comLog").innerHTML : null);
      const scriptInDom = await page.evaluate(()=> document.querySelector("#comLog script, #comLog img[onerror]") ? true : false);
      log(`[com ${label}] logLen=${(logHtml||'').length} scriptInDom=${scriptInDom}`);
      if (scriptInDom) log(`  !! com ${label}: injected element present`);
      return {logHtml, scriptInDom};
    } catch(e){ log(`[com ${label}] ERROR`, e.message); return {err:e.message}; }
  }
  await comSubmit("", "empty");
  const cx1 = await comSubmit(XSS1, "xss-script");
  await snap("21_com_xss");
  await comSubmit(XSS2, "xss-img");
  await comSubmit(LONG, "long240");
  await comSubmit(EMOJI, "emoji");
  await comSubmit(CJK, "cjk");
  await comSubmit(NEWLINES, "newlines");
  // rapid double
  if (!(await page.isVisible("#comInput").catch(()=>false))) { await openCom(); await page.waitForTimeout(400); }
  await page.fill("#comInput", "rapid intercom test one");
  for (let i=0;i<5;i++){ await page.click("#comSpeak").catch(()=>{}); await page.waitForTimeout(70); }
  await page.waitForTimeout(6000);
  await snap("22_com_rapid");
  const comRapidLog = await page.evaluate(()=> $("comLog") ? $("comLog").innerText : null);
  log("[com rapid] innerText len=", (comRapidLog||'').length);
  await page.click("#comClose").catch(()=>{});
  await page.waitForTimeout(400);

  // ---- PROBE (THE MIND) ----
  log("\n=== PROBE INPUT ===");
  // open about/mind panel
  const probeOpened = await page.evaluate(()=>{
    // close any open overlay first, then open mind panel via HUD
    try { UI.closeOverlays(); } catch(e){}
    const btn = document.getElementById("btnAboutHud");
    if (btn) { btn.click(); return "clicked btnAboutHud"; }
    const pi = document.getElementById("probeInput");
    if (pi){ let o = pi.closest(".overlay"); if(o){ o.classList.add("show"); return "forced show "+o.id; } }
    return "not found";
  });
  log("probe panel:", probeOpened);
  await page.waitForTimeout(500);
  const probeVisible = await page.isVisible("#probeInput").catch(()=>false);
  log("probeInput visible:", probeVisible);
  await snap("30_probe_open");

  async function probeSubmit(text, label){
    try {
      await page.evaluate((t)=>{ const pi=document.getElementById("probeInput"); pi.value=t; }, text);
      await page.click("#probeBtn").catch(async()=>{ await page.evaluate(()=>runProbe()); });
      await page.waitForTimeout(4000);
      const barsHtml = await page.evaluate(()=> $("probeBars") ? $("probeBars").innerHTML : null);
      const scriptInDom = await page.evaluate(()=> document.querySelector("#probeBars script, #probeBars img[onerror]") ? true : false);
      log(`[probe ${label}] barsLen=${(barsHtml||'').length} scriptInDom=${scriptInDom}`);
      if (scriptInDom) log(`  !! probe ${label}: injected element present`);
      return {barsHtml, scriptInDom};
    } catch(e){ log(`[probe ${label}] ERROR`, e.message); return {err:e.message}; }
  }
  if (probeVisible){
    await probeSubmit("", "empty");
    await probeSubmit(XSS1, "xss-script");
    await probeSubmit(XSS2, "xss-img");
    await probeSubmit(LONG, "long240");
    await probeSubmit(EMOJI, "emoji");
    await probeSubmit(CJK, "cjk");
    // rapid
    await page.evaluate(()=>{ document.getElementById("probeInput").value="The garden is"; });
    for (let i=0;i<5;i++){ await page.click("#probeBtn").catch(()=>{}); await page.waitForTimeout(60); }
    await page.waitForTimeout(4000);
    await snap("31_probe_rapid");
  }

  // ---- FINALE ----
  log("\n=== FINALE INPUT ===");
  const finOpened = await page.evaluate(()=>{
    for (let d=5; d>=0; d--){
      try { gotoDeck(d); } catch(e){}
      const e = Game.deck && Game.deck.entities.find(x=>x.type==="corealtar" || x.type==="finale" || (x.type && x.type.includes("altar")));
      if (e){ Game.state.px=(e.x)*32+16; Game.state.py=(e.y+1)*32+16; Game.nearEntity=e; try{ Game.onInteract(e); }catch(err){ return {err:String(err)}; } return {deck:d, type:e.type}; }
    }
    return null;
  });
  log("finale:", JSON.stringify(finOpened));
  await page.waitForTimeout(800);
  let finVisible = await page.isVisible("#finaleInput").catch(()=>false);
  log("finaleInput visible:", finVisible);
  await snap("40_finale_open");

  async function finaleSubmit(text, label){
    try {
      if (!(await page.isVisible("#finaleInput").catch(()=>false))) return {skipped:true};
      await page.fill("#finaleInput", text);
      await page.click("#finaleSpeak");
      await page.waitForTimeout(text===""?800:6000);
      const scriptInDom = await page.evaluate(()=> document.querySelector("#finaleOverlay script, #finaleOverlay img[onerror]") ? true : false);
      const bodyHtml = await page.evaluate(()=> $("finaleOverlay") ? $("finaleOverlay").innerText.length : null);
      log(`[finale ${label}] innerTextLen=${bodyHtml} scriptInDom=${scriptInDom}`);
      if (scriptInDom) log(`  !! finale ${label}: injected element present`);
      return {scriptInDom};
    } catch(e){ log(`[finale ${label}] ERROR`, e.message); return {err:e.message}; }
  }
  if (finVisible){
    await finaleSubmit("", "empty");
    await finaleSubmit(XSS1, "xss-script");
    await snap("41_finale_xss");
    await finaleSubmit(EMOJI, "emoji");
    await finaleSubmit(LONG, "long240");
    // rapid on finale
    if (await page.isVisible("#finaleInput").catch(()=>false)){
      await page.fill("#finaleInput", "rapid finale answer here").catch(()=>{});
      for (let i=0;i<4;i++){ await page.click("#finaleSpeak").catch(()=>{}); await page.waitForTimeout(70); }
      await page.waitForTimeout(6000);
      await snap("42_finale_rapid");
    }
  }

  // ---- JOURNAL XSS render check (verify inert everywhere) ----
  log("\n=== JOURNAL CHECK ===");
  // inject a journal entry with malicious text directly into state, then render
  await page.evaluate((xss)=>{
    Game.state.journal.push({ title: "<b>t"+xss, author:"a", text: xss + " <img src=x onerror=window.__xssHit&&window.__xssHit('journal')>", deck:"TEST" });
  }, XSS1);
  await page.click("#btnJournal").catch(async()=>{ await page.evaluate(()=>document.getElementById("journalOverlay").classList.add("show")); });
  await page.waitForTimeout(1000);
  const journalScript = await page.evaluate(()=> document.querySelector("#journalBody script, #journalBody img[onerror]") ? true : false);
  const journalHtml = await page.evaluate(()=> $("journalBody") ? $("journalBody").innerHTML.slice(0,400) : null);
  log("[journal] injectedElementPresent=", journalScript);
  log("[journal] html sample:", journalHtml);
  await snap("50_journal");

  await page.waitForTimeout(1500);
  log("\n=== SUMMARY ===");
  log("pageErrors:", pageErrors.length);
  log("consoleErrors:", consoleErrors.length);
  log("xssHits:", JSON.stringify(results));
  console.log("PAGEERRORS_JSON="+JSON.stringify(pageErrors));
  console.log("CONSOLEERRORS_JSON="+JSON.stringify(consoleErrors));

  await browser.close();
})();
