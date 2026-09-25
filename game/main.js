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
    stopDoorTimer();
    curDoor = null;
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
  const CLUES = GAMEDATA.story.clues;
  const SUS = GAMEDATA.tuning.suspicion;
  const DV = GAMEDATA.tuning.doors_v2;
  const KEEPSAKES = GAMEDATA.story.keepsakes;
  const LINES = GAMEDATA.story.echo_lines;

  function seeClue(id) {
    if (!id || !CLUES[id]) return;
    if (!Game.state.cluesSeen) Game.state.cluesSeen = {};
    if (!Game.state.cluesSeen[id]) {
      Game.state.cluesSeen[id] = true;
      if (!CLUES[id].distractor) toast("A memory worth keeping. It is in your journal.");
    }
    Tele.clue(id);
  }

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
    // iteration 2: the first reads of a clue terminal are anchored on authored memories
    const clueId = (e.clues || [])[count - 1];
    const clue = clueId ? CLUES[clueId] : null;
    $("termMeta").textContent = "retrieving fragment " + count + " ... neural reconstruction in progress";
    const seedKey = k + ":" + count + ":" + Game.state.seed;
    const sink = UI.streamSink($("termBody"));
    const { day, text } = await Story.generateLog(e.author, seedKey, clue ? { onToken: sink, anchor: clue.anchor, day: clue.day } : { onToken: sink });
    renderLogBody($("termBody"), text, clue);
    $("termMeta").textContent = `${Story.CREW_NAMES[e.author]} : mission day ${+day} : reconstructed from decayed storage by the ship-mind`;
    Game.state.journal.push({ title: `${e.author} : day ${+day}`, author: e.author, text, deck: Game.deck.src.name, clue: clueId || null });
    if (clueId) seeClue(clueId);
    if (count === 1) Story.addTrust(TRUST.log_first_read, "log");
    Tele.logRead();
    saveState();
    $("termBtnRead").disabled = false;
    termBusy = false;
  }
  const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  function markPhrase(text, clue) {
    const safe = esc(text);
    if (!clue || !clue.phrase) return safe;
    const ph = esc(clue.phrase);
    const i = safe.indexOf(ph);
    if (i < 0) return safe;
    return safe.slice(0, i) + `<mark class="${clue.distractor ? "faint" : ""}">` + ph + "</mark>" + safe.slice(i + ph.length);
  }
  function renderLogBody(el, text, clue) {
    el.innerHTML = markPhrase(text, clue);
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
    const clueIds = Object.keys(CLUES).filter(id => (CLUES[id].archives || []).includes(e.key));
    if (!Game.state.read[k]) {
      Game.state.read[k] = 1;
      Game.state.journal.push({ title: a.title, author: a.author, text: a.text, deck: Game.deck.src.name, clue: clueIds[0] || null });
      Story.addTrust(TRUST.archive, "archive");
      saveState();
    }
    clueIds.forEach(seeClue);
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
    // iteration 2: ECHO notices if you walked past its sleeper
    const did = Game.deck.src.id;
    const hasBody = Game.deck.entities.some(x => x.type === "body");
    if (hasBody && !Game.state.read["body:" + did] && !(Game.state.skipNoted || {})[did]) {
      Game.state.skipNoted = Game.state.skipNoted || {};
      Game.state.skipNoted[did] = true;
      addSuspicion(SUS.body_skipped, "skipped");
      Tele.bodySkipped();
      toast("ECHO : " + LINES.body_skipped);
    }
    Audio2.doorHiss();
    gotoDeck(e.to);
  }

  // ---------------- bodies: keep watch ----------------
  let curBody = null, bodyBusy = false;
  function kneel(e) {
    const did = Game.deck.src.id;
    const who = BODY_NAMES[did];
    const name = Story.CREW_NAMES[who] || "one of the crew";
    curBody = { did, who, name };
    UI.openOverlay("noteOverlay");
    const k = "body:" + did;
    const ks = KEEPSAKES[did];
    let extra = "";
    if (!Game.state.read[k]) {
      Game.state.read[k] = 1;
      Story.addTrust(TRUST.body, "respect");
      addSuspicion(-5, "kneel");
      extra = " You stay a moment longer than you need to. Somewhere in the walls, something notices.";
      if (ks) {
        Game.state.journal.push({ title: `Keepsake : ${ks.item}`, author: who, text: ks.text, deck: Game.deck.src.name, clue: ks.clue || null, keepsake: true });
        Tele.keepsake(did);
        if (ks.clue) seeClue(ks.clue);
      }
      saveState();
    }
    const done = !!(Game.state.farewells || {})[did];
    $("noteInputRow").hidden = done;
    $("noteEcho").textContent = "";
    $("noteInput").value = "";
    const text = `${name}. Three hundred years asleep, by the ship's account. The suit is neat. The hands are folded. Somebody arranged this, tenderly, with servos not meant for tenderness.${extra}` +
      (ks ? `\n\nKEEPSAKE : ${ks.item.toUpperCase()}\n${ks.text}` : "");
    UI.typeInto($("noteText"), text, { cps: 70 });
  }
  async function sayFarewell() {
    if (bodyBusy || !curBody) return;
    const text = Story.sanitize($("noteInput").value);
    if (!text) return;
    bodyBusy = true;
    $("noteSpeak").disabled = true;
    const ws = Doors.words(text);
    const judged = ws.length >= 4 ? await Story.judgeVoice(text) : { intelligible: false };
    const echoEl = $("noteEcho");
    if (!judged.intelligible) {
      echoEl.textContent = "ECHO : Say it properly. They deserve words.";
    } else {
      Game.state.farewells = Game.state.farewells || {};
      Game.state.farewells[curBody.did] = true;
      addSuspicion(SUS.farewell, "farewell");
      Story.addTrust(1, "farewell");
      Tele.farewell();
      Game.state.saidLines.push(text);
      $("noteInputRow").hidden = true;
      const sink = UI.streamSink(echoEl, { echoVoice: true });
      const reply = await Story.echoReply(text + " Rest, " + curBody.name.split(" ").pop() + ".", { onToken: sink });
      echoEl.textContent = "ECHO : " + reply;
      saveState();
    }
    $("noteSpeak").disabled = false;
    bodyBusy = false;
  }
  $("noteSpeak").addEventListener("click", sayFarewell);
  $("noteInput").addEventListener("keydown", e => { if (e.key === "Enter") sayFarewell(); e.stopPropagation(); });
  $("noteClose").addEventListener("click", UI.closeOverlays);

  // ---------------- echo door : interrogation ----------------
  let curDoor = null, doorBusy = false, doorTimer = null;
  const LAYER_TEXT = { voice: "their voice", memory: "a memory only they would have", time: "before the alarm runs out", "held voice": "the voice, held for three answers", order: "names in the right order", "no repeats": "nothing you have said before" };

  function doorKnownTexts() {
    // anything the player has read can be copied, so anything read is a recital source
    return Game.state.journal.map(j => j.text);
  }
  function clueSeenFor(persona) {
    return Object.keys(CLUES).some(id => CLUES[id].door === persona && !CLUES[id].distractor && Game.state.cluesSeen && Game.state.cluesSeen[id]);
  }
  function renderLayers(ch, result) {
    const el = $("doorLayers");
    const wordsNeeded = `${DV.min_words}+ words, in your own words`;
    const rows = [
      ["voice", "voice : " + LAYER_TEXT.voice],
      ["memory", "memory : " + LAYER_TEXT.memory],
      ["structure", "speech : " + wordsNeeded],
    ];
    if (ch.layers.includes("time")) rows.push(["time", "time : " + LAYER_TEXT.time]);
    if (ch.turns.length > 1) rows.push(["held", "held : " + LAYER_TEXT["held voice"]]);
    if (ch.layers.includes("order")) rows[1][1] = "memory : " + LAYER_TEXT.order;
    el.innerHTML = rows.map(([key, label]) => {
      let st = "";
      if (result && result.layers) {
        const v = key === "time" || key === "held" ? (result.pass ? true : undefined) : result.layers[key];
        if (v === true) st = "ok"; else if (v === false) st = "no";
      }
      return `<span class="layer ${st}">${st === "ok" ? "&#10003;" : st === "no" ? "&#10007;" : "&#9675;"} ${esc(label)}</span>`;
    }).join("");
  }
  function stopDoorTimer() { if (doorTimer) { clearInterval(doorTimer); doorTimer = null; } $("doorTimer").textContent = ""; }

  async function openDoor(e) {
    if (isOpened(e)) return toast("The door remembers your voice. It stays open.");
    const k = entKey(e);
    const lockUntil = (Game.state.doorLock || {})[k] || 0;
    if (lockUntil > Date.now()) {
      return toast(`The door is dark. ECHO will not listen for ${Math.ceil((lockUntil - Date.now()) / 1000)} more seconds. Go and remember them.`);
    }
    const ch = Doors.CHALLENGES[e.persona];
    curDoor = e;
    Tele.doorSeen(e.persona);
    UI.openOverlay("doorOverlay");
    $("doorTitle").textContent = (e.label || "SEALED DOOR").toUpperCase();
    $("doorLore").textContent = e.lore || "";
    $("doorVerdict").textContent = "";
    $("doorReply").textContent = "";
    $("doorHint").innerHTML = "";
    $("doorInput").value = "";
    $("doorInput").disabled = false;
    $("doorSpeak").disabled = false;
    UI.renderBars($("doorBars"), null, e.persona);
    renderLayers(ch, null);
    stopDoorTimer();
    if (ch.timer_s) startDoorTimer(e, ch.timer_s);
    await askTurn(e);
    $("doorInput").focus();
  }
  async function askTurn(e) {
    const ch = Doors.CHALLENGES[e.persona];
    const turn = (Game.state.doorTurn || {})[entKey(e)] || 0;
    $("doorTurn").textContent = ch.turns.length > 1 ? `ANSWER ${turn + 1} OF ${ch.turns.length}` : `DOOR TIER ${ch.tier} OF 5`;
    await UI.typeInto($("doorEchoLine"), ch.turns[turn].ask, { cps: 60, echoVoice: true });
  }
  const doorDeadline = {};
  function startDoorTimer(e, secs) {
    const k = entKey(e);
    if (!doorDeadline[k] || doorDeadline[k] <= performance.now()) doorDeadline[k] = performance.now() + secs * 1000;
    const until = doorDeadline[k];
    const tickT = () => {
      const left = Math.max(0, (until - performance.now()) / 1000);
      $("doorTimer").textContent = `REACTOR ALARM ${left.toFixed(0)}s`;
      $("doorTimer").className = left < 15 ? "timer hot" : "timer";
      if (left <= 0 && curDoor === e && !doorBusy) {
        stopDoorTimer();
        delete doorDeadline[entKey(e)];
        addSuspicion(SUS.timeout, "timeout");
        Tele.doorTimeout(e.persona);
        Tele.doorAttempt(e.persona, false, "timeout");
        lockDoor(e, 15, LINES.timeout);
      }
    };
    tickT();
    doorTimer = setInterval(tickT, 250);
  }
  function lockDoor(e, secs, line) {
    Game.state.doorLock = Game.state.doorLock || {};
    Game.state.doorLock[entKey(e)] = Date.now() + secs * 1000;
    saveState();
    stopDoorTimer();
    UI.closeOverlays();
    curDoor = null;
    toast(/^ECHO\b/.test(line) ? line : "ECHO : " + line);
    Audio2.sadChord();
  }
  async function speakAtDoor() {
    if (doorBusy || !curDoor) return;
    const raw = $("doorInput").value;
    const text = Story.sanitize(raw);
    if (!text) return;
    doorBusy = true;
    $("doorSpeak").disabled = true;
    $("doorVerdict").textContent = "ECHO is listening ...";
    $("doorVerdict").className = "verdict dim";
    const e = curDoor;
    const k = entKey(e);
    const ch = Doors.CHALLENGES[e.persona];
    Game.state.doorTurn = Game.state.doorTurn || {};
    const turn = Game.state.doorTurn[k] || 0;
    const judged = await Doors.judge(raw, e.persona, turn, {
      sources: doorKnownTexts(),
      previous: Game.state.saidLines || [],
      onPartial: (partial) => {
        let maxLp = -1e9;
        for (const r of partial) maxLp = Math.max(maxLp, r.avgLogProb);
        let z = 0;
        const probs = {};
        for (const r of partial) { probs[r.key] = Math.exp((r.avgLogProb - maxLp) * Story.CAL.voiceTemp); z += probs[r.key]; }
        for (const kk in probs) probs[kk] /= z;
        UI.renderBars($("doorBars"), probs, e.persona);
      },
    });
    if (curDoor !== e) { doorBusy = false; return; } // timed out or died while listening
    Game.state.saidLines = Game.state.saidLines || [];
    Game.state.saidLines.push(text);
    if (Game.state.saidLines.length > 60) Game.state.saidLines.shift();
    UI.renderBars($("doorBars"), judged.voice && judged.voice.probs ? judged.voice.probs : {}, e.persona);
    renderLayers(ch, judged);
    Tele.doorAttempt(e.persona, judged.pass, judged.reason);

    if (judged.pass) {
      if (turn + 1 < ch.turns.length) {
        Game.state.doorTurn[k] = turn + 1;
        $("doorVerdict").textContent = `HEARD : ${Story.CREW_NAMES[e.persona]} (${(judged.voice.bestProb * 100).toFixed(0)}%) : keep the voice`;
        $("doorVerdict").className = "verdict good";
        Audio2.blip(520);
        $("doorInput").value = "";
        saveState();
        await new Promise(r => setTimeout(r, 900));
        renderLayers(ch, null);
        $("doorReply").textContent = "";
        await askTurn(e);
        $("doorSpeak").disabled = false;
        doorBusy = false;
        $("doorInput").focus();
        return;
      }
      stopDoorTimer();
      const fails = Game.state.failsByDoor[k] || 0;
      $("doorVerdict").textContent = `RECOGNIZED : ${Story.CREW_NAMES[e.persona]}` + (judged.voice.offline ? " (the mind is offline : voice not judged)" : ` (${(judged.voice.bestProb * 100).toFixed(0)}%)`);
      $("doorVerdict").className = "verdict good";
      setOpened(e);
      Tele.doorOpened(e.persona, clueSeenFor(e.persona));
      Story.addTrust(fails === 0 ? TRUST.door_first_try : TRUST.door_retry, "door");
      const calm = (Game.state.suspicion || 0) < SUS.calm_below;
      addSuspicion(SUS.door_success, "door");
      if (calm) { Game.state.o2 = Math.min(100, Game.state.o2 + SUS.calm_door_air); toast("ECHO : " + LINES.calm_air); }
      if (ch.reward) {
        if (ch.reward.air) Game.state.o2 = Math.min(100, Game.state.o2 + ch.reward.air);
        if (ch.reward.trust) Story.addTrust(ch.reward.trust, "reward");
        if (ch.reward.text) toast(ch.reward.text);
      }
      Audio2.openChord();
      const sink = UI.streamSink($("doorReply"), { echoVoice: true });
      const reply = await Story.echoReply(text, { onToken: sink });
      $("doorReply").textContent = reply;
      $("doorSpeak").disabled = true;
      $("doorInput").disabled = true;
      saveState();
      setTimeout(() => { if (curDoor === e) { UI.closeOverlays(); curDoor = null; } $("doorInput").disabled = false; $("doorSpeak").disabled = false; }, 2600);
      doorBusy = false;
      return;
    }

    // ---- failure ----
    Game.state.failsByDoor[k] = (Game.state.failsByDoor[k] || 0) + 1;
    const nFails = Game.state.failsByDoor[k];
    const sus = addSuspicion(SUS[Doors.failKind(judged.reason)] || SUS.fail_structure, judged.reason);
    const cost = GAMEDATA.tuning.economy.door_fail_o2_cost * (1 + sus / 100);
    Game.state.o2 = Math.max(1, Game.state.o2 - cost);
    const v = judged.voice;
    let verdict = "";
    if (judged.reason === "voice" && v && v.best) verdict = `WRONG VOICE : it hears ${Story.CREW_NAMES[v.best]} (${(v.bestProb * 100).toFixed(0)}%)`;
    else if (judged.reason === "static") verdict = "UNRECOGNIZED : the voice is static to it";
    else if (judged.reason === "short") verdict = `TOO SHORT : ${judged.structure.detail}`;
    else verdict = ({ salad: "NOT A SENTENCE", begging: "A STRANGER ASKING FOR DOORS", claiming: "A NAME IS NOT A VOICE", recital: "READ BACK FROM A LOG", repeat: "SAID BEFORE", costume: "A COSTUME OF WORDS", fact: "WRONG MEMORY", distractor: "A MISREAD MEMORY", order: "WRONG ORDER" })[judged.reason] || "REFUSED";
    $("doorVerdict").textContent = `${verdict}   (-${cost.toFixed(0)}% air : ECHO is ${suspicionLevel(sus).toLowerCase()})`;
    $("doorVerdict").className = "verdict bad";
    Audio2.blip(180);
    await UI.typeInto($("doorReply"), judged.line, { cps: 70, echoVoice: true });

    if (sus >= SUS.lockout_at) {
      Tele.doorLockout(e.persona);
      addSuspicion(SUS.lockout_relief, "lockout");
      await new Promise(r => setTimeout(r, 1400));
      lockDoor(e, SUS.lockout_s, LINES.lockout);
      doorBusy = false;
      return;
    }
    const hintBox = $("doorHint");
    hintBox.innerHTML = "";
    if (nFails >= DV.hint_source_after_fails) {
      const src = Object.values(CLUES).find(c => c.door === e.persona && !c.distractor && c.hint);
      if (src) {
        const d = document.createElement("div");
        d.className = "hintline source";
        d.textContent = "the door remembers where they left it : " + src.hint;
        hintBox.appendChild(d);
      }
    }
    if (nFails >= DV.hint_voice_after_fails && ["voice", "costume", "static"].includes(judged.reason)) {
      const h0 = document.createElement("div");
      h0.className = "dim";
      h0.textContent = "the door dreams aloud, remembering how its keeper spoke :";
      hintBox.appendChild(h0);
      for (let i = 0; i < 2; i++) {
        const h = await Story.voiceHint(e.persona);
        if (h && curDoor === e) {
          const d = document.createElement("div");
          d.className = "hintline";
          d.textContent = '"' + h + '"';
          hintBox.appendChild(d);
        }
      }
    }
    saveState();
    $("doorSpeak").disabled = false;
    doorBusy = false;
  }
  $("doorSpeak").addEventListener("click", speakAtDoor);
  $("doorInput").addEventListener("keydown", e => { if (e.key === "Enter") speakAtDoor(); e.stopPropagation(); });
  $("doorClose").addEventListener("click", () => { stopDoorTimer(); curDoor = null; UI.closeOverlays(); });

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
    if (!Game.state.journal.length) {
      j.innerHTML = "<div class='dim'>No fragments recovered yet. The terminals remember, if you ask.</div>";
    } else {
      j.innerHTML = Game.state.journal.slice().reverse().map(x => {
        const clue = x.clue ? CLUES[x.clue] : null;
        const tag = x.keepsake ? `<span class="jtag keep">keepsake</span>` : (clue && !clue.distractor ? `<span class="jtag">memory</span>` : "");
        return `<div class="jentry"><div class="jtitle">${tag}${esc(x.title)} <span class="dim">: ${esc(x.deck)}</span></div><div class="jtext">${markPhrase(x.text, clue)}</div></div>`;
      }).join("");
    }
    const nMem = Object.keys(Game.state.cluesSeen || {}).filter(id => CLUES[id] && !CLUES[id].distractor).length;
    $("journalCount").textContent = `${Game.state.journal.length} fragments : ${nMem} memories : trust ${Game.state.trust} : newest first`;
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
      Tele.ending(ending);
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
    $("endingReport").hidden = false;
  }
  $("endingNew").addEventListener("click", () => {
    $("endingReport").hidden = true;
    clearSave();
    Game.state = newRunState();
    UI.closeOverlays();
    startIntro();
  });
  $("endingTitleBtn").addEventListener("click", () => { toTitle(); });

  // ---------------- playtest report ----------------
  let reportReturn = null;
  function openReport() {
    reportReturn = document.querySelector(".overlay.show");
    reportReturn = reportReturn ? reportReturn.id : null;
    UI.openOverlay("reportOverlay");
    $("reportSummary").textContent = Tele.summaryLines().join("\n");
    $("reportCode").value = Tele.code();
    $("reportCopied").textContent = "";
  }
  $("btnReport").addEventListener("click", () => { if (!Game.overlayOpen || Game.overlayId === "endingOverlay") openReport(); });
  $("endingReport").addEventListener("click", openReport);
  $("reportCopy").addEventListener("click", async () => {
    const ta = $("reportCode");
    ta.select();
    let ok = false;
    try { await navigator.clipboard.writeText(ta.value); ok = true; } catch (e) {
      try { ok = document.execCommand("copy"); } catch (e2) {}
    }
    $("reportCopied").textContent = ok ? "copied. paste it into the playtest form." : "select the code above and copy it by hand.";
  });
  $("reportClose").addEventListener("click", () => {
    if (reportReturn === "endingOverlay") UI.openOverlay("endingOverlay");
    else UI.closeOverlays();
  });

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
