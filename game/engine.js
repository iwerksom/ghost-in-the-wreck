// ============================================================================
// engine.js — rendering, movement, resources, interaction for Ghost in the Wreck
// ============================================================================
"use strict";

const TILE = 32;

const Game = {
  state: null,       // persistent run state
  deck: null,        // parsed current deck
  canvas: null, ctx: null, lightCv: null, lightCtx: null,
  keys: {}, joy: { active: false, dx: 0, dy: 0 },
  time: 0, last: 0, paused: true, overlayOpen: false,
  nearEntity: null, toasts: [], subtitle: null, particles: [],
  stars: [], flicker: 1, deathFade: 0, o2LowPulse: 0,
  onInteract: null, onDeckEnter: null, onAmbient: null, onDeath: null,
  ambientTimer: 40,
  shakeT: 0,
};

// ---------------------------------------------------------------- state
function newRunState() {
  return {
    deckIdx: 0, px: 0, py: 0,
    o2: 100, cells: 0, trust: 0,
    opened: {},          // "deckId:entChar" -> true
    collected: {},       // picked up P/O tiles "deckId:x,y" -> true
    journal: [],         // {title, author, day, text, deck}
    read: {},            // terminal reads count per key
    seed: (Math.random() * 1e9) | 0,
    visited: {}, ended: null, failsByDoor: {},
    talkCount: 0,
  };
}

function saveState() {
  try { localStorage.setItem("gitw_save", JSON.stringify(Game.state)); } catch (e) {}
}
function loadState() {
  try {
    const s = localStorage.getItem("gitw_save");
    if (s) return JSON.parse(s);
  } catch (e) {}
  return null;
}
function clearSave() { try { localStorage.removeItem("gitw_save"); } catch (e) {} }

// ---------------------------------------------------------------- deck parsing
function parseDeck(idx) {
  const src = DECKS[idx];
  const rows = src.map;
  const h = rows.length;
  const w = Math.max(...rows.map(r => r.length));
  const grid = [];        // 0 void,1 floor,2 wall,3 window,4 garden,5 hazard,6 debris
  const entities = [];
  let spawn = { x: 2, y: 2 };
  for (let y = 0; y < h; y++) {
    grid.push(new Array(w).fill(0));
    for (let x = 0; x < w; x++) {
      const ch = (rows[y] || "")[x] || " ";
      let t = 0;
      if (ch === " ") t = 0;
      else if (ch === "#" || ch === "%" || ch === "*") t = 2;
      else if (ch === "W") t = 3;
      else if (ch === "G") t = 4;
      else if (ch === "H") t = 5;
      else if (ch === "~") t = 6;
      else t = 1;
      grid[y][x] = t;
      if (ch === "S") spawn = { x, y };
      if (ch === "O" || ch === "P") {
        entities.push({ ch, x, y, type: ch === "O" ? "o2" : "cell", label: ch === "O" ? "Air Canister" : "Power Cell" });
      }
      if (ch === "B") entities.push({ ch, x, y, type: "body", label: "A Sleeper" });
      if (ch === "D") entities.push({ ch, x, y, type: "door", open: 0 });
      if (ch >= "1" && ch <= "9") {
        const meta = src.entities[ch];
        if (meta) entities.push(Object.assign({ ch, x, y }, meta));
      }
      if (ch === "%" ) entities.push({ ch, x, y, type: "crate" });
      if (ch === "*") entities.push({ ch, x, y, type: "reactor" });
    }
  }
  return { src, idx, grid, w, h, entities, spawn, hue: src.hue };
}

function solidAt(tx, ty) {
  const d = Game.deck;
  if (tx < 0 || ty < 0 || tx >= d.w || ty >= d.h) return true;
  const t = d.grid[ty][tx];
  if (t === 0 || t === 2 || t === 3) return true;
  // closed special doors occupy their tile
  for (const e of d.entities) {
    if (e.x === tx && e.y === ty) {
      if (e.type === "door" && e.open < 0.7) return true;
      if (e.type === "echodoor" && !isOpened(e)) return true;
      if (e.type === "lift" || e.type === "corealtar" || e.type === "hangar" ||
          e.type === "terminal" || e.type === "archive" || e.type === "socket" || e.type === "intercom") return true;
    }
  }
  return false;
}

function entKey(e) { return Game.deck.src.id + ":" + e.ch + ":" + e.x + "," + e.y; }
function isOpened(e) { return !!Game.state.opened[entKey(e)]; }
function setOpened(e) { Game.state.opened[entKey(e)] = true; saveState(); }

// ---------------------------------------------------------------- movement
function tryMove(dt) {
  let dx = 0, dy = 0;
  const k = Game.keys;
  if (k["ArrowLeft"] || k["a"] || k["A"]) dx -= 1;
  if (k["ArrowRight"] || k["d"] || k["D"]) dx += 1;
  if (k["ArrowUp"] || k["w"] || k["W"]) dy -= 1;
  if (k["ArrowDown"] || k["s"] || k["S"]) dy += 1;
  if (Game.joy.active) { dx += Game.joy.dx; dy += Game.joy.dy; }
  const mag = Math.hypot(dx, dy);
  if (mag > 1) { dx /= mag; dy /= mag; }
  if (mag > 0.01) {
    const s = Game.state;
    const SPEED = GAMEDATA.tuning.economy.player_speed;
    const R = 9;
    let nx = s.px + dx * SPEED * dt;
    let ny = s.py + dy * SPEED * dt;
    // axis-separated collision
    if (!circleHits(nx, s.py, R)) s.px = nx;
    if (!circleHits(s.px, ny, R)) s.py = ny;
    Game.walking = true;
  } else Game.walking = false;
}

function circleHits(cx, cy, r) {
  const minTx = Math.floor((cx - r) / TILE), maxTx = Math.floor((cx + r) / TILE);
  const minTy = Math.floor((cy - r) / TILE), maxTy = Math.floor((cy + r) / TILE);
  for (let ty = minTy; ty <= maxTy; ty++)
    for (let tx = minTx; tx <= maxTx; tx++) {
      if (!solidAt(tx, ty)) continue;
      const bx = Math.max(tx * TILE, Math.min(cx, tx * TILE + TILE));
      const by = Math.max(ty * TILE, Math.min(cy, ty * TILE + TILE));
      if ((cx - bx) ** 2 + (cy - by) ** 2 < r * r) return true;
    }
  return false;
}

// ---------------------------------------------------------------- systems tick
function tick(dt) {
  const s = Game.state;
  Game.time += dt;
  if (Game.overlayOpen || Game.paused) return;
  tryMove(dt);

  // tile effects
  const ECO = GAMEDATA.tuning.economy;
  const tx = Math.floor(s.px / TILE), ty = Math.floor(s.py / TILE);
  const t = (Game.deck.grid[ty] || [])[tx];
  let drain = 100 / ECO.o2_tank_seconds;
  if (t === 5) { drain += ECO.hazard_drain_per_s; Game.shakeT = 0.15; }
  if (t === 4) drain -= ECO.garden_regen_per_s;  // the garden still breathes
  s.o2 = Math.min(100, s.o2 - drain * dt);
  if (s.o2 <= 0) { s.o2 = 0; onPlayerDeath(); return; }

  // pickups
  for (const e of Game.deck.entities) {
    if ((e.type === "o2" || e.type === "cell") && !Game.state.collected[entKey(e)]) {
      const d2 = (e.x * TILE + 16 - s.px) ** 2 + (e.y * TILE + 16 - s.py) ** 2;
      if (d2 < 22 * 22) {
        Game.state.collected[entKey(e)] = true;
        if (e.type === "o2") { s.o2 = Math.min(100, s.o2 + GAMEDATA.tuning.economy.o2_canister); toast("Air canister. The tank drinks deep, half again fuller."); Audio2.blip(660); }
        else { s.cells++; toast("Power cell salvaged."); Audio2.blip(440); }
        saveState();
      }
    }
    if (e.type === "door") {
      const d2 = (e.x * TILE + 16 - s.px) ** 2 + (e.y * TILE + 16 - s.py) ** 2;
      const want = d2 < 52 * 52 ? 1 : 0;
      if (want > e.open && e.open === 0) Audio2.doorHiss();
      e.open += (want - e.open) * Math.min(1, dt * 4);
    }
  }

  // nearest interactable
  let best = null, bestD = 46 * 46;
  for (const e of Game.deck.entities) {
    if (!["terminal", "archive", "socket", "lift", "echodoor", "intercom", "body", "corealtar", "hangar"].includes(e.type)) continue;
    const d2 = (e.x * TILE + 16 - s.px) ** 2 + (e.y * TILE + 16 - s.py) ** 2;
    if (d2 < bestD) { bestD = d2; best = e; }
  }
  Game.nearEntity = best;

  // ambient ECHO speech
  Game.ambientTimer -= dt;
  if (Game.ambientTimer <= 0 && !Game.subtitle) {
    const AMB = GAMEDATA.tuning.ambient_interval_s;
    Game.ambientTimer = AMB[0] + Math.random() * (AMB[1] - AMB[0]);
    if (Game.onAmbient) Game.onAmbient();
  }

  // particles
  if (Math.random() < dt * 8) {
    Game.particles.push({
      x: s.px + (Math.random() - 0.5) * 300, y: s.py + (Math.random() - 0.5) * 200,
      vx: (Math.random() - 0.5) * 4, vy: (Math.random() - 0.5) * 4, life: 4 + Math.random() * 4,
    });
  }
  for (const p of Game.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
  Game.particles = Game.particles.filter(p => p.life > 0);
  Game.o2LowPulse = s.o2 < 30 ? Game.o2LowPulse + dt : 0;
  Audio2.setDanger(s.o2 < 30);
  Game.shakeT = Math.max(0, Game.shakeT - dt);
}

function onPlayerDeath() {
  if (Game.deathFade > 0) return;
  Game.deathFade = 0.001;
  Audio2.deathSwell();
  if (Game.onDeath) Game.onDeath();
}

function respawn() {
  const s = Game.state;
  s.o2 = 100;
  s.px = Game.deck.spawn.x * TILE + 16;
  s.py = Game.deck.spawn.y * TILE + 16;
  Game.deathFade = 0;
  saveState();
}

function gotoDeck(idx, keepPos) {
  Game.state.deckIdx = idx;
  Game.deck = parseDeck(idx);
  if (!keepPos) {
    Game.state.px = Game.deck.spawn.x * TILE + 16;
    Game.state.py = Game.deck.spawn.y * TILE + 16;
  }
  Game.state.o2 = Math.max(Game.state.o2, GAMEDATA.tuning.economy.deck_entry_min_o2);
  Game.particles = [];
  const first = !Game.state.visited[Game.deck.src.id];
  Game.state.visited[Game.deck.src.id] = true;
  saveState();
  if (Game.onDeckEnter) Game.onDeckEnter(Game.deck, first);
}

// ---------------------------------------------------------------- toasts/subtitles
function toast(text) { Game.toasts.push({ text, t: 4 }); }

// ---------------------------------------------------------------- rendering
function initStars() {
  Game.stars = [];
  for (let i = 0; i < 260; i++) {
    Game.stars.push({ x: Math.random(), y: Math.random(), z: 0.3 + Math.random() * 0.7, tw: Math.random() * 6 });
  }
}

function render() {
  const cv = Game.canvas, ctx = Game.ctx;
  const Wp = cv.width, Hp = cv.height;
  const s = Game.state;
  const d = Game.deck;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#03040a";
  ctx.fillRect(0, 0, Wp, Hp);

  // starfield + nebula (the Reach)
  const driftX = Game.time * 1.2, driftY = Game.time * 0.4;
  const neb = ctx.createRadialGradient(Wp * 0.75, Hp * 0.2, 40, Wp * 0.75, Hp * 0.2, Wp * 0.7);
  neb.addColorStop(0, "rgba(96,40,120,0.16)");
  neb.addColorStop(0.5, "rgba(30,50,110,0.10)");
  neb.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = neb; ctx.fillRect(0, 0, Wp, Hp);
  for (const st of Game.stars) {
    const sx = ((st.x * Wp - driftX * st.z) % Wp + Wp) % Wp;
    const sy = ((st.y * Hp - driftY * st.z) % Hp + Hp) % Hp;
    const a = 0.25 + 0.6 * Math.abs(Math.sin(Game.time * 0.7 + st.tw));
    ctx.fillStyle = `rgba(200,215,255,${a * st.z})`;
    ctx.fillRect(sx, sy, st.z > 0.8 ? 2 : 1, st.z > 0.8 ? 2 : 1);
  }

  // camera
  const scale = Math.min(Wp, Hp) > 900 ? 1.35 : 1.0;
  let camX = s.px - Wp / 2 / scale, camY = s.py - Hp / 2 / scale;
  if (Game.shakeT > 0) { camX += (Math.random() - 0.5) * 6; camY += (Math.random() - 0.5) * 6; }
  ctx.setTransform(scale, 0, 0, scale, -camX * scale, -camY * scale);

  const hue = d.hue;
  // tiles
  const minTx = Math.max(0, Math.floor(camX / TILE) - 1), maxTx = Math.min(d.w - 1, Math.ceil((camX + Wp / scale) / TILE) + 1);
  const minTy = Math.max(0, Math.floor(camY / TILE) - 1), maxTy = Math.min(d.h - 1, Math.ceil((camY + Hp / scale) / TILE) + 1);
  for (let ty = minTy; ty <= maxTy; ty++) {
    for (let txx = minTx; txx <= maxTx; txx++) {
      const t = d.grid[ty][txx];
      const X = txx * TILE, Y = ty * TILE;
      if (t === 0) continue;
      if (t === 2) { // wall
        ctx.fillStyle = `hsl(${hue},15%,17%)`;
        ctx.fillRect(X, Y, TILE, TILE);
        ctx.fillStyle = `hsl(${hue},24%,24%)`;
        ctx.fillRect(X, Y, TILE, 3);
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.fillRect(X, Y + TILE - 3, TILE, 3);
      } else if (t === 3) { // window: star void with frame
        ctx.fillStyle = "rgba(4,6,16,0.55)";
        ctx.fillRect(X, Y, TILE, TILE);
        ctx.strokeStyle = `hsl(${hue},25%,26%)`;
        ctx.lineWidth = 2.5;
        ctx.strokeRect(X + 2, Y + 2, TILE - 4, TILE - 4);
      } else { // floors
        ctx.fillStyle = `hsl(${hue},11%,${t === 4 ? 10 : 8}%)`;
        ctx.fillRect(X, Y, TILE, TILE);
        ctx.strokeStyle = "rgba(255,255,255,0.028)";
        ctx.lineWidth = 1;
        ctx.strokeRect(X + 0.5, Y + 0.5, TILE - 1, TILE - 1);
        if (t === 4) { // garden
          ctx.fillStyle = "rgba(60,160,80,0.13)";
          ctx.fillRect(X, Y, TILE, TILE);
          ctx.fillStyle = `rgba(90,200,110,${0.35 + 0.15 * Math.sin(Game.time + txx * 3 + ty)})`;
          for (let i = 0; i < 3; i++) {
            const gx = X + 6 + ((txx * 7 + i * 11 + ty * 5) % 20), gy = Y + 6 + ((ty * 9 + i * 13 + txx * 3) % 20);
            ctx.beginPath(); ctx.ellipse(gx, gy, 2.4, 5, (i + txx) * 0.9, 0, 7); ctx.fill();
          }
        }
        if (t === 5) { // hazard vent
          const pulse = 0.4 + 0.3 * Math.sin(Game.time * 5 + txx);
          ctx.fillStyle = `rgba(255,110,40,${pulse * 0.25})`;
          ctx.fillRect(X, Y, TILE, TILE);
          ctx.strokeStyle = `rgba(255,140,60,${pulse})`;
          ctx.beginPath();
          for (let i = 0; i < 3; i++) { ctx.moveTo(X + 6 + i * 8, Y + 26); ctx.quadraticCurveTo(X + 10 + i * 8, Y + 14 - 4 * Math.sin(Game.time * 6 + i), X + 6 + i * 8, Y + 6); }
          ctx.stroke();
        }
        if (t === 6) { // debris
          ctx.fillStyle = "rgba(120,120,130,0.16)";
          ctx.beginPath();
          ctx.moveTo(X + 8, Y + 22); ctx.lineTo(X + 15, Y + 12); ctx.lineTo(X + 25, Y + 24); ctx.closePath(); ctx.fill();
        }
      }
    }
  }

  // entities
  for (const e of d.entities) {
    const X = e.x * TILE, Y = e.y * TILE;
    if (X < camX - 64 || X > camX + Wp / scale + 64 || Y < camY - 64 || Y > camY + Hp / scale + 64) continue;
    drawEntity(ctx, e, X, Y, hue);
  }

  // player
  drawPlayer(ctx, s.px, s.py);

  // darkness + lights
  renderLights(camX, camY, scale);

  // toasts & HUD are DOM; vignette:
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const vg = ctx.createRadialGradient(Wp / 2, Hp / 2, Math.min(Wp, Hp) * 0.35, Wp / 2, Hp / 2, Math.max(Wp, Hp) * 0.72);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(0,0,5,0.55)");
  ctx.fillStyle = vg; ctx.fillRect(0, 0, Wp, Hp);

  if (Game.o2LowPulse > 0) {
    const a = 0.12 + 0.1 * Math.sin(Game.o2LowPulse * 4);
    ctx.fillStyle = `rgba(160,20,20,${a})`;
    ctx.fillRect(0, 0, Wp, Hp);
  }
  if (Game.deathFade > 0) {
    Game.deathFade = Math.min(1.6, Game.deathFade + 0.016);
    ctx.fillStyle = `rgba(0,0,0,${Math.min(1, Game.deathFade)})`;
    ctx.fillRect(0, 0, Wp, Hp);
  }
}

function drawEntity(ctx, e, X, Y, hue) {
  const cx = X + 16, cy = Y + 16;
  const pulse = 0.5 + 0.5 * Math.sin(Game.time * 2.4 + e.x);
  switch (e.type) {
    case "crate":
      ctx.fillStyle = `hsl(${hue},10%,17%)`;
      ctx.fillRect(X + 4, Y + 4, 24, 24);
      ctx.strokeStyle = "rgba(255,255,255,0.09)";
      ctx.strokeRect(X + 4, Y + 4, 24, 24);
      ctx.beginPath(); ctx.moveTo(X + 4, Y + 4); ctx.lineTo(X + 28, Y + 28); ctx.stroke();
      break;
    case "reactor":
      ctx.fillStyle = "#1a1216";
      ctx.fillRect(X, Y, TILE, TILE);
      ctx.fillStyle = `rgba(255,80,40,${0.06 + 0.05 * pulse})`;
      ctx.fillRect(X + 3, Y + 3, TILE - 6, TILE - 6);
      break;
    case "o2":
      if (Game.state.collected[entKey(e)]) return;
      ctx.fillStyle = "#9fd8e8";
      ctx.fillRect(cx - 4, cy - 8, 8, 16);
      ctx.fillStyle = "#daf6ff";
      ctx.fillRect(cx - 4, cy - 8, 8, 4);
      ctx.strokeStyle = `rgba(120,220,255,${0.5 + 0.4 * pulse})`;
      ctx.beginPath(); ctx.arc(cx, cy, 12 + pulse * 2, 0, 7); ctx.stroke();
      break;
    case "cell":
      if (Game.state.collected[entKey(e)]) return;
      ctx.fillStyle = "#ffd76a";
      ctx.fillRect(cx - 6, cy - 5, 12, 10);
      ctx.fillStyle = "#8a6a20";
      ctx.fillRect(cx - 6, cy - 1, 12, 2);
      ctx.strokeStyle = `rgba(255,210,90,${0.5 + 0.4 * pulse})`;
      ctx.beginPath(); ctx.arc(cx, cy, 12 + pulse * 2, 0, 7); ctx.stroke();
      break;
    case "body": {
      // a sleeper in a suit, lain straight, small halo
      ctx.save();
      ctx.translate(cx, cy);
      ctx.fillStyle = "rgba(200,210,235,0.10)";
      ctx.beginPath(); ctx.arc(0, 0, 15, 0, 7); ctx.fill();
      ctx.rotate(0.5);
      ctx.fillStyle = "#3c4358";
      ctx.beginPath(); ctx.ellipse(0, 2, 6, 12, 0, 0, 7); ctx.fill();
      ctx.fillStyle = "#59617c";
      ctx.beginPath(); ctx.arc(0, -10, 5, 0, 7); ctx.fill();
      ctx.fillStyle = "rgba(230,240,255,0.35)";
      ctx.beginPath(); ctx.arc(1.5, -10.5, 2, 0, 7); ctx.fill();
      ctx.restore();
      break;
    }
    case "door": {
      ctx.fillStyle = `hsl(${hue},18%,22%)`;
      const gap = e.open * 13;
      ctx.fillRect(X, Y + 2, 16 - gap, 28);
      ctx.fillRect(X + 16 + gap, Y + 2, 16 - gap, 28);
      ctx.fillStyle = `hsla(${hue},60%,60%,0.6)`;
      ctx.fillRect(X + 14 - gap, Y + 2, 2, 28);
      ctx.fillRect(X + 16 + gap, Y + 2, 2, 28);
      break;
    }
    case "echodoor": {
      const open = isOpened(e);
      ctx.fillStyle = open ? "rgba(40,60,60,0.35)" : `hsl(${hue},22%,20%)`;
      ctx.fillRect(X + 1, Y + 1, 30, 30);
      if (!open) {
        ctx.strokeStyle = `hsla(${hue},80%,65%,${0.5 + 0.4 * pulse})`;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(cx, cy, 9, 0, 7); ctx.stroke();
        // waveform sigil
        ctx.beginPath();
        for (let i = -8; i <= 8; i++) {
          const yy = cy + Math.sin(i * 0.9 + Game.time * 3) * (3 - Math.abs(i) * 0.25);
          i === -8 ? ctx.moveTo(cx + i, yy) : ctx.lineTo(cx + i, yy);
        }
        ctx.stroke();
      } else {
        ctx.strokeStyle = "rgba(120,255,200,0.35)";
        ctx.strokeRect(X + 4, Y + 4, 24, 24);
      }
      break;
    }
    case "terminal": case "archive": case "intercom": {
      const glow = e.type === "archive" ? "255,160,80" : "110,235,190";
      ctx.fillStyle = "#101418";
      ctx.fillRect(X + 5, Y + 3, 22, 26);
      ctx.fillStyle = `rgba(${glow},${0.5 + 0.35 * pulse})`;
      ctx.fillRect(X + 8, Y + 6, 16, 11);
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      for (let i = 0; i < 3; i++) ctx.fillRect(X + 8, Y + 7 + i * 3, 16, 1);
      ctx.fillStyle = `rgba(${glow},0.8)`;
      ctx.fillRect(X + 8, Y + 20, (6 + 8 * Math.abs(Math.sin(Game.time * 1.7 + e.x))), 2);
      break;
    }
    case "socket": {
      const on = isOpened(e);
      ctx.fillStyle = "#14171c";
      ctx.fillRect(X + 6, Y + 6, 20, 20);
      ctx.strokeStyle = on ? "rgba(120,255,160,0.9)" : `rgba(255,210,90,${0.4 + 0.4 * pulse})`;
      ctx.lineWidth = 2;
      ctx.strokeRect(X + 6, Y + 6, 20, 20);
      ctx.fillStyle = on ? "#7cffa0" : "#3a3320";
      ctx.fillRect(X + 12, Y + 12, 8, 8);
      break;
    }
    case "lift": {
      const cond = liftUnlocked(e);
      ctx.fillStyle = "#0d1015";
      ctx.fillRect(X + 2, Y + 2, 28, 28);
      ctx.strokeStyle = cond ? `rgba(120,255,190,${0.5 + 0.4 * pulse})` : "rgba(255,90,90,0.5)";
      ctx.lineWidth = 2;
      ctx.strokeRect(X + 3, Y + 3, 26, 26);
      ctx.beginPath();
      ctx.moveTo(cx, cy - 7); ctx.lineTo(cx + 6, cy + 3); ctx.lineTo(cx - 6, cy + 3); ctx.closePath();
      ctx.fillStyle = cond ? "#7cffbe" : "#5a2a2a";
      ctx.fill();
      break;
    }
    case "corealtar": {
      const r = 16 + 3 * Math.sin(Game.time * 1.4);
      const g = ctx.createRadialGradient(cx, cy + 16, 2, cx, cy + 16, 46);
      g.addColorStop(0, "rgba(240,200,255,0.8)");
      g.addColorStop(0.4, "rgba(170,110,255,0.30)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(cx - 48, cy - 32, 96, 96);
      ctx.strokeStyle = "rgba(230,190,255,0.8)";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy + 16, r, 0, 7); ctx.stroke();
      break;
    }
    case "hangar": {
      ctx.fillStyle = "#0b0e13";
      ctx.fillRect(X + 1, Y + 1, 30, 30);
      ctx.strokeStyle = `rgba(255,230,150,${0.35 + 0.3 * pulse})`;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(X + 3, Y + 3, 26, 26);
      ctx.setLineDash([]);
      break;
    }
  }
  // interaction hint ring
  if (Game.nearEntity === e && !Game.overlayOpen) {
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.arc(cx, cy, 20 + Math.sin(Game.time * 4) * 2, 0, 7); ctx.stroke();
    ctx.setLineDash([]);
  }
}

function drawPlayer(ctx, x, y) {
  const bob = Game.walking ? Math.sin(Game.time * 11) * 1.4 : 0;
  ctx.save();
  ctx.translate(x, y + bob);
  // suit
  ctx.fillStyle = "#c8cede";
  ctx.beginPath(); ctx.arc(0, 0, 9, 0, 7); ctx.fill();
  ctx.fillStyle = "#8d94ab";
  ctx.beginPath(); ctx.arc(0, 3, 6.5, 0, Math.PI); ctx.fill();
  // visor
  ctx.fillStyle = "#1c2340";
  ctx.beginPath(); ctx.arc(0, -2, 5, 0, 7); ctx.fill();
  ctx.fillStyle = "rgba(140,220,255,0.75)";
  ctx.beginPath(); ctx.arc(1.4, -3.2, 1.8, 0, 7); ctx.fill();
  // helmet lamp
  ctx.fillStyle = "rgba(255,250,220,0.9)";
  ctx.fillRect(-2, -10.5, 4, 3);
  ctx.restore();
}

function renderLights(camX, camY, scale) {
  const cv = Game.canvas, L = Game.lightCv, lctx = Game.lightCtx;
  if (L.width !== cv.width || L.height !== cv.height) { L.width = cv.width; L.height = cv.height; }
  lctx.setTransform(1, 0, 0, 1, 0, 0);
  lctx.globalCompositeOperation = "source-over";
  lctx.fillStyle = "rgba(2,3,10,0.83)";
  lctx.fillRect(0, 0, L.width, L.height);
  lctx.globalCompositeOperation = "destination-out";
  const s = Game.state;
  const fl = 0.93 + 0.07 * Math.sin(Game.time * 13.7) * Math.sin(Game.time * 3.1);
  const px = (s.px - camX) * scale, py = (s.py - camY) * scale;
  const pr = 195 * scale * fl;
  let g = lctx.createRadialGradient(px, py, 10, px, py, pr);
  g.addColorStop(0, "rgba(0,0,0,0.98)");
  g.addColorStop(0.6, "rgba(0,0,0,0.75)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  lctx.fillStyle = g;
  lctx.beginPath(); lctx.arc(px, py, pr, 0, 7); lctx.fill();
  // entity glows
  for (const e of Game.deck.entities) {
    if (!["terminal", "archive", "echodoor", "lift", "socket", "corealtar", "o2", "cell", "intercom", "hangar"].includes(e.type)) continue;
    if ((e.type === "o2" || e.type === "cell") && Game.state.collected[entKey(e)]) continue;
    const ex = (e.x * TILE + 16 - camX) * scale, ey = (e.y * TILE + 16 - camY) * scale;
    if (ex < -80 || ex > L.width + 80 || ey < -80 || ey > L.height + 80) continue;
    const rr = (e.type === "corealtar" ? 180 : 55) * scale;
    g = lctx.createRadialGradient(ex, ey, 2, ex, ey, rr);
    g.addColorStop(0, "rgba(0,0,0,0.7)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    lctx.fillStyle = g;
    lctx.beginPath(); lctx.arc(ex, ey, rr, 0, 7); lctx.fill();
  }
  // garden soft light
  const ctx = Game.ctx;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(L, 0, 0);
  // dust motes in player light
  ctx.fillStyle = "rgba(220,230,255,0.35)";
  for (const p of Game.particles) {
    const sx = (p.x - camX) * scale, sy = (p.y - camY) * scale;
    const d2 = (sx - px) ** 2 + (sy - py) ** 2;
    if (d2 < pr * pr) {
      const a = Math.max(0, Math.min(0.5, p.life * 0.12)) * (1 - Math.sqrt(d2) / pr);
      ctx.globalAlpha = a;
      ctx.fillRect(sx, sy, 1.6, 1.6);
    }
  }
  ctx.globalAlpha = 1;
}

function liftUnlocked(e) {
  const d = Game.deck;
  const need = e.needs;
  if (!need) return true;
  const has = t => d.entities.some(x => x.type === t && isOpened(x));
  const allSockets = d.entities.filter(x => x.type === "socket").every(x => isOpened(x));
  if (need === "socket") return allSockets;
  if (need === "echodoor") return d.entities.some(x => x.type === "echodoor" && x.opens === "lift" && isOpened(x));
  if (need === "echodoor+power") return allSockets && d.entities.some(x => x.type === "echodoor" && x.opens === "lift" && isOpened(x));
  return has(need);
}

// ---------------------------------------------------------------- loop & input
function startLoop() {
  Game.last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - Game.last) / 1000);
    Game.last = now;
    tick(dt);
    render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function initEngine(canvas) {
  Game.canvas = canvas;
  Game.ctx = canvas.getContext("2d");
  Game.lightCv = document.createElement("canvas");
  Game.lightCtx = Game.lightCv.getContext("2d");
  initStars();
  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.floor(canvas.clientWidth * dpr);
    canvas.height = Math.floor(canvas.clientHeight * dpr);
  }
  window.addEventListener("resize", resize);
  resize();
  window.addEventListener("keydown", e => {
    Game.keys[e.key] = true;
    if ((e.key === "e" || e.key === "E" || e.key === "Enter" || e.key === " ") && !Game.overlayOpen && Game.nearEntity && Game.onInteract) {
      e.preventDefault();
      Game.onInteract(Game.nearEntity);
    }
  });
  window.addEventListener("keyup", e => { Game.keys[e.key] = false; });
  startLoop();
}

if (typeof module !== "undefined") module.exports = { Game, initEngine, parseDeck, gotoDeck, respawn, toast, newRunState, saveState, loadState, clearSave, entKey, isOpened, setOpened, liftUnlocked, solidAt };
