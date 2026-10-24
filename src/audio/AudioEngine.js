// UMBRAL — motor de audio. Todo sintetizado (sin archivos). Ver CONTRATO.md.
// Grafo: fuente -> [color] -> in -> lowpass(oclusión) -> occ -> panner(HRTF) -> bus -> master -> comp -> limiter
//                                                       occ -> send -> reverb del cuarto del oyente
// Los sonidos de otros cuartos se reubican en el portal por donde llegan (propagation.mjs).
import { propagate, distanceGain } from './propagation.mjs';
import { generate, setSR } from './gen.js';
import { ONESHOTS, LOOP_LEVEL, ONESHOT_LEVEL } from './sounds.js';
import { reverbParams } from './reverb.js';
import { TAPE_SCRIPTS, setTapeScript } from './voice.js';
import { Mic } from './Mic.js';

const ONE_B = new Set(['hall1b', 'living', 'cocina', 'dormitorio', 'bano']);
const NOOP = { stop() {}, setGain() {}, setPos() {}, duration: 0, phrases: [] };
const REF = 1.2; // refDistance de los panners
const pannerGain = (d) => (d <= REF ? 1 : REF / d);
const rnd = (a, b) => a + Math.random() * (b - a);
const d3 = (a, b) => Math.hypot(a.x - b.x, (a.y ?? 0) - (b.y ?? 0), a.z - b.z);
const SURFACES = ['mosaic', 'parquet', 'carpet', 'ceramic', 'concrete', 'wood', 'wet'];
const DIFFUSE = new Set(['rain', 'city', 'building_hum']);

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.started = false;
    this.listener = { pos: { x: 0, y: 1.6, z: 0 }, fwd: { x: 0, y: 0, z: -1 }, room: null };
    this.acoustics = { rooms: {}, portals: [], roomAt: null };
    this.voices = new Set();
    this.loops = new Set();
    this.cache = new Map();     // key -> AudioBuffer
    this.meta = new Map();      // key -> {duration, phrases}
    this.pending = new Set();
    this.lastVariant = new Map();
    this.power = { building: true, '1b': true };
    this.ambience = true;       // eventos esporádicos del edificio (crujidos, cañerías, vecinos)
    this._ambT = rnd(12, 25);
    this._tick = 0;
    this.mic = new Mic(this);
    this._music = { cue: 'none', node: null };
  }

  // ---------------------------------------------------------------- arranque
  async start() {
    if (this.ctx) { await this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = (this.ctx = new AC({ latencyHint: 'interactive' }));
    setSR(ctx.sampleRate);
    const g = (v = 1) => { const n = ctx.createGain(); n.gain.value = v; return n; };
    this.master = g(0.9);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20; comp.knee.value = 12; comp.ratio.value = 3; comp.attack.value = 0.008; comp.release.value = 0.25;
    const lim = ctx.createDynamicsCompressor();
    lim.threshold.value = -3; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.1;
    this.master.connect(comp); comp.connect(lim); lim.connect(ctx.destination);
    this.bus = { sfx: g(1), amb: g(0.8), voice: g(1), music: g(0.6) };
    for (const b of Object.values(this.bus)) b.connect(this.master);
    // reverbs: una entrada común que se rutea al tipo del cuarto del oyente
    this.revBus = g(1);
    this.revs = {};
    this._revType = null;
    this._setReverb('room');
    // worker de generación en segundo plano
    try {
      this.worker = new Worker(new URL('./gen.worker.js', import.meta.url), { type: 'module' });
      this.worker.postMessage({ type: 'init', sr: ctx.sampleRate });
      this.worker.onmessage = (e) => this._onWorker(e.data);
      this.worker.onerror = () => { this.worker = null; };
      this._prewarm();
    } catch { this.worker = null; }
    if (ctx.state !== 'running') await ctx.resume();
    this.started = true;
  }

  setVolume(bus, v) {
    if (!this.ctx) return;
    const n = bus === 'master' ? this.master : this.bus[bus];
    if (n) n.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  // ---------------------------------------------------------------- buffers
  _toBuffer(key, r) {
    const ab = this.ctx.createBuffer(r.ch.length, r.ch[0].length, this.ctx.sampleRate);
    r.ch.forEach((c, i) => ab.copyToChannel(c, i));
    this.cache.set(key, ab);
    if (r.duration) this.meta.set(key, { duration: r.duration, phrases: r.phrases });
    return ab;
  }
  _onWorker(m) {
    this.pending.delete(m.key);
    if (m.error) { console.warn('[audio]', m.error); return; }
    if (!this.cache.has(m.key)) this._toBuffer(m.key, m);
  }
  _request(key) {
    if (this.cache.has(key) || this.pending.has(key) || !this.worker) return;
    this.pending.add(key);
    this.worker.postMessage({ type: 'gen', key });
  }
  _get(key) {
    let b = this.cache.get(key);
    if (b) return b;
    try { return this._toBuffer(key, generate(key)); } catch (e) { console.warn('[audio]', key, e); return null; }
  }
  _variantKey(name, count, prefix = 'os') {
    const last = this.lastVariant.get(name) ?? -1;
    let v = (Math.random() * count) | 0;
    if (count > 1 && v === last) v = (v + 1) % count;
    let key = `${prefix}:${name}:${v}`;
    if (!this.cache.has(key)) {
      // preferir una variante ya lista antes que generar en el hilo principal
      for (let k = 0; k < count; k++) { const kk = `${prefix}:${name}:${k}`; if (this.cache.has(kk)) { this._request(key); key = kk; v = k; break; } }
    }
    this.lastVariant.set(name, v);
    return key;
  }
  _prewarm() {
    const keys = [];
    for (const s of SURFACES) for (let h = 0; h < 3; h++) for (let v = 0; v < 4; v++) keys.push(`fs:${s}:player:${h}:${v}`);
    for (const n of ['rain', 'city', 'building_hum', 'fridge', 'clock', 'tube_hum', '_hiss']) keys.push(`lp:${n}`);
    for (const [n, [, c]] of Object.entries(ONESHOTS)) for (let v = 0; v < c; v++) keys.push(`os:${n}:${v}`);
    for (const t of ['hall', 'tile', 'closet', 'small', 'room', 'outdoor']) keys.push(`ir:${t}`);
    for (const s of SURFACES) for (const by of ['entity', 'elena']) for (let v = 0; v < 4; v++) keys.push(`fs:${s}:${by}:1:${v}`);
    for (const n of ['tv_static', 'tv_program', 'entity_breath']) keys.push(`lp:${n}`);
    for (const t of ['elena1', 'elena2', 'elena3', 'mimic']) keys.push(`tape:${t}`);
    for (const m of ['dread', 'chase', 'end']) keys.push(`mus:${m}`);
    keys.forEach((k) => this._request(k));
  }

  // ---------------------------------------------------------------- reverb
  _setReverb(type) {
    if (type === this._revType) return;
    const ctx = this.ctx, now = ctx.currentTime;
    let r = this.revs[type];
    if (!r) {
      const conv = ctx.createConvolver();
      conv.normalize = false;
      conv.buffer = this._get(`ir:${type}`);
      const input = ctx.createGain(); input.gain.value = 0;
      this.revBus.connect(input); input.connect(conv); conv.connect(this.bus.sfx);
      r = this.revs[type] = { input, conv };
    }
    for (const [t, o] of Object.entries(this.revs)) o.input.gain.setTargetAtTime(t === type ? 1 : 0, now, 0.25);
    this._revType = type;
    this._wetBase = reverbParams(type).wet;
  }

  // ---------------------------------------------------------------- acústica
  setAcoustics({ rooms = {}, portals = [], roomAt = null } = {}) {
    this.acoustics = { rooms, portals, roomAt };
  }
  _roomOf(pos, roomId) {
    if (roomId) return roomId;
    if (pos && this.acoustics.roomAt) { try { return this.acoustics.roomAt(pos); } catch { /* */ } }
    return this.listener.room;
  }
  setListener(pos, forward, roomId) {
    const L = this.listener;
    L.pos = { x: pos.x, y: pos.y, z: pos.z };
    if (forward) L.fwd = { x: forward.x, y: forward.y, z: forward.z };
    L.room = roomId ?? this._roomOf(pos, null);
    if (!this.ctx) return;
    const l = this.ctx.listener;
    if (l.positionX) {
      l.positionX.value = L.pos.x; l.positionY.value = L.pos.y; l.positionZ.value = L.pos.z;
      l.forwardX.value = L.fwd.x; l.forwardY.value = L.fwd.y; l.forwardZ.value = L.fwd.z;
      l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0;
    } else {
      l.setPosition(L.pos.x, L.pos.y, L.pos.z);
      l.setOrientation(L.fwd.x, L.fwd.y, L.fwd.z, 0, 1, 0);
    }
    const room = this.acoustics.rooms[L.room];
    this._setReverb(room?.reverb ?? (room?.outdoor ? 'outdoor' : 'room'));
  }
  /** Cálculo de cómo llega un sonido de (pos, room) al oyente. */
  _route(pos, room, diffuse = false) {
    const L = this.listener;
    if (!room || !L.room || room === L.room || !this.acoustics.portals.length) {
      return { pos, gain: 1, muffle: 0, other: false };
    }
    const r = propagate(room, L.room, this.acoustics.portals, this.acoustics.rooms, { fromPos: pos, toPos: L.pos });
    if (!r.via) {
      // sin camino por portales: sólo lo que atraviesa la pared, muy sordo
      return { pos, gain: 0.03, muffle: 0.95, other: true };
    }
    // el sonido "aparece" en el portal, apenas corrido hacia el lado de la fuente
    const v = r.via, dl = d3(v, L.pos) || 0.01;
    // fuente extensa (lluvia, ciudad): está "del otro lado" de la abertura, no en un punto lejano
    const comp = diffuse ? 1.4 : pannerGain(r.dist) / pannerGain(dl);
    return { pos: v, gain: r.portalGain * Math.min(diffuse ? 1.4 : 1, comp), muffle: r.muffle, other: true, dist: r.dist };
  }

  // ---------------------------------------------------------------- reproducción
  _src(buffer, o) {
    return new Voice(this, buffer, o);
  }
  play(name, { pos, roomId, gain = 1, rate = 1 } = {}) {
    if (!this.ctx) return NOOP;
    const def = ONESHOTS[name];
    if (!def) { console.warn('[audio] sonido desconocido', name); return NOOP; }
    if (this.voices.size > 56 && gain < 0.5) return NOOP;
    const b = this._get(this._variantKey(name, def[1]));
    if (!b) return NOOP;
    const v = this._src(b, { pos, roomId, gain: gain * (ONESHOT_LEVEL[name] ?? 1), rate: rate * rnd(0.97, 1.03), bus: name === 'whisper' ? 'voice' : 'sfx' });
    return { stop: () => v.stop(0.05) };
  }

  footstep({ surface = 'mosaic', intensity = 0.5, pos, roomId, by = 'player' } = {}) {
    if (!this.ctx) return;
    if (!SURFACES.includes(surface)) surface = 'mosaic';
    const h = by === 'player' ? (intensity < 0.35 ? 0 : intensity < 0.75 ? 1 : 2) : 1;
    const key = this._variantKey(`${surface}:${by}:${h}`, 4, 'fs');
    const b = this._get(key);
    if (!b) return;
    let gain, lpf;
    if (by === 'player') { gain = 0.16 + 0.84 * Math.pow(intensity, 1.3); lpf = 2200 + 16000 * intensity; }
    else if (by === 'elena') { gain = 0.5 + 0.3 * intensity; lpf = 9000; }
    else { gain = 0.45 + 0.55 * intensity; lpf = 6000 + 8000 * intensity; }
    this._src(b, { pos: pos ?? this._feet(), roomId, gain: gain * 0.9, rate: rnd(0.93, 1.07), bus: 'sfx', lpf });
  }
  _feet() { const p = this.listener.pos; return { x: p.x, y: p.y - 1.5, z: p.z }; }

  loop(name, { pos, roomId, gain = 1 } = {}) {
    if (!this.ctx) return NOOP;
    const L = new Loop(this, name, { pos, roomId, gain });
    this.loops.add(L);
    return L.handle;
  }

  playBuffer(buffer, { pos, roomId, gain = 1, color = 'raw' } = {}) {
    if (!this.ctx || !buffer) return NOOP;
    const v = this._src(buffer, { pos, roomId, gain, bus: 'voice', color });
    return { stop: () => v.stop(0.08), duration: buffer.duration };
  }

  /** Info de un casete (genera si hace falta): { duration, phrases:[{start,end,text}] } */
  tapeInfo(id) {
    const key = `tape:${id}`;
    if (!this.meta.has(key)) { if (!this.ctx) return { duration: 0, phrases: [] }; this._get(key); }
    return this.meta.get(key);
  }
  setTapeScript(id, lines) {
    setTapeScript(id, lines);
    for (const k of [`tape:${id}`]) { this.cache.delete(k); this.meta.delete(k); }
    this.worker?.postMessage({ type: 'script', id, lines });
    this._request(`tape:${id}`);
  }
  tape(id, { pos, roomId, gain = 1 } = {}) {
    if (!this.ctx) return NOOP;
    const key = `tape:${id}`;
    const b = this._get(key);
    if (!b) return NOOP;
    const info = this.meta.get(key) ?? { duration: b.duration, phrases: [] };
    const v = this._src(b, { pos, roomId, gain: gain * 0.9, bus: 'voice' });
    return { stop: () => v.stop(0.04), duration: info.duration, phrases: info.phrases };
  }

  // ---------------------------------------------------------------- energía
  setPower(zone, on) {
    this.power[zone] = !!on;
    for (const L of this.loops) L.powerChanged();
  }
  _powered(zone) {
    if (!zone) return true;
    if (zone === '1b') return this.power.building && this.power['1b'];
    return this.power.building;
  }

  // ---------------------------------------------------------------- música
  music(cue = 'none') {
    if (!this.ctx || cue === this._music.cue) return;
    const now = this.ctx.currentTime;
    const old = this._music.node;
    if (old) { old.g.gain.setTargetAtTime(0, now, cue === 'chase' ? 0.3 : 1.5); old.s.stop(now + 8); }
    this._music = { cue, node: null };
    if (cue === 'none') return;
    const b = this._get(`mus:${cue}`);
    if (!b) return;
    const s = this.ctx.createBufferSource(); s.buffer = b; s.loop = cue !== 'end';
    const g = this.ctx.createGain(); g.gain.value = 0;
    const lvl = { dread: 0.22, chase: 0.5, end: 0.4 }[cue] ?? 0.3;
    g.gain.setTargetAtTime(lvl, now, cue === 'chase' ? 0.15 : 3);
    s.connect(g); g.connect(this.bus.music); s.start();
    this._music.node = { s, g };
  }

  // ---------------------------------------------------------------- frame
  update(dt) {
    if (!this.ctx) return;
    this._tick += dt;
    const refresh = this._tick >= 0.05;
    if (refresh) this._tick = 0;
    for (const v of this.voices) v.update(dt, refresh);
    for (const L of this.loops) L.update(dt);
    if (this.ambience) this._ambient(dt);
    this.mic.update(dt);
  }

  // Eventos esporádicos del edificio, con mucho espacio entre ellos.
  _ambient(dt) {
    this._ambT -= dt;
    if (this._ambT > 0) return;
    this._ambT = rnd(16, 55);
    const rooms = this.acoustics.rooms, ids = Object.keys(rooms);
    if (!ids.length || !this.listener.room) return;
    const near = (filter) => {
      const c = ids.filter(filter).map((id) => ({ id, d: d3(rooms[id].center ?? { x: 0, y: 0, z: 0 }, this.listener.pos) })).sort((a, b) => a.d - b.d).slice(0, 4);
      return c.length ? c[(Math.random() * c.length) | 0].id : null;
    };
    const at = (id, wall) => {
      const r = rooms[id], c = r.center ?? { x: 0, y: 0, z: 0 }, s = r.size ?? [3, 2.8, 3];
      const p = { x: c.x + rnd(-0.45, 0.45) * s[0], y: rnd(0.3, 2.2), z: c.z + rnd(-0.45, 0.45) * s[2] };
      if (wall) { if (Math.random() < 0.5) p.x = c.x + Math.sign(rnd(-1, 1)) * s[0] * 0.48; else p.z = c.z + Math.sign(rnd(-1, 1)) * s[2] * 0.48; }
      return p;
    };
    const r = Math.random();
    if (r < 0.38) {
      const id = near((id) => ONE_B.has(id) || id === 'hueco'); if (!id) return;
      const p = at(id); p.y = 0.05;
      this.play('floor_creak', { pos: p, roomId: id, gain: rnd(0.25, 0.6) });
    } else if (r < 0.66) {
      const id = near((id) => ['pasillo', 'lavadero', 'bano', 'cocina', 'zaguan'].includes(id)); if (!id) return;
      this.play('pipe_knock', { pos: at(id, true), roomId: id, gain: rnd(0.25, 0.55) });
    } else if (r < 0.86) {
      const p = { ...this.listener.pos }; p.x += rnd(-4, 4); p.z += rnd(-4, 4); p.y += 2.4;
      this.play('_upstairs', { pos: p, roomId: this.listener.room, gain: rnd(0.25, 0.45) });
    } else {
      const id = near((id) => rooms[id].outdoor || id === 'patio'); if (!id) return;
      this.play('_gutter', { pos: at(id, true), roomId: id, gain: rnd(0.3, 0.6) });
    }
  }
}

// =================================================================== Voice
class Voice {
  constructor(eng, buffer, { pos, roomId, gain = 1, rate = 1, bus = 'sfx', loop = false, color = 'raw', lpf = 20000, diffuse = false, offset = 0 }) {
    const ctx = eng.ctx;
    this.eng = eng; this.ctx = ctx;
    this.pos = pos ? { x: pos.x, y: pos.y ?? 1, z: pos.z } : null;
    this.room = pos ? eng._roomOf(pos, roomId) : null;
    this.userGain = gain; this.lpf = lpf; this.diffuse = diffuse;
    this.extra = []; this.dead = false;
    const src = (this.src = ctx.createBufferSource());
    src.buffer = buffer; src.loop = loop; src.playbackRate.value = rate;
    let head = src;
    if (color !== 'raw') head = this._color(head, color);
    this.wallColor = color === 'wall';
    this.filt = ctx.createBiquadFilter(); this.filt.type = 'lowpass'; this.filt.frequency.value = lpf; this.filt.Q.value = 0.5;
    this.occ = ctx.createGain(); this.occ.gain.value = 0;
    head.connect(this.filt); this.filt.connect(this.occ);
    this.send = ctx.createGain(); this.send.gain.value = 0;
    this.occ.connect(this.send); this.send.connect(eng.revBus);
    if (this.pos) {
      const p = (this.panner = ctx.createPanner());
      p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = REF; p.rolloffFactor = 1; p.maxDistance = 80;
      this.occ.connect(p); p.connect(eng.bus[bus]);
      if (diffuse) { this.dry = ctx.createGain(); this.dry.gain.value = 0; this.filt.connect(this.dry); this.dry.connect(eng.bus[bus]); }
    } else {
      this.occ.connect(eng.bus[bus]);
    }
    this.update(0, true, true);
    src.onended = () => this._cleanup();
    src.start(0, offset);
    eng.voices.add(this);
  }
  _color(head, color) {
    const ctx = this.ctx;
    const chain = [];
    const bq = (type, f, q = 0.7, g = 0) => { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; n.gain.value = g; return n; };
    if (color === 'wall') {
      // a través de pared: sólo graves y medios-graves, cuerpo resonante
      chain.push(bq('lowpass', 520, 0.9), bq('peaking', 190, 1.2, 6), bq('highpass', 90));
    } else if (color === 'tape') {
      const ws = ctx.createWaveShaper();
      const c = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; c[i] = Math.tanh(x * 1.8) / Math.tanh(1.8); }
      ws.curve = c;
      const dl = ctx.createDelay(0.05); dl.delayTime.value = 0.012;
      const lfo1 = ctx.createOscillator(); lfo1.frequency.value = 0.55; const d1 = ctx.createGain(); d1.gain.value = 0.0016;
      const lfo2 = ctx.createOscillator(); lfo2.frequency.value = 7.8; const d2 = ctx.createGain(); d2.gain.value = 0.00025;
      lfo1.connect(d1); d1.connect(dl.delayTime); lfo2.connect(d2); d2.connect(dl.delayTime);
      lfo1.start(); lfo2.start(); this.extra.push(lfo1, lfo2);
      chain.push(bq('highpass', 280), ws, bq('lowpass', 3600), bq('peaking', 1300, 1, 3), dl);
      // hiss de cinta debajo
      const hb = this.eng._get('lp:_hiss');
      if (hb) {
        const hs = ctx.createBufferSource(); hs.buffer = hb; hs.loop = true;
        const hg = ctx.createGain(); hg.gain.value = 0.5;
        hs.connect(hg); this._hissGain = hg; hs.start(); this.extra.push(hs);
      }
    }
    let n = head;
    for (const c of chain) { n.connect(c); n = c; }
    if (this._hissGain) this._hissGain.connect(n);
    return n;
  }
  setPos(pos, roomId) {
    if (!pos) return;
    this.pos = { x: pos.x, y: pos.y ?? 1, z: pos.z };
    this.room = this.eng._roomOf(pos, roomId);
  }
  update(dt, refresh, immediate = false) {
    if (this.dead || !refresh || (this._skip && !immediate)) return;
    const eng = this.eng, now = this.ctx.currentTime, tc = immediate ? 0.001 : (this.gainTc ?? 0.08);
    let g = this.userGain * (this.powerGain ?? 1), cutoff = this.lpf, wet = eng._wetBase ?? 0.2;
    if (this.panner) {
      const r = eng._route(this.pos, this.room, this.diffuse);
      const p = this.panner;
      if (p.positionX) {
        p.positionX.setTargetAtTime(r.pos.x, now, tc); p.positionY.setTargetAtTime(r.pos.y ?? 1, now, tc); p.positionZ.setTargetAtTime(r.pos.z, now, tc);
      } else p.setPosition(r.pos.x, r.pos.y ?? 1, r.pos.z);
      const muffle = Math.max(r.muffle, this.wallColor ? 0.3 : 0);
      cutoff = Math.min(cutoff, 20000 * Math.pow(0.025, muffle));
      const dist = r.dist ?? d3(this.pos, eng.listener.pos);
      cutoff *= Math.max(0.35, 1 - dist / 70); // aire
      const dg = r.gain;
      // en el mismo cuarto la reverb es casi constante (campo difuso); desde otro cuarto entra por el portal
      wet *= r.other ? Math.min(1, dg * 2.2) : 1;
      if (this.dry) {
        const inside = !r.other;
        this.dry.gain.setTargetAtTime(inside ? g * 0.75 : 0, now, 0.3);
        g *= inside ? 0.35 : 1;
      }
      g *= dg;
    }
    this.filt.frequency.setTargetAtTime(Math.max(120, cutoff), now, tc);
    this.occ.gain.setTargetAtTime(g, now, tc);
    this.send.gain.setTargetAtTime(this.userGain * (this.powerGain ?? 1) * wet * (this.panner ? 1 : 0.5) * (this.wallColor ? 1.6 : 1), now, tc);
  }
  stop(fadeSec = 0.05) {
    if (this.dead) return;
    const now = this.ctx.currentTime;
    this.occ.gain.setTargetAtTime(0, now, fadeSec / 3);
    this.send.gain.setTargetAtTime(0, now, fadeSec / 3);
    if (this.dry) this.dry.gain.setTargetAtTime(0, now, fadeSec / 3);
    try { this.src.stop(now + fadeSec + 0.05); } catch { /* */ }
  }
  _cleanup() {
    this.dead = true;
    this.eng.voices.delete(this);
    for (const e of this.extra) { try { e.stop(); } catch { /* */ } }
    for (const n of [this.src, this.filt, this.occ, this.send, this.panner, this.dry]) { try { n?.disconnect(); } catch { /* */ } }
  }
}

// =================================================================== Loop con comportamiento
class Loop {
  constructor(eng, name, { pos, roomId, gain }) {
    this.eng = eng; this.name = name; this.gain = gain;
    this.pos = pos ? { x: pos.x, y: pos.y ?? 1, z: pos.z } : null;
    this.room = pos ? eng._roomOf(pos, roomId) : null;
    this.zone = this._zoneOf(name, this.room);
    this.on = eng._powered(this.zone);
    this.t = 0;
    this.level = LOOP_LEVEL[name] ?? 0.3;
    this.voice = null;
    this.onFlicker = null;
    if (name === 'fridge') { this.running = Math.random() < 0.6; this.timer = rnd(15, 70); }
    if (name === 'tube_hum') this.timer = rnd(10, 40);
    if (name === 'city') { this.bus = rnd(15, 50); this.dog = rnd(90, 240); }
    if (name === 'rain') { this.gut = rnd(10, 40); this.tin = rnd(2, 8); }
    if (name === 'drip') this.timer = rnd(0.3, 2);
    if (name !== 'drip') {
      const b = eng._get(`lp:${name}`);
      if (b) {
        // arranca en un punto al azar del loop para que dos loops iguales no suenen en fase
        this.voice = new Voice(eng, b, { pos: this.pos, roomId: this.room, gain: this._target(), loop: true, bus: 'amb', diffuse: !!this.pos && DIFFUSE.has(name), offset: Math.random() * b.duration });
      }
    }
    const self = this;
    this.handle = {
      setGain(g, t = 0.5) { self.gain = g; self._apply(t); },
      setPos(p, r) { if (!p) return; self.pos = { x: p.x, y: p.y ?? 1, z: p.z }; self.room = eng._roomOf(p, r); self.voice?.setPos(p, self.room); },
      stop() { self.stop(); },
      flicker(d) { self._flicker(d); },
      get running() { return self.name !== 'fridge' || (self.on && self.running); },
      set onFlicker(fn) { self.onFlicker = fn; },
      get onFlicker() { return self.onFlicker; },
    };
  }
  _zoneOf(name, room) {
    if (name === 'building_hum') return 'building';
    if (['fridge', 'tube_hum', 'tv_static', 'tv_program'].includes(name)) return ONE_B.has(room) ? '1b' : 'building';
    return null;
  }
  _target() {
    let g = this.gain * this.level;
    if (this.zone && !this.on) g = 0;
    if (this.name === 'fridge' && !this.running) g = 0;
    return g;
  }
  _apply(t = 0.3) {
    const v = this.voice; if (!v || v.dead || this._pendingOn > 0) return;
    v.userGain = this._target();
    v.gainTc = Math.max(0.03, t / 3);
    v.update(0, true);
  }
  _one(name, gain = 1, posOverride) {
    return this.eng.play(name, { pos: posOverride ?? this.pos, roomId: this.room, gain: gain * this.gain });
  }
  powerChanged() {
    const on = this.eng._powered(this.zone);
    if (on === this.on || !this.zone) return;
    this.on = on;
    const v = this.voice, now = this.eng.ctx.currentTime;
    if (!on) {
      if (this.name === 'fridge' && this.running) { v?.src.playbackRate.setTargetAtTime(0.6, now, 0.4); this._one('_fridge_stop', 0.7); }
      if (this.name === 'tube_hum') this._one('_tube_flicker', 0.6);
      if (this.name.startsWith('tv_')) this._one('tv_off', 0.6);
    } else {
      if (this.name === 'tube_hum') { this._one('tube_start', 0.6); }
      if (this.name.startsWith('tv_')) this._one('tv_on', 0.6);
      if (this.name === 'fridge') { this.running = false; this.timer = rnd(2, 6); }
    }
    if (v) {
      v.gainTc = on ? 0.08 : 0.25;
      if (on && this.name === 'tube_hum') this._pendingOn = 1.4; // el cebador tarda
      else { v.userGain = this._target(); v.update(0, true); }
      if (on) v.src.playbackRate.setTargetAtTime(1, now, 0.2);
    }
  }
  _flicker(d = rnd(0.2, 0.7)) {
    const v = this.voice; if (!v || !this.on) return;
    const now = this.eng.ctx.currentTime, gn = v.occ.gain, cur = gn.value;
    gn.cancelScheduledValues(now);
    gn.setValueAtTime(cur, now);
    let t = now;
    while (t < now + d) { gn.setValueAtTime(cur * rnd(0, 0.3), t); t += rnd(0.03, 0.1); gn.setValueAtTime(cur, t); t += rnd(0.02, 0.12); }
    this._one('_tube_flicker', 0.5);
    this.onFlicker?.(d);
    this._hold = d + 0.1;
  }
  update(dt) {
    if (this.dead) return;
    if (this._pendingOn > 0) { this._pendingOn -= dt; if (this._pendingOn <= 0 && this.voice) { this.voice.userGain = this._target(); this.voice.update(0, true); } }
    if (this._hold > 0) { this._hold -= dt; if (this.voice) this.voice._skip = true; } else if (this.voice) this.voice._skip = false;
    const n = this.name;
    if (n === 'fridge' && this.on) {
      this.timer -= dt;
      if (this.timer <= 0) {
        const v = this.voice, now = this.eng.ctx.currentTime;
        this.running = !this.running;
        if (this.running) {
          this._one('_fridge_start', 0.8);
          v.src.playbackRate.setValueAtTime(0.7, now); v.src.playbackRate.setTargetAtTime(1, now, 0.15);
          this.timer = rnd(40, 110);
        } else {
          this._one('_fridge_stop', 0.7);
          v.src.playbackRate.setTargetAtTime(0.75, now, 0.25);
          this.timer = rnd(50, 150);
        }
        v.userGain = this._target(); v.update(0, true);
        if (this.running) v.src.playbackRate.setTargetAtTime(1, now, 0.15);
      }
    } else if (n === 'tube_hum' && this.on) {
      this.timer -= dt;
      if (this.timer <= 0) { this.timer = rnd(14, 60); this._flicker(); }
    } else if (n === 'city') {
      this.bus -= dt; this.dog -= dt;
      if (this.bus <= 0) {
        this.bus = rnd(45, 120);
        const p = this.pos ?? this.eng.listener.pos;
        this._one('_bus', rnd(0.6, 1), { x: p.x + rnd(-6, 6), y: 1, z: p.z + rnd(-6, 6) });
      }
      if (this.dog <= 0) {
        this.dog = rnd(150, 360);
        const p = this.pos ?? this.eng.listener.pos;
        this._one('_dog', rnd(0.15, 0.3), { x: p.x + rnd(-30, 30), y: 3, z: p.z + rnd(-30, 30) });
      }
    } else if (n === 'rain') {
      this.gut -= dt; this.tin -= dt;
      const p = this.pos ?? this.eng.listener.pos;
      if (this.gut <= 0) { this.gut = rnd(20, 70); this._one('_gutter', rnd(0.4, 0.8), { x: p.x + rnd(-3, 3), y: rnd(0.5, 3), z: p.z + rnd(-3, 3) }); }
      if (this.tin <= 0) { this.tin = rnd(1.5, 9); this._one('_tin', rnd(0.15, 0.4), { x: p.x + rnd(-4, 4), y: rnd(1, 3), z: p.z + rnd(-4, 4) }); }
    } else if (n === 'drip') {
      this.timer -= dt;
      if (this.timer <= 0) {
        // goteo irregular: a veces acelera, a veces se corta un rato
        this.timer = Math.random() < 0.08 ? rnd(4, 9) : rnd(0.7, 2.6);
        this._one('water_drip', rnd(0.4, 0.8));
      }
    }
  }
  stop() {
    this.dead = true;
    this.voice?.stop(0.3);
    this.eng.loops.delete(this);
  }
}
