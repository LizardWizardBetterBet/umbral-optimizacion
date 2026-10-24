// Headless smoke: start, walk the player through key interactions, simulate, print entity log.
import { createRequire } from 'module'; const require = createRequire(process.env.PW_PATH || import.meta.url); const { chromium } = require('playwright');
const seed = process.argv[2] || '7', extra = process.argv[3] || '';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto(`http://127.0.0.1:5173/?seed=${seed}${extra}`); await page.waitForTimeout(1500);
const out = await page.evaluate(async () => {
  const g = window.__umbral; g.paused = true; await g.start(); g.state = 'play';
  const P = g.player, log = [];
  const walk = (x, z, secs = 8) => { for (let i = 0; i < secs * 30; i++) { const dx = x - P.pos.x, dz = z - P.pos.z; if (Math.hypot(dx, dz) < .3) { P.input.f = 0; break; } P.yaw = Math.atan2(-dx, -dz); P.input.f = 1; P.input.r = 0; g.simulate(1 / 30); } P.input.f = 0; };
  const snap = l => log.push(`${l} t=${g.t.toFixed(0)} P:${P.room} E:${g.entity.room}/${g.entity.goal.type} aware=${g.entity.aware.toFixed(2)} hunger=${g.entity.hunger.toFixed(2)}`);
  walk(0, -.5); walk(0, 3); walk(0, 12); snap('pasillo');
  const d = g.building.doors['1b']; d.locked = false; d.target = 1; g.enteredApartment(); g.simulate(1);
  walk(-2.6, 12.4); walk(-4.6, 12.4); snap('living'); g.simulate(30); snap('wait');
  walk(-5, 15.5); walk(-5, 16.9); walk(-7, 17.2); snap('dorm'); g.simulate(60); snap('wait60');
  g.playTape?.(); g.simulate(60); snap('tape');
  walk(-5, 16.9); walk(-4.6, 12.4); walk(-1.8, 12.4); walk(0, 12.4); walk(0, 21); snap('hall-end'); g.simulate(90); snap('wait90');
  return { log, notes: g.entity.report(), state: g.state };
});
console.log(out.log.join('\n')); console.log('--- notes'); console.log(out.notes.join('\n').replace(/<[^>]+>/g, '')); console.log('state', out.state);
console.log('errors:', errs.slice(0, 8).join('\n') || 'none');
await browser.close();
