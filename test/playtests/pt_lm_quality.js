const { chromium } = require("playwright");
const fs = require("fs");

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on("pageerror", e => errors.push("pageerror: " + e.message));
  page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });

  await page.goto("file:///home/claude/ghostwreck/artifact.html");
  // wait for LM to load
  await page.waitForFunction(() => typeof LM !== "undefined" && LM.isLoaded, null, { timeout: 120000 });

  // start a game so Game.state exists
  await page.click("#btnNew");
  await page.waitForTimeout(500);
  for (let i = 0; i < 4; i++) { try { await page.click("#introOverlay", { timeout: 2000 }); await page.waitForTimeout(300); } catch (e) { break; } }
  try { await page.click("#deckOverlay", { timeout: 3000 }); } catch (e) {}
  await page.waitForTimeout(500);

  const loaded = await page.evaluate(() => LM.isLoaded);
  console.log("LM.isLoaded:", loaded);

  const out = { lmLoaded: loaded, logs: {}, echo: [], judge: [], errors };

  // ---- 1. logs: 4 per author ----
  const crew = ["REYNE", "CHO", "OKAFOR", "VEGA", "KIT"];
  for (const author of crew) {
    out.logs[author] = [];
    for (let i = 0; i < 4; i++) {
      const r = await page.evaluate(async ([a, k]) => await Story.generateLog(a, k), [author, "test" + i]);
      out.logs[author].push(r);
      console.log(`[LOG ${author} #${i} day ${r.day}] ${r.text}`);
      fs.writeFileSync("/home/claude/ghostwreck/test/pt_lm_quality.json", JSON.stringify(out, null, 2));
    }
  }

  // ---- 2. echo replies ----
  const lines = [
    "Hello? Is anyone there?",
    "What happened to the crew?",
    "Where is Captain Reyne?",
    "The crew are all dead. You know that, right?",
    "Can you open the doors for me?",
    "Are you ECHO? What are you?",
    "I'm running out of oxygen and I'm scared.",
    "xkcd fnord blorp zzzt qwertyuiop 12345"
  ];
  for (const l of lines) {
    const r = await page.evaluate(async (t) => await Story.echoReply(t), l);
    out.echo.push({ player: l, echo: r });
    console.log(`[PLAYER] ${l}\n[ECHO] ${r}`);
    fs.writeFileSync("/home/claude/ghostwreck/test/pt_lm_quality.json", JSON.stringify(out, null, 2));
  }

  // ---- 3. persona judging: 3 imitations per crew member ----
  const imitations = [
    // REYNE - captain, duty, watch, crew, orders
    ["REYNE", "Second watch complete. Crew accounted for. I hold the bridge until every one of them is safe. Reyne out."],
    ["REYNE", "Protocol says abandon the deck. My order stands: no one leaves until the whole crew is counted."],
    ["REYNE", "I have kept the watch for three hundred days. My crew, my responsibility, my final duty."],
    // CHO - engines, reactor, the old girl
    ["CHO", "Torqued the coolant manifold back into line. The old girl sang one low note when the reactor steadied."],
    ["CHO", "Reactor feed is running rough again. I will hold the levers by hand if that is what she needs."],
    ["CHO", "Spent the night in Engineering listening to the hum. Engines talk if you know how to listen."],
    // OKAFOR - medic, patients, vitals, doses
    ["OKAFOR", "Checked vitals on the whole crew this morning. Doses logged, saline stocked. Everyone sleeps easier."],
    ["OKAFOR", "A medic keeps his voice level. Patients hear fear before they hear words."],
    ["OKAFOR", "Two patients in the medbay tonight. I sat with them until their breathing slowed and they slept."],
    // VEGA - stars, charts, parallax, the Reach
    ["VEGA", "Ran the parallax sweep twice. The charts do not lie: we are four light years off the surveyed lane."],
    ["VEGA", "The stars over the Reach drifted a tenth of a degree tonight. I logged every one of them."],
    ["VEGA", "Updated the star charts before dinner. Navigation is just patience and good light."],
    // KIT - plants, garden, seeds, lamps
    ["KIT", "The tomato seedlings unfurled two new leaves today. I misted the ferns and left the lamps on for them."],
    ["KIT", "Something green is growing in tray nine. The garden smells like rain this morning."],
    ["KIT", "Watered Bea and Old Tom, thinned the seedlings, logged the soil. The plants are patient with me."],
  ];
  for (const [expected, text] of imitations) {
    const r = await page.evaluate(async (t) => {
      const j = await Story.judgeVoice(t);
      const probs = {};
      for (const k in j.probs) probs[k] = +j.probs[k].toFixed(3);
      return { best: j.best, bestProb: +j.bestProb.toFixed(3), intelligible: j.intelligible, probs };
    }, text);
    out.judge.push({ expected, text, ...r, correct: r.best === expected });
    console.log(`[JUDGE exp=${expected} got=${r.best} p=${r.bestProb} ok=${r.best === expected}] ${text}`);
    fs.writeFileSync("/home/claude/ghostwreck/test/pt_lm_quality.json", JSON.stringify(out, null, 2));
  }

  // gibberish gate check on judgeVoice too
  const gib = await page.evaluate(async () => {
    const j = await Story.judgeVoice("zzxq vlorp wjkkk trrrb mnop qqq");
    return { best: j.best, bestProb: +j.bestProb.toFixed(3), intelligible: j.intelligible, tokRatio: j.tokRatio };
  });
  out.judgeGibberish = gib;
  console.log("[JUDGE gibberish]", JSON.stringify(gib));

  out.errors = errors;
  fs.writeFileSync("/home/claude/ghostwreck/test/pt_lm_quality.json", JSON.stringify(out, null, 2));
  await browser.close();
  console.log("DONE");
})().catch(e => { console.error("FATAL", e); process.exit(1); });
