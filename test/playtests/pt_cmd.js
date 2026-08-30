async (page, errors, shot) => {
  const pos = () => page.evaluate(() => ({ x: +(Game.state.px / 32).toFixed(2), y: +(Game.state.py / 32).toFixed(2), near: Game.nearEntity ? (Game.nearEntity.type + "@" + Game.nearEntity.x + "," + Game.nearEntity.y) : null, o2: +Game.state.o2.toFixed(2) }));
  const hold = async (key, ms) => { await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key); };
  const alignX = async (t) => { for (let i = 0; i < 30; i++) { const p = await pos(); const dx = t - p.x; if (Math.abs(dx) < 0.25) return p; await hold(dx > 0 ? "d" : "a", Math.min(500, Math.max(70, Math.abs(dx) / 3.2 * 1000))); } return await pos(); };
  const alignY = async (t) => { for (let i = 0; i < 30; i++) { const p = await pos(); const dy = t - p.y; if (Math.abs(dy) < 0.25) return p; await hold(dy > 0 ? "s" : "w", Math.min(500, Math.max(70, Math.abs(dy) / 3.2 * 1000))); } return await pos(); };
  const log = [];
  await alignY(4.5); await alignX(13.5); await alignY(8.5);
  log.push(["approach", await alignX(15.4)]);
  await shot("pt_open_18b_nearterminal");
  await page.keyboard.press("e"); await page.waitForTimeout(800);
  const termVis = await page.evaluate(() => { const t = document.querySelector("#termBtnRead"); return t && t.offsetParent !== null; });
  log.push(["terminal open", termVis]);
  await shot("pt_open_19b_terminal");
  if (termVis) {
    const o2a = await page.evaluate(() => Game.state.o2);
    await page.click("#termBtnRead");
    await page.waitForTimeout(7000);
    const o2b = await page.evaluate(() => Game.state.o2);
    log.push(["o2 drain/s while reading", ((o2a - o2b) / 7).toFixed(3)]);
    await shot("pt_open_20b_terminal_read");
    await page.click("#termClose");
    await page.waitForTimeout(400);
    log.push(["after close", await pos()]);
  }
  return log;
}
