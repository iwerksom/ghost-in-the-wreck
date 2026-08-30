// ============================================================================
// ui.js — HUD, overlays, typewriter, touch controls.
// ============================================================================
"use strict";

const UI = (() => {
  const $ = id => document.getElementById(id);
  let typeCancel = null;

  // ---------------- typewriter ----------------
  async function typeInto(el, text, opts = {}) {
    if (typeCancel) typeCancel();
    let cancelled = false;
    typeCancel = () => { cancelled = true; };
    el.textContent = "";
    const cps = opts.cps || 55;
    for (let i = 0; i < text.length; i++) {
      if (cancelled) { el.textContent = text; return; }
      el.textContent += text[i];
      if (opts.echoVoice && i % 5 === 0) Audio2.echoVoiceTick();
      else if (!opts.silent && i % 3 === 0) Audio2.typeTick();
      if (el.scrollHeight > el.clientHeight) el.scrollTop = el.scrollHeight;
      await new Promise(r => setTimeout(r, 1000 / cps));
    }
    typeCancel = null;
  }

  function skipType() { if (typeCancel) typeCancel(); }

  // stream tokens into an element (used with LM onToken)
  let sinkGen = 0;
  function streamSink(el, opts = {}) {
    el.textContent = "";
    let n = 0;
    const myGen = ++sinkGen;
    return piece => {
      if (myGen !== sinkGen) return; // a newer stream superseded this one
      el.textContent += piece;
      n++;
      if (opts.echoVoice) { if (n % 2 === 0) Audio2.echoVoiceTick(); }
      else if (n % 2 === 0) Audio2.typeTick();
      if (el.scrollHeight > el.clientHeight) el.scrollTop = el.scrollHeight;
    };
  }

  // ---------------- overlay plumbing ----------------
  function openOverlay(id) {
    Game.overlayOpen = true;
    document.querySelectorAll(".overlay").forEach(o => o.classList.remove("show"));
    $(id).classList.add("show");
  }
  function closeOverlays() {
    document.querySelectorAll(".overlay").forEach(o => o.classList.remove("show"));
    Game.overlayOpen = false;
    Game.keys = {};
  }

  // ---------------- HUD ----------------
  function updateHUD() {
    const s = Game.state;
    if (!s) return;
    $("o2fill").style.width = Math.max(0, s.o2) + "%";
    $("o2fill").style.background = s.o2 < 30 ? "linear-gradient(90deg,#ff4b4b,#ff9560)" : "linear-gradient(90deg,#57c7ff,#8ef0e0)";
    $("deckname").textContent = Game.deck ? Game.deck.src.name.toUpperCase() : "";
    $("cells").textContent = s.cells;
    $("trustv").textContent = s.trust;
    const ne = Game.nearEntity;
    const ib = $("interactBtn");
    if (ne && !Game.overlayOpen) {
      ib.classList.add("show");
      ib.textContent = ({
        terminal: "READ " + (ne.label || "TERMINAL"), archive: "PLAY " + (ne.label || "RECORDER"),
        socket: "POWER " + (ne.label || "SOCKET"), lift: ne.label || "LIFT",
        echodoor: "SPEAK : " + (ne.label || "SEALED DOOR"), intercom: "SPEAK : INTERCOM",
        body: "KNEEL", corealtar: "APPROACH THE LIGHT", hangar: "HANGAR",
      })[ne.type] || "INTERACT";
    } else ib.classList.remove("show");
    // toasts
    const tc = $("toasts");
    for (const t of Game.toasts) {
      if (!t.el) {
        t.el = document.createElement("div");
        t.el.className = "toast";
        t.el.textContent = t.text;
        tc.appendChild(t.el);
        setTimeout(() => { t.el.classList.add("fade"); }, 2800);
        setTimeout(() => { t.el.remove(); }, 4000);
      }
    }
    Game.toasts = Game.toasts.filter(t => !t.el || t.el.isConnected);
  }
  setInterval(updateHUD, 120);

  // ---------------- subtitle (ambient ECHO) ----------------
  let subBusy = false;
  async function showSubtitle(text) {
    if (subBusy || !text) return;
    subBusy = true;
    const el = $("subtitle");
    el.classList.add("show");
    $("subwho").textContent = "ECHO";
    await typeInto($("subtext"), text, { cps: 34, echoVoice: true });
    await new Promise(r => setTimeout(r, 2600));
    el.classList.remove("show");
    subBusy = false;
  }

  // ---------------- probability bars ----------------
  function renderBars(container, probs, target) {
    container.innerHTML = "";
    for (const c of Story.CREW) {
      const row = document.createElement("div");
      row.className = "barrow";
      const p = probs && probs[c] !== undefined ? probs[c] : 0;
      row.innerHTML = `<span class="barname ${target === c ? "target" : ""}">${c}</span>
        <span class="bartrack"><span class="barfill" style="width:${(p * 100).toFixed(1)}%"></span></span>
        <span class="barpct">${(p * 100).toFixed(0)}%</span>`;
      container.appendChild(row);
    }
  }

  // ---------------- touch controls ----------------
  function initTouch() {
    const zone = $("joyzone"), knob = $("joyknob");
    let anchor = null;
    const setJoy = (dx, dy) => { Game.joy.dx = dx; Game.joy.dy = dy; Game.joy.active = true; };
    zone.addEventListener("touchstart", e => {
      const t = e.changedTouches[0];
      anchor = { x: t.clientX, y: t.clientY, id: t.identifier };
      zone.classList.add("live");
      e.preventDefault();
    }, { passive: false });
    zone.addEventListener("touchmove", e => {
      if (!anchor) return;
      for (const t of e.changedTouches) {
        if (t.identifier !== anchor.id) continue;
        let dx = (t.clientX - anchor.x) / 40, dy = (t.clientY - anchor.y) / 40;
        const m = Math.hypot(dx, dy);
        if (m > 1) { dx /= m; dy /= m; }
        setJoy(dx, dy);
        knob.style.transform = `translate(${dx * 26}px,${dy * 26}px)`;
      }
      e.preventDefault();
    }, { passive: false });
    const end = e => {
      anchor = null; Game.joy.active = false; Game.joy.dx = Game.joy.dy = 0;
      knob.style.transform = "";
      zone.classList.remove("live");
    };
    zone.addEventListener("touchend", end);
    zone.addEventListener("touchcancel", end);
    $("interactBtn").addEventListener("click", () => {
      if (Game.nearEntity && Game.onInteract && !Game.overlayOpen) Game.onInteract(Game.nearEntity);
    });
    if ("ontouchstart" in window) document.body.classList.add("touch");
  }

  // ---------------- title / loading ----------------
  function showTitle(hasSave) {
    openOverlay("titleOverlay");
    $("btnContinue").style.display = hasSave ? "inline-block" : "none";
  }
  function setLoadStatus(t) { $("loadstatus").textContent = t; }

  return {
    $, typeInto, skipType, streamSink, openOverlay, closeOverlays, updateHUD,
    showSubtitle, renderBars, initTouch, showTitle, setLoadStatus,
  };
})();
if (typeof module !== "undefined") module.exports = UI;
