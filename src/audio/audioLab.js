// Laboratorio de audio (no es parte del juego). Escena mínima: pasillo | puerta 1B | hall1b | living | cocina, patio.
import { AudioEngine } from './AudioEngine.js';
import { ONESHOTS } from './sounds.js';

const audio = new AudioEngine();
const rooms = {
  pasillo: { reverb: 'hall', size: [2.2, 3.2, 14], center: { x: -6, y: 1.5, z: 0 } },
  hall1b: { reverb: 'small', size: [2.5, 2.8, 2.5], center: { x: -3, y: 1.4, z: 0 } },
  living: { reverb: 'room', size: [5, 2.8, 4.5], center: { x: 1, y: 1.4, z: 0 } },
  cocina: { reverb: 'tile', size: [3, 2.8, 3], center: { x: 1, y: 1.4, z: 4 } },
  patio: { reverb: 'outdoor', size: [5, 10, 5], center: { x: 6, y: 1.5, z: 0 }, outdoor: true },
};
let door = 0;
const portals = [
  { id: 'p1b', a: 'pasillo', b: 'hall1b', pos: { x: -4.5, y: 1, z: 0 }, getOpen: () => door },
  { id: 'arco', a: 'hall1b', b: 'living', pos: { x: -1.5, y: 1.2, z: 0 }, getOpen: () => 1 },
  { id: 'coc', a: 'living', b: 'cocina', pos: { x: 1, y: 1, z: 2.3 }, getOpen: () => 0.8 },
  { id: 'vent', a: 'living', b: 'patio', pos: { x: 3.5, y: 1.5, z: 0 }, getOpen: () => 0.15 },
];
const roomAt = (p) => (p.x < -4.5 ? 'pasillo' : p.x < -1.5 ? 'hall1b' : p.x > 3.5 ? 'patio' : p.z > 2.3 ? 'cocina' : 'living');
let L = { x: 1, y: 1.6, z: 0 };
const loops = {};
window.lab = {
  audio, rooms,
  async start() { await audio.start(); audio.setAcoustics({ rooms, portals, roomAt }); audio.setListener(L, { x: 0, y: 0, z: -1 }, 'living'); },
  setDoor(v) { door = v; }, setListener(p, room) { L = p; audio.setListener(p, { x: 0, y: 0, z: -1 }, room); },
  tap() { // medidor sobre el master
    const a = audio.ctx.createAnalyser(); a.fftSize = 4096; audio.master.connect(a); this.an = a; return a;
  },
  rms(ms = 500) {
    return new Promise((res) => { const a = this.an, d = new Float32Array(a.fftSize); let s = 0, n = 0, pk = 0;
      const id = setInterval(() => { a.getFloatTimeDomainData(d); for (const v of d) { s += v * v; n++; pk = Math.max(pk, Math.abs(v)); } }, 40);
      setTimeout(() => { clearInterval(id); res({ db: 10 * Math.log10(s / n + 1e-12), pk }); }, ms); });
  },
  spectrum() { const a = this.an, f = new Float32Array(a.frequencyBinCount); a.getFloatFrequencyData(f); const bands = [100, 300, 1000, 3000, 8000];
    return bands.map((hz) => Math.round(f[Math.round(hz / (audio.ctx.sampleRate / 2) * f.length)])); },
};
let last = performance.now();
(function loop() { const t = performance.now(); audio.update((t - last) / 1000); last = t; requestAnimationFrame(loop); })();

// UI
const ui = document.getElementById('ui'), log = document.getElementById('log');
const btn = (label, fn) => { const b = document.createElement('button'); b.textContent = label; b.onclick = async () => { if (!audio.ctx) await window.lab.start(); fn(); }; return b; };
const sec = (t) => { const h = document.createElement('h3'); h.textContent = t; ui.appendChild(h); };
sec('Escena');
ui.append(btn('puerta 1B: cerrar', () => (door = 0)), btn('abrir a medias', () => (door = 0.3)), btn('abrir', () => (door = 1)));
ui.append(btn('oyente: living', () => lab.setListener({ x: 1, y: 1.6, z: 0 }, 'living')), btn('oyente: pasillo', () => lab.setListener({ x: -6, y: 1.6, z: 0 }, 'pasillo')), btn('oyente: patio', () => lab.setListener({ x: 6, y: 1.6, z: 0 }, 'patio')));
sec('One-shots en el pasillo (detrás de la puerta 1B)');
for (const n of Object.keys(ONESHOTS)) ui.append(btn(n, () => audio.play(n, { pos: { x: -6, y: 1.2, z: 1 }, roomId: 'pasillo' })));
sec('One-shots en el living (al lado)');
for (const n of Object.keys(ONESHOTS).filter((n) => !n.startsWith('_'))) ui.append(btn(n, () => audio.play(n, { pos: { x: 2, y: 1.2, z: -1.5 }, roomId: 'living' })));
sec('Loops');
const lp = { rain: [{ x: 6, y: 2, z: 0 }, 'patio'], city: [{ x: 6, y: 1, z: 6 }, 'patio'], building_hum: [{ x: -6, y: 2.8, z: 0 }, 'pasillo'], fridge: [{ x: 2, y: 0.8, z: 5 }, 'cocina'], clock: [{ x: -1, y: 1.9, z: -2 }, 'living'], tube_hum: [{ x: -6, y: 3, z: 2 }, 'pasillo'], tv_static: [{ x: 3, y: 0.8, z: 1.5 }, 'living'], tv_program: [{ x: 3, y: 0.8, z: 1.5 }, 'living'], drip: [{ x: 1.5, y: 0.5, z: 4.5 }, 'cocina'], entity_breath: [{ x: -6, y: 1.5, z: -2 }, 'pasillo'] };
for (const [n, [pos, roomId]] of Object.entries(lp)) ui.append(btn(n, () => { if (loops[n]) { loops[n].stop(); delete loops[n]; } else loops[n] = audio.loop(n, { pos, roomId }); }));
ui.append(btn('corte de luz edificio', () => audio.setPower('building', false)), btn('volver luz', () => audio.setPower('building', true)));
sec('Pasos (en el living, intensidad 0.2 / 0.6 / 1)');
for (const s of ['mosaic', 'parquet', 'carpet', 'ceramic', 'concrete', 'wood', 'wet']) for (const by of ['player', 'elena', 'entity']) {
  ui.append(btn(`${s}/${by}`, () => { let k = 0; const it = by === 'player' ? [0.2, 0.6, 1] : [0.6]; const id = setInterval(() => { audio.footstep({ surface: s, by, intensity: it[Math.floor(k / 4) % it.length], pos: { x: 1 + (k % 2) * 0.2, y: 0, z: -1 - k * 0.3 }, roomId: 'living' }); if (++k >= 4 * it.length) clearInterval(id); }, by === 'elena' ? 750 : 520); }));
}
sec('Casetes / micrófono / música');
for (const t of ['elena1', 'elena2', 'elena3', 'mimic']) ui.append(btn(t, () => { const h = audio.tape(t, { pos: { x: 2, y: 0.9, z: -1 }, roomId: 'living' }); log.textContent = JSON.stringify(h.phrases, null, 1); }));
ui.append(btn('mic on', async () => (log.textContent = 'mic: ' + (await audio.mic.enable()))));
ui.append(btn('grabar 3 s y reproducir desde el pasillo (wall)', async () => { const b = await audio.mic.capture(3); log.textContent = b ? `capturado ${b.duration.toFixed(2)}s` : 'sin voz'; if (b) audio.playBuffer(b, { pos: { x: -6, y: 1.5, z: 0 }, roomId: 'pasillo', color: 'wall' }); }));
ui.append(btn('últimos 3 s como cinta', () => { const b = audio.mic.recent(3); if (b) audio.playBuffer(b, { pos: { x: 2, y: 1, z: -1 }, roomId: 'living', color: 'tape' }); }));
for (const m of ['none', 'dread', 'chase', 'end']) ui.append(btn('music ' + m, () => audio.music(m)));
