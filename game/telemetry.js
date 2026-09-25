// ============================================================================
// telemetry.js — playtest instrumentation (iteration 2 prototype).
//
// Everything stays on the player's device inside the save. The PLAYTEST
// REPORT button shows a summary and a code the tester pastes into the
// playtest form. Nothing is sent anywhere.
// ============================================================================
"use strict";

const Tele = (() => {
  const BUILD = "iter2-proto-1";

  function blank() {
    return {
      v: 1, build: BUILD, started: new Date().toISOString(),
      playSec: 0, decks: {}, doors: {}, logsRead: 0, cluesSeen: [], keepsakes: [],
      farewells: 0, bodiesSkipped: 0, deaths: 0, suspicionPeak: 0, lockouts: 0,
      under15: 0, ending: null, lastDeck: null,
    };
  }
  const T = () => {
    if (!Game.state) return blank();
    if (!Game.state.tele) Game.state.tele = blank();
    return Game.state.tele;
  };
  const deck = id => {
    const t = T();
    if (!t.decks[id]) t.decks[id] = { sec: 0, minO2: 100, deaths: 0, entries: 0 };
    return t.decks[id];
  };
  const door = p => {
    const t = T();
    if (!t.doors[p]) t.doors[p] = { attempts: 0, fails: {}, firstSeenSec: null, openedSec: null, secToOpen: null, cluesSeenAtOpen: null, lockouts: 0, timeouts: 0 };
    return t.doors[p];
  };

  let wasUnder15 = false;
  function tick(dt, o2, suspicion) {
    const t = T();
    t.playSec += dt;
    if (Game.deck) {
      const d = deck(Game.deck.src.id);
      d.sec += dt;
      d.minO2 = Math.min(d.minO2, o2);
    }
    if (o2 < 15 && !wasUnder15) { t.under15++; wasUnder15 = true; }
    if (o2 >= 25) wasUnder15 = false;
    t.suspicionPeak = Math.max(t.suspicionPeak, suspicion || 0);
  }
  function deckEnter(id) { deck(id).entries++; T().lastDeck = id; }
  function death() { const t = T(); t.deaths++; if (Game.deck) deck(Game.deck.src.id).deaths++; }
  function doorSeen(p) { const d = door(p); if (d.firstSeenSec === null) d.firstSeenSec = Math.round(T().playSec); }
  function doorAttempt(p, pass, reason) {
    const d = door(p);
    d.attempts++;
    if (!pass && reason) d.fails[reason] = (d.fails[reason] || 0) + 1;
  }
  function doorOpened(p, clueSeen) {
    const d = door(p), t = T();
    d.openedSec = Math.round(t.playSec);
    d.secToOpen = d.firstSeenSec === null ? null : d.openedSec - d.firstSeenSec;
    d.cluesSeenAtOpen = clueSeen;
  }
  function doorLockout(p) { door(p).lockouts++; T().lockouts++; }
  function doorTimeout(p) { door(p).timeouts++; }
  function logRead() { T().logsRead++; }
  function clue(id) { const t = T(); if (!t.cluesSeen.includes(id)) t.cluesSeen.push(id); }
  function keepsake(id) { const t = T(); if (!t.keepsakes.includes(id)) t.keepsakes.push(id); }
  function farewell() { T().farewells++; }
  function bodySkipped() { T().bodiesSkipped++; }
  function ending(key) { T().ending = key; }

  function report() {
    const t = JSON.parse(JSON.stringify(T()));
    t.playSec = Math.round(t.playSec);
    for (const k in t.decks) { t.decks[k].sec = Math.round(t.decks[k].sec); t.decks[k].minO2 = Math.round(t.decks[k].minO2); }
    t.trust = Game.state ? Game.state.trust : 0;
    t.suspicionPeak = Math.round(t.suspicionPeak);
    t.seed = Game.state ? Game.state.seed : null;
    t.reportedAt = new Date().toISOString();
    return t;
  }
  function code() {
    const json = JSON.stringify(report());
    // base64 of utf-8, prefixed so the form can recognise it
    return "GITW2:" + btoa(unescape(encodeURIComponent(json)));
  }

  function summaryLines() {
    const r = report();
    const mm = s => `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
    const lines = [`play time ${mm(r.playSec)}   deaths ${r.deaths}   lowest air moments (<15%) ${r.under15}`];
    for (const [id, d] of Object.entries(r.decks)) lines.push(`deck ${id.padEnd(6)} ${mm(d.sec).padStart(8)}   lowest air ${String(d.minO2).padStart(3)}%   deaths ${d.deaths}`);
    for (const [p, d] of Object.entries(r.doors)) {
      const fails = Object.entries(d.fails).map(([k, v]) => `${k} ${v}`).join(", ") || "none";
      lines.push(`door ${p.padEnd(7)} tries ${d.attempts}   ${d.openedSec !== null ? "opened after " + mm(d.secToOpen || 0) : "not opened"}   misses: ${fails}`);
    }
    lines.push(`logs read ${r.logsRead}   memories found ${r.cluesSeen.length}   keepsakes ${r.keepsakes.length}   farewells ${r.farewells}   sleepers passed by ${r.bodiesSkipped}`);
    lines.push(`suspicion peak ${r.suspicionPeak}   lockouts ${r.lockouts}   trust ${r.trust}   ending ${r.ending || "not reached"}`);
    return lines;
  }

  return { BUILD, blank, tick, deckEnter, death, doorSeen, doorAttempt, doorOpened, doorLockout, doorTimeout, logRead, clue, keepsake, farewell, bodySkipped, ending, report, code, summaryLines };
})();
if (typeof module !== "undefined") module.exports = Tele;
