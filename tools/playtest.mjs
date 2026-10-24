// Playtest headless con bots de jugador. Uso:
//   node tools/playtest.mjs                 -> batería de partidas
//   node tools/playtest.mjs 7 cazador hueco ruidoso   -> una partida
// Requiere vite dev en 127.0.0.1:5173.
import { createRequire } from 'module';
const require = createRequire(process.env.PW_PATH || import.meta.url);
const { chromium } = require('playwright');

const BATTERY = [
  [11, 'paciente', 'hueco', 'cauto'], [12, 'territorial', 'baulera', 'ruidoso'], [13, 'cazador', 'gone', 'escondedor'],
  [14, 'paciente', 'baulera', 'escolta'], [15, 'cazador', 'hueco', 'ruidoso'], [16, 'territorial', 'hueco', 'escondedor'],
  [17, 'cazador', 'baulera', 'cauto'], [18, 'paciente', 'gone', 'escolta'], [19, 'territorial', 'gone', 'cauto'], [20, 'cazador', 'hueco', 'escolta'],
];
const runs = process.argv[2] ? [[+process.argv[2], process.argv[3] || 'paciente', process.argv[4] || 'hueco', process.argv[5] || 'cauto']] : BATTERY;
const MAXT = +(process.env.MAXT || 720);

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const rows = [];
for (const [seed, temper, elena, persona] of runs) {
  const page = await browser.newPage({ viewport: { width: 320, height: 200 } });
  const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(`http://127.0.0.1:5173/?seed=${seed}&temper=${temper}&elena=${elena}`);
  await page.waitForLoadState('networkidle'); await page.waitForTimeout(1500); await page.waitForFunction(() => window.__umbral, null, { timeout: 30000 });
  let r = await page.evaluate(bot, { persona, MAXT }).catch((e) => ({ error: String(e) }));
  if (/context was destroyed|crashed/.test(r.error || '')) { await page.reload(); await page.waitForLoadState('networkidle'); await page.waitForTimeout(2000); r = await page.evaluate(bot, { persona, MAXT }).catch((e) => ({ error: String(e) })); }
  r.errs = errs.slice(0, 5);
  rows.push({ seed, temper, elena, persona, ...r });
  printRun(rows.at(-1));
  await page.close();
}
await browser.close();
console.log('\n=== resumen');
console.log('seed temper       elena   persona     fin        t    1ª-manif  manif  chases  dist   trabas  paredes  loops  metas');
for (const r of rows) console.log([r.seed, r.temper.padEnd(12), r.elena.padEnd(7), r.persona.padEnd(11), (r.result || r.error || '').padEnd(10), String(r.t | 0).padStart(4), String(r.firstManif ?? '-').padStart(8), String(r.manif ?? 0).padStart(6), String(r.chases ?? 0).padStart(7), String(r.dist | 0).padStart(5), String(r.stuck?.length ?? 0).padStart(7), String(r.walls?.length ?? 0).padStart(8), String(r.loops ?? 0).padStart(6), ' ' + (r.goalHist || '')].join(' '));

function printRun(r) {
  console.log(`\n### seed=${r.seed} ${r.temper} elena=${r.elena} bot=${r.persona} -> ${r.result || r.error} t=${r.t | 0}s`);
  if (r.goals) console.log('metas:', r.goals.join(' > '));
  if (r.events) console.log('eventos:', r.events.join(' | '));
  if (r.notes) console.log('notas:\n  ' + r.notes.join('\n  '));
  if (r.stuck?.length) console.log('TRABAS:', r.stuck.join(' | '));
  if (r.walls?.length) console.log('PAREDES:', r.walls.join(' | '));
  if (r.errs?.length) console.log('ERRORES:', r.errs.join(' | '));
  if (r.error) console.log('ERROR BOT:', r.error.slice(0, 400));
}

// ---------------------------------------------------------------- bot (corre en la página)
async function bot({ persona, MAXT }) {
  const g = window.__umbral; g.paused = true; document.querySelector('#start-screen').hidden = true; g.state = 'play'; // sin audio: el audio real compite por CPU en headless
  const P = g.player, E = g.entity, B = g.building, nav = E.nav, TH = g.props.things;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const V = (x, z) => ({ x, z });
  const out = { goals: [], events: [], stuck: [], walls: [], dist: 0, manif: 0, chases: 0 };
  const ev = (s) => { if (out.events.at(-1)?.endsWith(s)) return; out.events.push(`${(g.t | 0)}s ${s}`); };
  let lastGoal = null, lastPos = E.pos.clone(), lastRoom = E.room, stillT = 0, stillPos = E.pos.clone(), lastSeen = 0, lastNotes = 0, lastChases = 0;
  const adj = new Set(); for (const p of B.portals) if (p.b) { adj.add(p.a + '|' + p.b); adj.add(p.b + '|' + p.a); }
  const dead = () => g.state !== 'play';
  let simT = 0;
  // un paso de simulación + métricas
  const step = (dt = 1 / 30) => {
    g.simulate(dt); simT += dt;
    const gt = E.goal.type;
    if (gt !== lastGoal) { out.goals.push(`${gt}@${g.t | 0}`); lastGoal = gt; }
    out.dist += E.pos.distanceTo(lastPos); lastPos.copy(E.pos);
    if (E.room !== lastRoom) { if (!adj.has(lastRoom + '|' + E.room)) out.walls.push(`${g.t | 0}s ${lastRoom}->${E.room}`); lastRoom = E.room; }
    const wantsMove = ['walk', 'stalk', 'run'].includes(E.mode) || (E.path && E.path.length && !['still', 'turn_head'].includes(E.mode));
    if (wantsMove && E.pos.distanceTo(stillPos) < .3) { stillT += dt; if (stillT > 15 && !out.stuck.some((s) => s.startsWith(String(g.t / 15 | 0) + ':'))) { out.stuck.push(`${g.t / 15 | 0}:${g.t | 0}s ${gt} en ${E.room} (${E.pos.x.toFixed(1)},${E.pos.z.toFixed(1)}) waitDoor=${!!E.waitDoor}`); stillT = 0; } }
    else { stillT = 0; stillPos.copy(E.pos); }
    if (E.mem.seenBy > lastSeen) { lastSeen = E.mem.seenBy; ev(`la vio (${gt}, ${E.pos.distanceTo(P.pos).toFixed(1)}m)`); }
    if (E.mem.chases > lastChases) { lastChases = E.mem.chases; ev(`PERSECUCIÓN d=${E.pos.distanceTo(P.pos).toFixed(1)}`); }
    if (E.log.length > lastNotes) { for (const l of E.log.slice(lastNotes)) { const k = l.key; if (!['kick', 'voice', 'tape', 'knockheard', 'took'].includes(k) && out.firstManif == null && !['seen1', 'pattern'].includes(k)) out.firstManif = g.t | 0; } lastNotes = E.log.length; }
    if (E.mem.seenBy && out.firstManif == null) out.firstManif = g.t | 0;
  };
  const near = (x, z, r = .5) => Math.hypot(P.pos.x - x, P.pos.z - z) < r;
  const keysFor = ({ run, crouch }) => { g.keys.clear(); g.keys.add('KeyW'); if (run) g.keys.add('ShiftLeft'); P.crouch = !!crouch; };
  const stopKeys = () => g.keys.clear();
  const style = { cauto: { crouch: true, slowDoors: true, torch: true }, ruidoso: { run: true }, escondedor: {}, escolta: {} }[persona];
  if (style.torch && !P.flashlight) g.toggleTorch();
  let fleeing = false;

  // react to danger: depending on persona
  async function danger() {
    if (dead()) return true;
    const d = E.pos.distanceTo(P.pos);
    const chase = E.goal.type === 'chase';
    if (!chase && !(E.seenByPlayer && d < 4 && E.goal.type !== 'escort')) return false;
    if (fleeing) return false;
    fleeing = true; ev(`huye (${E.goal.type}, d=${d.toFixed(1)})`);
    if (persona === 'escondedor' || persona === 'cauto' && d > 6) {
      const spot = P.room && ['dormitorio', 'distrib', 'bano', 'living', 'cocina', 'hall1b'].includes(P.room) ? 'placard' : 'hueco';
      const th = TH[spot]; const h = { placard: [-8.9, 19.2], hueco: [1.7, 12.6] }[spot];
      if (spot === 'hueco' && (B.doors.hueco?.lockedInside || E.room === 'hueco')) { await fleeTo(-1, 3); }
      else { await goto(h[0], h[1], { run: true, flee: true, maxT: 20 }); if (!dead() && near(h[0], h[1], 1.2)) { g.hide(th); ev('se esconde en ' + spot); for (let i = 0; i < 30 * 25 && !dead(); i++) { step(); if (i > 30 * 8 && E.goal.type !== 'chase' && E.pos.distanceTo(P.hidden?.pos || P.pos) > 6) break; } if (P.hidden && !dead()) { g.unhide(); ev('sale del escondite'); } } }
    } else {
      // corre hacia lo más lejano de la entidad, cerrando puertas detrás
      const far = nav.nodes.filter((n) => !n.portal).sort((a, b) => Math.hypot(b.x - E.pos.x, b.z - E.pos.z) - Math.hypot(a.x - E.pos.x, a.z - E.pos.z))[0];
      await fleeTo(far.x, far.z);
    }
    fleeing = false;
    return dead();
  }
  async function fleeTo(x, z) { await goto(x, z, { run: true, flee: true, closeBehind: true, maxT: 25 }); }

  // walk along the nav graph, opening doors
  async function goto(x, z, opt = {}) {
    if (dead()) return false;
    const mv = { run: opt.run ?? style.run, crouch: opt.run ? false : opt.crouch ?? style.crouch };
    const a = nav.nearest(P.pos.x, P.pos.z, P.room), b = nav.nearest(x, z, B.roomAt({ x, y: 0, z }) || null);
    const path = (nav.path(a, b, () => 0) || []).map((s) => ({ x: s.node.x, z: s.node.z, door: s.door }));
    path.unshift({ x: a.x, z: a.z }); path.push({ x, z });
    const t0 = g.t; let best = 1e9, bestT = g.t, sweep = 0;
    for (let i = 0; i < path.length; i++) {
      const s = path[i];
      if (s.door) {
        const d = B.doors[s.door];
        if (d && !d.isOpen) {
          if (d.locked && d.id === '1b') {
            if (P.inventory.has('llave1b')) g.useDoor(d, 'tap');
            else if (persona === 'ruidoso') { for (let k = 0; k < 4 && d.locked; k++) { g.kick(d); for (let j = 0; j < 20; j++) step(); } ev('pateó la 1B'); }
            else { ev('1B cerrada sin llave'); return false; }
          }
          if (d.locked || d.lockedInside) { ev('puerta ' + d.id + ' trabada'); return false; }
          g.useDoor(d, style.slowDoors && !opt.run ? 'hold' : 'tap');
          for (let j = 0; j < 30 * 4 && d.amount < .7; j++) step();
          if (style.slowDoors && !opt.run) { d.target = 1; d.slow = false; }
        }
      }
      while (!dead()) {
        const dx = s.x - P.pos.x, dz = s.z - P.pos.z, dd = Math.hypot(dx, dz);
        if (dd < (i === path.length - 1 ? .35 : .45)) break;
        P.yaw = Math.atan2(-dx, -dz);
        if (style.torch && !opt.run) { sweep += 1 / 30; P.yaw += Math.sin(sweep * 1.3) * .6; }
        keysFor(mv); step();
        if (!opt.flee && E.goal.type !== 'escort') { stopKeys(); if (await danger()) return false; }
        const tot = Math.hypot(x - P.pos.x, z - P.pos.z); if (tot < best - .2) { best = tot; bestT = g.t; }
        if (g.t - bestT > 2.5 && (opt.unstuck ?? 0) < 4) { // destrabar: retroceder y desplazarse de costado
          opt.unstuck = (opt.unstuck ?? 0) + 1; g.keys.clear(); g.keys.add('KeyS'); g.keys.add(opt.unstuck % 2 ? 'KeyA' : 'KeyD');
          for (let j = 0; j < 18; j++) step(); g.keys.delete('KeyS'); g.keys.add('KeyW'); for (let j = 0; j < 12; j++) step(); bestT = g.t;
          const d = s.door && B.doors[s.door]; if (d && d.amount < .7 && !d.locked) { d.target = 1; d.speed = 1.4; }
        }
        if (g.t - bestT > 6) { stopKeys(); ev(`bot trabado yendo a (${x.toFixed(1)},${z.toFixed(1)}) en ${P.room} (${P.pos.x.toFixed(1)},${P.pos.z.toFixed(1)})`); return false; }
        if (opt.maxT && g.t - t0 > opt.maxT) { stopKeys(); return false; }
      }
      // cerrar la puerta que acabamos de pasar
      if (opt.closeBehind && s.door && B.doors[s.door] && B.doors[s.door].isOpen && i > 0) { const d = B.doors[s.door]; if (d.id !== 'calle') { g.useDoor(d, 'tap'); ev('cierra ' + d.id + ' al huir'); } }
    }
    stopKeys(); return true;
  }
  const wait = async (sec) => { for (let i = 0; i < sec * 30 && !dead(); i++) { step(); if (i % 15 === 0 && await danger()) return; } };
  const posOf = (th) => th.pos || th.root?.getWorldPosition(new THREE_V());
  const THREE_V = P.pos.constructor;
  const at = async (th) => { const p = posOf(th); const n = nav.nearest(p.x, p.z, th.room || B.roomAt(p)); return goto(n.x, n.z); };
  const itemPos = (id) => g.items[id].mesh.getWorldPosition(new THREE_V());

  // ---------------------------------------------------------------- guion
  try {
    const dc = B.doors.calle; if (dc && !dc.isOpen) { dc.locked = false; g.useDoor(dc, 'tap'); for (let i = 0; i < 60; i++) step(); }
    P.yaw = Math.PI; keysFor({}); for (let i = 0; i < 60; i++) step(); stopKeys();
    await goto(0, 3.9); await wait(2);
    if (persona !== 'ruidoso') { if (await at(TH.buzon1b)) g.useThing(TH.buzon1b); }
    if (persona !== 'ruidoso' && !dead()) { const kp = itemPos('llave1b'); const n = nav.nearest(kp.x, kp.z, B.roomAt(kp)); if (await goto(n.x, n.z)) { g.take(g.items.llave1b); ev('llave'); } }
    await goto(-1.9, 12.4); if (!g.entered && !dead()) { ev('no pudo entrar'); }
    await wait(3);
    if (persona === 'ruidoso') { if (TH.tv) g.useThing(TH.tv); for (const f of g.lighting.fixtures) if (f.room && ['living', 'hall1b', 'cocina', 'dormitorio'].includes(f.room) && f.switch?.startsWith('sw_')) { f.on = true; E.observe('light', { on: true }); } }
    if (await at(TH.grabador) && TH.grabador.root.visible) { g.useThing(TH.grabador); ev('grabador'); }
    if (!dead() && P.inventory.has('grabador')) { g.playTape(); ev('escucha elena1'); await wait(persona === 'cauto' ? 30 : 12); if (g.tapePlaying) g.playTape(); }
    if (await at(TH.cajon_mesita)) { g.openDrawer(TH.cajon_mesita); g.take(g.items.elena2); ev('elena2'); }
    await wait(persona === 'cauto' ? 20 : 8);
    if (await at(TH.botiquin)) { g.openDrawer(TH.botiquin); g.take(g.items.elena3); ev('elena3'); }
    if (!dead() && P.inventory.has('grabador')) { g.playTape(); await wait(20); if (g.tapePlaying) g.playTape(); g.playTape(); await wait(20); if (g.tapePlaying) g.playTape(); }
    // explorar: el living un rato, la cocina
    await goto(-8.8, 10.4); await wait(15); await goto(-2.3, 16.8); await wait(10);
    if (persona === 'escolta' || persona === 'cauto') {
      for (const spot of ['hueco', 'baulera']) {
        const front = spot === 'hueco' ? [0, 12.6] : [-2.8, 32.8];
        if (!(await goto(...front)) || dead()) continue;
        const d = B.doors[spot];
        g.knockDoor = d; const t0 = g.t; g.knocks = [t0, t0 + .3, t0 + 1.3]; for (let i = 0; i < 45; i++) step();
        g.evalKnocks(); ev('golpea 2-1 en ' + spot);
        for (let i = 0; i < 12; i++) { await sleep(330); for (let j = 0; j < 10; j++) step(); }
        if (g.companion) { ev(`sale "Elena" (${g.companion.fake ? 'falsa' : 'real'})`); break; }
      }
    }
    if (persona === 'escondedor' && await goto(-8.9, 19.2)) { g.hide(TH.placard); ev('se esconde (placard) para ver'); await wait(40); if (P.hidden) g.unhide(); await goto(-5.3, 8.4); await wait(20); if (await goto(-8.9, 19.2)) { g.hide(TH.placard); await wait(40); if (P.hidden) g.unhide(); } }
    // salida
    if (g.companion) { await goto(0, 3.9); await wait(4); await goto(0, 1.3); await wait(4); }
    // dar vueltas hasta MAXT
    const tour = [[-5.3, 8.4], [-9.0, 16.3], [0, 21.2], [1.9, 29.2], [0, 32], [0, 9.8], [-4.0, 19.1], [-2.0, 15.2]];
    let k = 0;
    while (!dead() && g.t < MAXT) {
      if (g.companion) { await goto(0, 1.3); await goto(0, -2.2, { maxT: 10 }); if (g.state !== 'play') break; }
      const [x, z] = tour[k++ % tour.length]; await goto(x, z); await wait(5 + (k % 3) * 6);
    }
  } catch (e) { out.error = String(e.stack || e); }
  stopKeys();
  out.t = g.t; out.result = g.player.alive ? (g.state === 'play' ? 'vivo' : (document.querySelector('#end-title')?.textContent || g.state)) : 'muerto';
  out.notes = E.report().map((s) => s.replace(/<[^>]+>/g, ''));
  out.chases = E.mem.chases; out.manif = E.log.filter((l) => /^(tv|breaker|minutero|lightoff|closed1b|chair|lefttape|pipes|used|tableau|seen1|copyknock|elena|stare|spared)/.test(l.key)).length + E.mem.seenBy;
  const counts = {}; for (const s of out.goals) { const k = s.split('@')[0]; counts[k] = (counts[k] || 0) + 1; }
  out.goalHist = Object.entries(counts).map(([k, v]) => `${k}:${v}`).join(' ');
  // loop: la misma meta repetida >6 veces en 60 s
  let loops = 0; const gl = out.goals.map((s) => [s.split('@')[0], +s.split('@')[1]]);
  for (let i = 0; i + 6 < gl.length; i++) if (gl[i + 6][1] - gl[i][1] < 60 && new Set(gl.slice(i, i + 7).map((x) => x[0])).size <= 2) loops++;
  out.loops = loops; out.dist = Math.round(out.dist);
  if (out.goals.length > 60) out.goals = [...out.goals.slice(0, 30), '...', ...out.goals.slice(-20)];
  return out;
}
