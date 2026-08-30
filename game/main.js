// ============================================================================
// main.js — boots the game and wires every interaction to the ship-mind.
// ============================================================================
"use strict";

(function () {
  const $ = UI.$;
  const BODY_NAMES = GAMEDATA.story.body_names;
  const TRUST = GAMEDATA.tuning.trust;
  const DOORS = GAMEDATA.tuning.doors;

  // ------------------------------------------------------------ model boot
  function bootModel() {
    if (typeof MODEL_PACK === "undefined" || typeof TOKENIZER === "undefined") {
      UI.setLoadStatus("ship-mind offline : running in echoless mode");
      return;
    }
    UI.setLoadStatus("waking the ship-mind ...");
    setTimeout(() => {
      try {
        const t0 = performance.now();
        LM.load(MODEL_PACK, TOKENIZER);
        const n = MODEL_PACK.manifest.reduce((a, t) => a + t.shape.reduce((x, y) => x * y, 1), 0);
        UI.setLoadStatus(`ship-mind online : ${(n / 1e6).toFixed(1)}M parameters in ${((performance.now() - t0) / 1000).toFixed(1)}s`);
        $("aboutParams").textContent = (n / 1e6).toFixed(2) + " million";
      } catch (e) {
        UI.setLoadStatus("ship-mind damaged : " + e.message);
      }
    }, 60);
  }

  // ------------------------------------------------------------ title flow
  function toTitle() {
    UI.showTitle(!!loadState());
  }

  $("btnNew").addEventListener("click", () => {
    Audio2.ensure();
    clearSave();
    Game.state = newRunState();
    startIntro();
  });
  $("btnContinue").addEventListener("click", () => {
    Audio2.ensure();
    Game.state = loadState() || newRunState();
    UI.closeOverlays();
    beginPlay(true);
  });
  $("btnAbout").addEventListener("click", () => UI.openOverlay("aboutOverlay"));
  $("aboutClose").addEventListener("click", toTitle);
  $("btnAboutHud").addEventListener("click", () => { if (!Game.overlayOpen) UI.openOverlay("aboutOverlay"); });

  // about probe
  $("probeBtn").addEventListener("click", runProbe);
  $("probeInput").addEventListener("keydown", e => { if (e.key === "Enter") runProbe(); e.stopPropagation(); });
  async function runProbe() {
    const t = $("probeInput").value || "The garden is";
    $("probeBars").innerHTML = "<div class='dim'>forward pass ...</div>";
    const top = await LM.probe(t, 6);
    if (!top) { $("probeBars").innerHTML = "<div class='dim'>the mind is offline</div>"; return; }
    $("probeBars").innerHTML = top.map(o =>
      `<div class="barrow"><span class="barname">"${(o.str || "?").replace(/</g, "&lt;").replace(/\n/g, "\\n")}"</span>
       <span class="bartrack"><span class="barfill" style="width:${(o.prob * 100).toFixed(1)}%"></span></span>
       <span class="barpct">${(o.prob * 100).toFixed(1)}%</span></div>`).join("");
  }

  // ------------------------------------------------------------ intro
  const INTRO = GAMEDATA.story.intro;
  let introIdx = 0;
  function startIntro() {
    introIdx = 0;
    UI.openOverlay("introOverlay");
    nextIntro();
  }
  async function nextIntro() {
    if (introIdx >= INTRO.length) {
      UI.closeOverlays();
      beginPlay(false);
      return;
    }
    await UI.typeInto($("introText"), INTRO[introIdx++], { cps: 45 });
  }
  $("introOverlay").addEventListener("click", () => { UI.skipType(); setTimeout(nextIntro, 80); });

  function beginPlay(cont) {
    gotoDeck(Game.state.deckIdx, cont);
    if (cont) { Game.state.px = Game.deck.spawn.x * 32 + 16; Game.state.py = Game.deck.spawn.y * 32 + 16; }
    Game.paused = false;
  }

  // ------------------------------------------------------------ deck entry
  Game.onDeckEnter = (deck, first) => {
    UI.openOverlay("deckOverlay");
    $("deckTitle").textContent = deck.src.name.toUpperCase();
    UI.typeInto($("deckText"), deck.src.intro, { cps: 50 });
    Game.paused = true;
  };
  $("deckOverlay").addEventListener("click", async () => {
    UI.skipType();
    UI.closeOverlays();
    Game.paused = false;
    if (Game.deck.idx === 0 && !Game.state.firstContactDone) {
      Game.state.firstContactDone = true;
      saveState();
      for (const line of Story.FIRST_CONTACT) {
        await UI.showSubtitle(line);
      }
    }
  });

  // ------------------------------------------------------------ ambient
  Game.onAmbient = async () => {
    const key = Game.deck.src.id + ":amb:" + ((Game.time / 45) | 0) + ":" + ((Math.random() * 1e6) | 0);
    const line = await Story.echoAmbient(key);
    if (line && !Game.overlayOpen) UI.showSubtitle(line);
  };

  // ------------------------------------------------------------ death
  Game.onDeath = () => {
    setTimeout(async () => {
      UI.openOverlay("deathOverlay");
      await UI.typeInto($("deathText"), GAMEDATA.story.death_text, { cps: 45 });
    }, 1400);
  };
  $("deathWake").addEventListener("click", () => {
    UI.closeOverlays();
    respawn();
  });

  // ------------------------------------------------------------ interactions
  Game.onInteract = e => {
    Audio2.ensure();
    switch (e.type) {
      case "terminal": return openTerminal(e);
      case "archive": return openArchive(e);
      case "socket": return useSocket(e);
      case "lift": return useLift(e);
      case "echodoor": return openDoor(e);
      case "intercom": return openIntercom(e);
      case "body": return kneel(e);
      case "corealtar": return startFinale();
      case "hangar": return toast("The hangar answers only to the Core. Speak to the light.");
    }
  };

  // ---------------- terminal ----------------
  let curTerm = null, termBusy = false;
  function openTerminal(e) {
    curTerm = e;
    UI.openOverlay("termOverlay");
    $("termTitle").textContent = (e.label || "TERMINAL") + " : " + Story.CREW_NAMES[e.author];
    $("termBody").textContent = "";
    $("termMeta").textContent = "";
    readEntry();
  }
  async function readEntry() {
    if (termBusy || !curTerm) return;
    termBusy = true;
    $("termBtnRead").disabled = true;
    const e = curTerm;
    const k = entKey(e);
    const count = (Game.state.read[k] || 0) + 1;
    Game.state.read[k] = count;
    $("termMeta").textContent = "retrieving fragment " + count + " ... neural reconstruction in progress";
    const seedKey = k + ":" + count + ":" + Game.state.seed;
    const sink = UI.streamSink($("termBody"));
    const { day, text } = await Story.generateLog(e.author, seedKey, { onToken: sink });
    $("termBody").textContent = text;
    $("termMeta").textContent = `${Story.CREW_NAMES[e.author]} : mission day ${+day} : reconstructed from decayed storage by the ship-mind`;
    Game.state.journal.push({ title: `${e.author} : day ${+day}`, author: e.author, text, deck: Game.deck.src.name });
    if (count === 1) Story.addTrust(TRUST.log_first_read, "log");
    saveState();
    $("termBtnRead").disabled = false;
    termBusy = false;
  }
  $("termBtnRead").addEventListener("click", readEntry);
  $("termBtnStatus").addEventListener("click", async () => {
    if (termBusy) return;
    termBusy = true;
    $("termMeta").textContent = "ship systems ...";
    const sink = UI.streamSink($("termBody"));
    const line = await Story.sysLine(entKey(curTerm) + ":sys:" + ((Math.random() * 1e6) | 0));
    $("termBody").textContent = line;
    $("termMeta").textContent = "live broadcast : composed by the ship-mind just now";
    termBusy = false;
  });
  $("termClose").addEventListener("click", UI.closeOverlays);

  // ---------------- archive ----------------
  async function openArchive(e) {
    const a = Story.ARCHIVES[e.key];
    if (!a) return;
    UI.openOverlay("termOverlay");
    curTerm = null;
    $("termTitle").textContent = (e.label || "RECORDER").toUpperCase();
    $("termMeta").textContent = `${Story.CREW_NAMES[a.author]} : day ${a.day} : intact recording`;
    $("termBtnRead").disabled = true;
    const k = "arch:" + e.key;
    if (!Game.state.read[k]) {
      Game.state.read[k] = 1;
      Game.state.journal.push({ title: a.title, author: a.author, text: a.text, deck: Game.deck.src.name });
      Story.addTrust(TRUST.archive, "archive");
      saveState();
    }
    await UI.typeInto($("termBody"), a.text, { cps: 55 });
  }

  // ---------------- socket / lift ----------------
  function useSocket(e) {
    if (isOpened(e)) return toast("The socket hums, fed and warm.");
    if (Game.state.cells <= 0) return toast("A dead socket. It wants a power cell.");
    Game.state.cells--;
    setOpened(e);
    Audio2.openChord();
    toast("Power restored. Somewhere, machinery remembers its purpose.");
  }
  function useLift(e) {
    if (!liftUnlocked(e)) {
      const msgs = {
        "socket": "The lift is dark. Its socket wants power.",
        "echodoor": "The lift waits on a door that only opens for a voice.",
        "echodoor+power": "The lift needs main power on both buses, and the hatch, and the hatch needs a voice.",
      };
      return toast(msgs[e.needs] || "Locked.");
    }
    Audio2.doorHiss();
    gotoDeck(e.to);
  }

  // ---------------- bodies ----------------
  function kneel(e) {
    const who = BODY_NAMES[Game.deck.src.id];
    const name = Story.CREW_NAMES[who] || "one of the crew";
    UI.openOverlay("noteOverlay");
    const k = "body:" + Game.deck.src.id;
    let extra = "";
    if (!Game.state.read[k]) { Game.state.read[k] = 1; Story.addTrust(TRUST.body, "respect"); extra = " You stay a moment longer than you need to. Somewhere in the walls, something notices."; }
    UI.typeInto($("noteText"),
      `${name}. Three hundred years asleep, by the ship's account. The suit is neat. The hands are folded. Somebody arranged this, tenderly, with servos not meant for tenderness.${extra}`, { cps: 50 });
  }
  $("noteClose").addEventListener("click", UI.closeOverlays);

  // ---------------- echo door ----------------
  let curDoor = null, doorBusy = false;
  async function openDoor(e) {
    if (isOpened(e)) return toast("The door remembers your voice. It stays open.");
    curDoor = e;
    UI.openOverlay("doorOverlay");
    $("doorTitle").textContent = (e.label || "SEALED DOOR").toUpperCase();
    $("doorLore").textContent = e.lore || "";
    $("doorVerdict").textContent = "";
    $("doorHint").innerHTML = "";
    $("doorInput").value = "";
    UI.renderBars($("doorBars"), null, e.persona);
    $("doorEchoLine").textContent = "";
    const sink = UI.streamSink($("doorEchoLine"), { echoVoice: true });
    const line = await Story.echoReply("I need this door open.", { seed: Story.seedFrom(entKey(e) + ":" + (Game.state.failsByDoor[entKey(e)] || 0)), onToken: sink });
    $("doorEchoLine").textContent = line;
    $("doorInput").focus();
  }
  async function speakAtDoor() {
    if (doorBusy || !curDoor) return;
    const text = Story.sanitize($("doorInput").value);
    if (!text) return;
    doorBusy = true;
    $("doorSpeak").disabled = true;
    $("doorVerdict").textContent = "ECHO is listening ...";
    $("doorVerdict").className = "verdict dim";
    const e = curDoor;
    const judged = await Story.judgeVoice(text, {
      onPartial: (partial) => {
        // live partial softmax over the personas scored so far
        let maxLp = -1e9;
        for (const r of partial) maxLp = Math.max(maxLp, r.avgLogProb);
        let z = 0;
        const probs = {};
        for (const r of partial) { probs[r.key] = Math.exp((r.avgLogProb - maxLp) * Story.CAL.voiceTemp); z += probs[r.key]; }
        for (const kk in probs) probs[kk] /= z;
        UI.renderBars($("doorBars"), probs, e.persona);
      },
    });
    UI.renderBars($("doorBars"), judged.intelligible ? judged.probs : {}, e.persona);
    const k = entKey(e);
    const fails = Game.state.failsByDoor[k] || 0;
    const thresh = e.persona === "OKAFOR" ? Math.min(Story.CAL.doorThreshold, DOORS.okafor_threshold) : Story.CAL.doorThreshold;
    const win = judged.intelligible && judged.best === e.persona && judged.bestProb >= thresh;
    const sink = UI.streamSink($("doorEchoLine"), { echoVoice: true });
    if (win) {
      $("doorVerdict").textContent = `RECOGNIZED : ${Story.CREW_NAMES[e.persona]} (${(judged.bestProb * 100).toFixed(0)}%)`;
      $("doorVerdict").className = "verdict good";
      setOpened(e);
      Story.addTrust(fails === 0 ? TRUST.door_first_try : TRUST.door_retry, "door");
      Audio2.openChord();
      const reply = await Story.echoReply(text, { onToken: sink });
      $("doorEchoLine").textContent = reply;
      $("doorSpeak").disabled = true;
      $("doorInput").disabled = true;
      setTimeout(() => { UI.closeOverlays(); $("doorInput").disabled = false; $("doorSpeak").disabled = false; }, 2600);
    } else {
      Game.state.failsByDoor[k] = fails + 1;
      Game.state.o2 = Math.max(1, Game.state.o2 - GAMEDATA.tuning.economy.door_fail_o2_cost);
      if (!judged.intelligible) {
        $("doorVerdict").textContent = "UNRECOGNIZED : the voice is static to it";
        $("doorVerdict").className = "verdict bad";
      } else {
        $("doorVerdict").textContent = `WRONG VOICE : it hears ${Story.CREW_NAMES[judged.best]} (${(judged.bestProb * 100).toFixed(0)}%), the door wants ${Story.CREW_NAMES[e.persona]}`;
        $("doorVerdict").className = "verdict bad";
      }
      const reply = await Story.echoReply(text, { onToken: sink });
      $("doorEchoLine").textContent = reply;
      if (Game.state.failsByDoor[k] >= DOORS.hint_after_fails) {
        $("doorHint").innerHTML = "<div class='dim'>the door dreams aloud, remembering how its keeper spoke :</div>";
        for (let i = 0; i < 2; i++) {
          const h = await Story.voiceHint(e.persona);
          if (h) {
            const d = document.createElement("div");
            d.className = "hintline";
            d.textContent = '"' + h + '"';
            $("doorHint").appendChild(d);
          }
        }
      }
      saveState();
      $("doorSpeak").disabled = false;
    }
    doorBusy = false;
  }
  $("doorSpeak").addEventListener("click", speakAtDoor);
  $("doorInput").addEventListener("keydown", e => { if (e.key === "Enter") speakAtDoor(); e.stopPropagation(); });
  $("doorClose").addEventListener("click", UI.closeOverlays);

  // ---------------- intercom ----------------
  let comBusy = false;
  function openIntercom(e) {
    UI.openOverlay("comOverlay");
    $("comLog").innerHTML = "<div class='comecho dim'>The intercom crackles. Something on the other end leans closer.</div>";
    $("comInput").value = "";
    $("comInput").focus();
  }
  async function speakIntercom() {
    if (comBusy) return;
    const text = Story.sanitize($("comInput").value);
    if (!text) return;
    comBusy = true;
    $("comInput").value = "";
    const log = $("comLog");
    const you = document.createElement("div");
    you.className = "comyou";
    you.textContent = "YOU : " + text;
    log.appendChild(you);
    const el = document.createElement("div");
    el.className = "comecho";
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    const sink = piece => { el.textContent += piece; log.scrollTop = log.scrollHeight; Audio2.echoVoiceTick(); };
    el.textContent = "";
    const reply = await Story.echoReply(text, { onToken: sink });
    el.textContent = "ECHO : " + reply;
    // novelty & trust
    const norm = text.toLowerCase().replace(/[^a-z ]/g, "").trim();
    Game.state.talkLines = Game.state.talkLines || [];
    const novel = norm.length > 8 && !Game.state.talkLines.includes(norm);
    if (novel) Game.state.talkLines.push(norm);
    if (novel && Game.state.talkCount < TRUST.intercom_cap) { Game.state.talkCount++; Story.addTrust(TRUST.intercom_novel, "talk"); }
    // voiceprint readout
    const judged = await Story.judgeVoice(text);
    if (judged && judged.intelligible) {
      const vp = document.createElement("div");
      vp.className = "comvp dim";
      vp.textContent = `voiceprint : closest to ${Story.CREW_NAMES[judged.best]} (${(judged.bestProb * 100).toFixed(0)}%)`;
      log.appendChild(vp);
    }
    log.scrollTop = log.scrollHeight;
    saveState();
    comBusy = false;
  }
  $("comSpeak").addEventListener("click", speakIntercom);
  $("comInput").addEventListener("keydown", e => { if (e.key === "Enter") speakIntercom(); e.stopPropagation(); });
  $("comClose").addEventListener("click", UI.closeOverlays);

  // ---------------- journal ----------------
  $("btnJournal").addEventListener("click", () => {
    if (Game.overlayOpen) return;
    UI.openOverlay("journalOverlay");
    const j = $("journalBody");
    const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    if (!Game.state.journal.length) {
      j.innerHTML = "<div class='dim'>No fragments recovered yet. The terminals remember, if you ask.</div>";
    } else {
      j.innerHTML = Game.state.journal.map(x =>
        `<div class="jentry"><div class="jtitle">${esc(x.title)} <span class="dim">: ${esc(x.deck)}</span></div><div class="jtext">${esc(x.text)}</div></div>`).join("");
    }
    $("journalCount").textContent = Game.state.journal.length + " fragments : trust " + Game.state.trust;
  });
  $("journalClose").addEventListener("click", UI.closeOverlays);

  // ---------------- finale ----------------
  const FINALE_QS = GAMEDATA.story.finale_questions.map(q => ({ fixed: q }));
  const NAME_RE = new RegExp(GAMEDATA.story.name_regex, "i");
  let finaleStep = 0, finaleBusy = false;
  function startFinale() {
    if (Game.state.ended) { return showEnding(Game.state.ended, true); }
    finaleStep = 0;
    UI.openOverlay("finaleOverlay");
    $("finaleInput").value = "";
    askFinale();
  }
  async function askFinale() {
    $("finaleStep").textContent = "COMMUNION " + (finaleStep + 1) + " / 3";
    $("finaleReply").textContent = "";
    $("finaleSpeak").disabled = false;
    $("finaleInput").disabled = false;
    await UI.typeInto($("finaleQ"), FINALE_QS[finaleStep].fixed, { cps: 40, echoVoice: true });
    $("finaleInput").focus();
  }
  async function answerFinale() {
    if (finaleBusy) return;
    const text = Story.sanitize($("finaleInput").value);
    if (!text) return;
    finaleBusy = true;
    $("finaleSpeak").disabled = true;
    $("finaleInput").value = "";
    const sink = UI.streamSink($("finaleReply"), { echoVoice: true });
    Game.state.finaleAwards = Game.state.finaleAwards || {};
    const award = (key, n) => {
      if (!Game.state.finaleAwards[key]) { Game.state.finaleAwards[key] = 1; Story.addTrust(n, key); }
    };
    if (finaleStep === 0) {
      const judged = await Story.judgeVoice(text);
      if (judged.intelligible) award("communion", TRUST.communion);
      const r = await Story.echoReply(text, { onToken: sink });
      $("finaleReply").textContent = r;
    } else if (finaleStep === 1) {
      const named = NAME_RE.test(text);
      if (named) award("named", TRUST.named);
      const r = await Story.echoReply(text, { onToken: sink });
      $("finaleReply").textContent = r;
      if (!named) $("finaleReply").textContent += "  ... That is not a name I keep.";
    } else {
      $("finaleReply").textContent = "ECHO weighs your words against three hundred years ...";
      const lean = await Story.judgeIntent(text);
      const r = await Story.echoReply(text, { onToken: sink });
      $("finaleReply").textContent = r;
      const ending = Story.endingFor(lean);
      Game.state.ended = ending;
      saveState();
      setTimeout(() => showEnding(ending, false), 3200);
      finaleBusy = false;
      return;
    }
    finaleStep++;
    finaleBusy = false;
    $("finaleSpeak").disabled = false;
    setTimeout(askFinale, 2600);
  }
  $("finaleSpeak").addEventListener("click", answerFinale);
  $("finaleInput").addEventListener("keydown", e => { if (e.key === "Enter") answerFinale(); e.stopPropagation(); });

  async function showEnding(key, replay) {
    const E = Story.ENDINGS[key];
    UI.openOverlay("endingOverlay");
    $("endingTitle").textContent = "";
    $("endingBody").innerHTML = "";
    $("endingCoda").textContent = "";
    $("endingStats").textContent = "";
    Audio2.sadChord();
    await new Promise(r => setTimeout(r, 600));
    $("endingTitle").textContent = E.title;
    for (const f of E.frames) {
      const d = document.createElement("div");
      d.className = "eframe";
      $("endingBody").appendChild(d);
      await UI.typeInto(d, f, { cps: 48 });
      await new Promise(r => setTimeout(r, 700));
    }
    $("endingCoda").textContent = E.coda;
    $("endingStats").textContent = `fragments recovered : ${Game.state.journal.length}   |   trust earned : ${Game.state.trust}   |   run seed : ${Game.state.seed}`;
  }
  $("endingNew").addEventListener("click", () => {
    clearSave();
    Game.state = newRunState();
    UI.closeOverlays();
    startIntro();
  });
  $("endingTitleBtn").addEventListener("click", () => { toTitle(); });

  // ---------------- global keys ----------------
  window.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      const skip = ["titleOverlay", "endingOverlay", "introOverlay", "deckOverlay"];
      const open = document.querySelector(".overlay.show");
      if (open && !skip.includes(open.id)) UI.closeOverlays();
    }
    if ((e.key === "j" || e.key === "J") && !Game.overlayOpen) $("btnJournal").click();
    if (e.key === "m" || e.key === "M") { const m = Audio2.toggleMute(); toast(m ? "sound off" : "sound on"); }
  });
  // --- sound mixer panel ---
  function loadVolumes() {
    try {
      const v = JSON.parse(localStorage.getItem("gitw_vol") || "null");
      if (v) {
        Audio2.setVolume("master", v.master); Audio2.setVolume("ambience", v.ambience); Audio2.setVolume("ui", v.ui);
        $("volMaster").value = v.master * 100; $("volAmbience").value = v.ambience * 100; $("volUi").value = v.ui * 100;
      }
    } catch (e) {}
  }
  function saveVolumes() {
    try { localStorage.setItem("gitw_vol", JSON.stringify(Audio2.volumes)); } catch (e) {}
  }
  $("btnMute").addEventListener("click", () => $("soundPanel").classList.toggle("show"));
  [["volMaster", "master"], ["volAmbience", "ambience"], ["volUi", "ui"]].forEach(([id, ch]) => {
    $(id).addEventListener("input", e => { Audio2.setVolume(ch, e.target.value / 100); saveVolumes(); });
  });
  $("btnMuteAll").addEventListener("click", () => {
    const m = Audio2.toggleMute();
    $("btnMuteAll").textContent = m ? "UNMUTE" : "MUTE ALL";
  });
  document.addEventListener("click", e => {
    const p = $("soundPanel");
    if (p.classList.contains("show") && !p.contains(e.target) && e.target.id !== "btnMute") p.classList.remove("show");
  });
  loadVolumes();

  // ------------------------------------------------------------ boot
  initEngine(document.getElementById("game"));
  UI.initTouch();
  bootModel();
  Game.state = newRunState(); // placeholder until title choice
  Game.deck = parseDeck(0);
  Game.paused = true;
  toTitle();
})();
