// Survival-economy static audit: per deck, BFS reachability of O2/cells/sockets/lifts
const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  page.on("pageerror", e => errs.push("PAGEERROR: " + e.message));
  page.on("console", m => { if (m.type() === "error") errs.push("CONSOLE: " + m.text()); });
  await page.goto("file:///home/claude/ghostwreck/artifact.html");
  await page.waitForTimeout(3000);
  // start new game
  await page.click("#btnNew");
  for (let i = 0; i < 4; i++) { await page.click("#introOverlay"); await page.waitForTimeout(250); }
  await page.waitForTimeout(400);
  await page.click("#deckOverlay");
  await page.waitForTimeout(300);

  const report = await page.evaluate(() => {
    const out = [];
    for (let idx = 0; idx <= 5; idx++) {
      const d = parseDeck(idx);
      const entAt = {};
      for (const e of d.entities) entAt[e.x + "," + e.y] = entAt[e.x + "," + e.y] || e;
      const solid = (tx, ty, echodoorsOpen) => {
        if (tx < 0 || ty < 0 || tx >= d.w || ty >= d.h) return true;
        const t = d.grid[ty][tx];
        if (t === 0 || t === 2 || t === 3) return true;
        for (const e of d.entities) {
          if (e.x === tx && e.y === ty) {
            if (e.type === "echodoor" && !echodoorsOpen) return true;
            if (["lift","corealtar","hangar","terminal","archive","socket","intercom"].includes(e.type)) return true;
          }
        }
        return false; // proximity doors treated passable
      };
      const bfs = (echodoorsOpen) => {
        const dist = {};
        const q = [[d.spawn.x, d.spawn.y]];
        dist[d.spawn.x + "," + d.spawn.y] = 0;
        while (q.length) {
          const [x, y] = q.shift();
          const dd = dist[x + "," + y];
          for (const [nx, ny] of [[x+1,y],[x-1,y],[x,y+1],[x,y-1]]) {
            const k = nx + "," + ny;
            if (dist[k] !== undefined) continue;
            if (solid(nx, ny, echodoorsOpen)) continue;
            dist[k] = dd + 1;
            q.push([nx, ny]);
          }
        }
        return dist;
      };
      const distClosed = bfs(false), distOpen = bfs(true);
      // interactables are solid; reachable if any adjacent tile reachable (interact radius 46px covers adjacent tile centers)
      const adjReach = (e, dist) => {
        let best = null;
        for (const [nx, ny] of [[e.x+1,e.y],[e.x-1,e.y],[e.x,e.y+1],[e.x,e.y-1],[e.x,e.y]]) {
          const v = dist[nx + "," + ny];
          if (v !== undefined && (best === null || v < best)) best = v;
        }
        return best;
      };
      const items = d.entities.filter(e => e.type === "o2" || e.type === "cell").map(e => ({
        type: e.type, x: e.x, y: e.y,
        distClosed: distClosed[e.x + "," + e.y] ?? null,
        distOpen: distOpen[e.x + "," + e.y] ?? null,
      }));
      const inters = d.entities.filter(e => ["socket","lift","echodoor","terminal","archive","intercom","corealtar","hangar"].includes(e.type)).map(e => ({
        type: e.type, label: e.label, x: e.x, y: e.y, needs: e.needs || null,
        distClosed: adjReach(e, distClosed), distOpen: adjReach(e, distOpen),
      }));
      // count hazard/garden tiles
      let hz = 0, gd = 0;
      for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) {
        if (d.grid[y][x] === 5) hz++;
        if (d.grid[y][x] === 4) gd++;
      }
      out.push({ idx, id: d.src.id, name: d.src.name, spawn: d.spawn, items, inters, hazardTiles: hz, gardenTiles: gd });
    }
    return out;
  });

  console.log(JSON.stringify(report, null, 1));
  console.log("ERRORS:", JSON.stringify(errs));
  await browser.close();
})().catch(e => { console.error("FATAL", e); process.exit(1); });
