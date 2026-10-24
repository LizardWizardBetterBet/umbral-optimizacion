// The imitator. A physical presence with limited senses, a memory of what each player does, drives
// that shift with what it learns, and strategies it abandons when they stop working. It never knows
// where a player is unless it saw, heard, or inferred it. Every manifestation is an action it performs
// somewhere in the building with its own body.
import * as THREE from 'three';
import { createEntityBody } from './Body.js';
import { propagate } from '../audio/propagation.mjs';
import { Nav } from './Nav.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const TEMPER = {
  paciente:    { curiosity: 1.25, hunger: .55, caution: 1.2, lure: 1.1, manip: 1.2 },
  territorial: { curiosity: .9, hunger: .85, caution: .9, lure: .8, manip: 1.0, guards: true },
  cazador:     { curiosity: .8, hunger: 1.15, caution: .7, lure: 1.3, manip: .8 },
};
const SPEED = { walk: .85, stalk: 1.15, run: 3.05, search: 1.35 };
const LAIRS = ['hueco', 'baulera', 'dormitorio'];

export class Entity {
  constructor(game) {
    this.g = game; this.b = game.building; this.nav = new Nav(this.b);
    this.T = TEMPER[game.variant.temperament];
    this.rand = game.rand;
    this.body = createEntityBody({ guise: 'elena' }); this.body.setLayer(2); this.body.setWrongness(.35);
    game.scene.add(this.body.root);
    // lair: wherever Elena is NOT hiding
    this.lair = game.variant.elena === 'hueco' ? 'baulera' : 'hueco';
    const ln = this.nav.byRoom[this.lair][0];
    this.pos = V(ln.x, 0, ln.z); this.room = this.lair; this.facing = 0;
    this.speed = 0; this.mode = 'still'; this.path = null; this.waitDoor = null; this.lookAt = null;
    this.goal = { type: 'dormant', until: 30 }; this.lastGoals = [];
    this.belief = null;                        // {pos, room, t, c, by}
    this.aware = 0; this.hunger = .05; this.caution = 0; this.wrong = .35;
    this.mem = {
      roomHeat: {}, hideUse: {}, sawHide: null, closesDoorsFleeing: 0, doorsClosed: 0, escapes: {}, torched: 0, seenBy: 0,
      lureBites: 0, lureIgnored: 0, learned: new Set(), knock: null, voices: [], lightsOn: 0, lightsUsed: 0, stareTime: 0,
      chases: 0, lostIn: {}, minuteroUse: 0, tapesHeard: 0,
    };
    this.log = []; this.timers = { sense: 0, plan: 0, lastLure: -40, lastManip: -25, lastChase: -60, lastSeenByPlayer: -99, tableau: false };
    this.seenByPlayer = false; this.seenT = 0; this.fear = 0; this.carry = null; this.revealed = false;
    this.escorting = false; this.doorQueue = [];
    // ventana de gracia: los primeros minutos no persigue ni mata (sí acecha, manipula, se deja ver)
    this.grace = (this.T === TEMPER.cazador ? 200 : this.T === TEMPER.territorial ? 200 : 225) + this.rand() * 50;
    if (game.params.has('nobody')) this.disabled = true;
  }

  // ======================= senses =======================
  hear(ev) {
    if (this.disabled || ev.by === 'entity') return;
    const res = propagate(ev.room, this.room, this.g.acousticsCache ||= this.g.acoustics().portals, this.g.acousticsRooms ||= this.g.acoustics().rooms, { fromPos: ev.pos, toPos: this.pos });
    const level = (ev.loud || 0) * res.gain * (this.goal.type === 'dormant' ? .8 : 1.15);
    if (level < .05) return;
    // where does it think the sound came from? same room: roughly the source. Otherwise: the doorway it came through.
    const same = ev.room === this.room;
    const guess = same || !res.via ? ev.pos.clone().add(V((this.rand() - .5) * 1.2, 0, (this.rand() - .5) * 1.2)) : V(res.via.x, 0, res.via.z);
    const c = Math.min(1, level * 2.2) * (same ? 1 : .7);
    // del otro lado: el cuarto inmediato por donde llegó el sonido (no el umbral, que es ambiguo)
    const fromRoom = same ? ev.room : (res.path.length > 1 ? res.path[res.path.length - 2] : ev.room);
    if (!this.belief || c >= this.belief.c * Math.exp(-(this.g.t - this.belief.t) / 25) * .8) this.belief = { pos: guess, room: fromRoom, t: this.g.t, c, by: ev.by, exact: same && level > .3, kind: ev.kind };
    this.aware = Math.min(1, this.aware + level * .35);
    if (ev.by && ev.by !== 'world') { this.mem.learned.add(ev.kind); this.mem.roomHeat[ev.room] = (this.mem.roomHeat[ev.room] || 0) + level; }
    if (ev.kind === 'kick') { this.hunger += .12; this.note('kick', 'Escuchó la patada contra la puerta del 1°B. Desde ese momento supo que estaban adentro.'); }
    if (ev.kind === 'voice') this.note('voice', 'Escuchó sus voces. Las guardó.');
    if (ev.kind === 'tape') { this.mem.tapesHeard++; this.hunger += .06; this.note('tape', 'Oyó la voz de Elena saliendo del grabador. Fue hacia el sonido.'); }
    if (ev.kind === 'knock') this.note('knockheard', 'Escuchó cómo golpeaban las puertas.');
    if (this.goal.type === 'dormant' && level > .12) this.replan(true);
    if (this.goal.type === 'lure' && this.goal.placed && ev.by !== 'world') this.checkLureResponse();
  }

  sense(dt) {
    const t = this.g.t, eye = V(this.pos.x, 1.5, this.pos.z);
    const fwd = V(Math.sin(this.facing), 0, Math.cos(this.facing));
    for (const p of this.g.players) {
      if (!p.alive) continue;
      const pp = p.hidden ? p.hidden.pos : p.pos; const to = V(pp.x - this.pos.x, 0, pp.z - this.pos.z); const d = to.length();
      let seen = false;
      if (!p.hidden && d < 24 && this.b.lineOfSight(eye, pp)) {
        const ang = fwd.dot(to.clone().normalize());
        const lit = this.g.lighting.lightAt(pp, p.room) + (p.flashlight ? .9 : 0) + Math.min(.25, p.speed * .08) - (p.crouch ? .12 : 0);
        const range = 2.2 + 17 * Math.max(0, lit);
        if ((ang > .25 || d < 2.2) && d < range) seen = true;
      }
      // the flashlight beam itself is a beacon
      const cam = this.g.camera; const toMe = V(this.pos.x, 1.4, this.pos.z).sub(cam.position); const dm = toMe.length();
      if (p.flashlight && !p.hidden && dm < 17 && p.forward(V()).dot(toMe.normalize()) > Math.cos(.4) && this.b.lineOfSight(cam.position, this.pos)) {
        seen = true; if (!this.inBeam) { this.inBeam = true; this.mem.torched++; this.caution += .18 * this.T.caution; this.note('torch' + Math.min(2, this.mem.torched), this.mem.torched >= 2 ? 'Aprendió que la linterna la busca. Empezó a acercarse por detrás de ustedes.' : 'La linterna le dio de lleno.'); }
      } else this.inBeam = false;
      if (seen) {
        this.belief = { pos: pp.clone(), room: p.room, t, c: 1, by: p.id, exact: true, kind: 'sight' };
        this.aware = Math.min(1, this.aware + dt * 1.2); this.mem.roomHeat[p.room] = (this.mem.roomHeat[p.room] || 0) + dt;
        this.lastSight = t;
      }
      // the player entering a hiding place in its sight is never forgotten
      if (p.hidden && this.lastSight && t - this.lastSight < 1.2 && !this.sawHideNoted) { this.mem.sawHide = p.hidden.id; this.sawHideNoted = true; this.note('sawhide', `Los vio meterse en ${p.hidden.label}.`); }
      if (!p.hidden) this.sawHideNoted = false;
    }
  }

  // does a player see the entity right now?
  playerSees() {
    const p = this.g.player; if (!p.alive || p.hidden && p.hidden.id === 'bañera') return false;
    const cam = this.g.camera; const head = V(this.pos.x, 1.35, this.pos.z); const to = head.clone().sub(cam.position); const d = to.length();
    const dir = p.forward(V()); if (dir.dot(to.clone().normalize()) < Math.cos(.62) || d > 22) return false;
    if (!this.b.lineOfSight(cam.position, head)) return false;
    const lit = this.g.lighting.lightAt(head, this.room) + (p.flashlight && dir.dot(to.clone().normalize()) > Math.cos(.42) && d < 16 ? 1 : 0);
    return lit > .1 || d < 2.4;
  }

  // ======================= memory hooks from the game =======================
  observe(kind, data) {
    if (this.disabled) return;
    const t = this.g.t, m = this.mem;
    if (kind === 'door' && !data.open) { m.doorsClosed++; if (this.goal.type === 'chase' || t - this.timers.lastChase < 6) { m.closesDoorsFleeing++; if (m.closesDoorsFleeing === 2) this.note('doors', 'Aprendió que cierran las puertas cuando escapan. Dejó de detenerse a abrirlas despacio.'); } }
    if (kind === 'hide') { m.hideUse[data.spot] = (m.hideUse[data.spot] || 0) + 1; if (this.goal.type === 'chase' || t - this.timers.lastChase < 8) m.lostIn[data.spot] = (m.lostIn[data.spot] || 0) + 1; }
    if (kind === 'light' && data.on) m.lightsOn++;
    if (kind === 'took') { this.hunger += this.T.guards ? .22 : .08; if (this.T.guards) this.note('took', 'No le gustó que se llevaran los casetes de Elena.'); }
    if (kind === 'entered1b') { this.aware = Math.max(this.aware, .3); this.hunger += .05; }
    if (kind === 'forced') this.hunger += .1;
    if (kind === 'knock') { m.knock = data; m.learned.add('knock'); if (data.is21) this.note('pattern', 'Escuchó el golpe de Rubén: dos, y uno. Lo aprendió.'); }
    if (kind === 'torch') m.lightsUsed++;
  }

  wantsVoice() { return this.mem.voices.length < 4 && this.aware > .1; }
  learnVoice(buf) { this.mem.voices.push(buf); this.mem.learned.add('voice'); this.note('voicebuf', 'Grabó lo que dijeron. Lo usó después, desde otro cuarto.'); }

  // timers en tiempo de juego (no setTimeout: respetan la pausa y la simulación acelerada)
  later(fn, ms) { (this.queue ||= []).push({ at: this.g.t + ms / 1000, fn }); }
  runQueue() { if (!this.queue?.length) return; const t = this.g.t; const due = this.queue.filter(q => q.at <= t); if (!due.length) return; this.queue = this.queue.filter(q => q.at > t); for (const q of due) q.fn(); }

  note(key, text) { if (this.log.some(l => l.key === key)) return; const t = this.g.t; const mm = String(Math.floor(t / 60)).padStart(2, '0'), ss = String(Math.floor(t % 60)).padStart(2, '0'); this.log.push({ key, text: `<span class="muted">${mm}:${ss}</span> ${text}` }); }
  report() { const out = this.log.map(l => l.text); if (!out.length) out.push('Nada. O eso parece.'); return out; }
  fearSignal() { return Math.min(1, this.fear); }
  nearSheet(mesh) { return this.pos.distanceTo(mesh.position) < 1.6 && this.speed > .2; }

  // ======================= planning =======================
  canHurt() { return this.g.t > this.grace; }
  conf() { return this.belief ? this.belief.c * Math.exp(-(this.g.t - this.belief.t) / 25) : 0; }

  replan(force = false) {
    const t = this.g.t, c = this.conf(), T = this.T, m = this.mem;
    if (this.goal.type === 'chase' || this.goal.type === 'escort' || this.goal.type === 'reveal' || this.goal.type === 'kill') return;
    if (!force && t < this.goal.until && this.goal.type !== 'dormant') return;
    const r = () => (this.rand() - .5) * .3;
    const U = {
      // inquietud: cuanto más tiempo quieta, menos ganas de seguir quieta (también si el jugador es muy silencioso)
      dormant: (1 - this.aware) * .7 + this.caution * .5 - Math.min(.55, (t - (this.dormantSince ?? t)) / 160) * (this.g.entered ? 1.4 : .8) + r(),
      observe: (this.aware * .7 + .15) * T.curiosity * (c > .12 ? 1 : .2) - this.caution * .2 + r(),
      stalk: this.aware * .55 * (c > .25 ? 1 : .1) * (T === TEMPER.cazador ? 1.3 : 1) + r(),
      lure: this.aware * .55 * T.lure * (m.learned.size > 0 ? 1 : .3) * (t - this.timers.lastLure > 45 ? 1 : 0) * (m.lureIgnored >= 3 ? .3 : 1) + m.lureBites * .1 + r(),
      manipulate: (this.aware * .5 + .1) * T.manip * (t - this.timers.lastManip > 35 ? 1 : 0) + r(),
      hunt: this.hunger * T.hunger * (c > .15 ? 1 : .4) * (t - this.timers.lastChase > 40 ? 1 : 0) * (this.canHurt() ? 1 : .5) - this.caution * .25 + r(),
    };
    // anti-repetition: it doesn't do the same thing three times in a row
    for (const g of this.lastGoals.slice(-2)) if (U[g] !== undefined) U[g] -= .18;
    if (t < 20) { U.hunt = -1; U.lure = -1; }
    const type = Object.entries(U).sort((a, b) => b[1] - a[1])[0][0];
    this.setGoal(type);
  }

  setGoal(type, extra = {}) {
    const t = this.g.t;
    this.goal = { type, start: t, until: t + 18 + this.rand() * 22, ...extra };
    this.lastGoals.push(type); if (this.lastGoals.length > 6) this.lastGoals.shift();
    this.path = null; this.goalStep = 0;
    if (type === 'manipulate') this.pickManipulation();
    if (type === 'lure') { this.pickLure(); this.goal.until = t + 55; } // tiene que llegar y esperar
    if (type === 'hunt') { this.hunger *= .8; this.searchList = this.searchPlan(); }
    if (type === 'dormant') { this.goal.until = t + 25 + this.rand() * 30; if (this.lastGoals.at(-2) !== 'dormant') this.dormantSince = t; }
    if (type === 'manipulate' || type === 'hunt') this.goal.until = t + 60 + this.rand() * 20; // hay que llegar caminando
  }

  // ---- hunt: where would they be? last known position, then hiding spots by experience, then hot rooms
  searchPlan() {
    const list = []; const m = this.mem;
    if (this.belief) list.push({ room: this.belief.room, pos: this.belief.pos });
    if (m.sawHide) list.push({ hide: m.sawHide });
    // donde siempre se le escapan: va a esperarlos ahí
    for (const [r, n] of Object.entries(m.escapes)) if (n >= 2 && this.nav.byRoom[r]) list.push({ room: r, ambush: true });
    const spots = Object.entries({ ...m.hideUse }).sort((a, b) => b[1] - a[1]).map(([s]) => s);
    for (const s of spots) if (s !== m.sawHide) list.push({ hide: s });
    const hot = Object.entries(m.roomHeat).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([r]) => r);
    for (const r of hot) list.push({ room: r });
    return list;
  }

  pickLure() {
    const m = this.mem, g = this.g, p = g.player;
    // place the lure in a room adjacent to where it believes the player is, not where the player is
    const base = this.belief?.room || p.room; const opts = this.b.neighbors(base).map(n => n.room).filter(r => this.nav.byRoom[r] && r !== 'calle');
    const room = opts.length ? opts[Math.floor(this.rand() * opts.length)] : 'living';
    let sound = 'whisper';
    if (m.voices.length && this.rand() < .7) sound = 'voice';
    else if (m.knock && this.rand() < .6) sound = 'knock';
    else if (m.learned.has('step') && this.rand() < .5) sound = 'steps';
    else if (this.rand() < .4) sound = 'tape';
    this.goal.lure = { room, sound }; this.goal.placed = false;
  }

  pickManipulation() {
    const g = this.g, L = g.lighting, m = this.mem, p = g.player, opts = [];
    const tv = g.props.things.tv;
    if (tv.screen.mode === 'off' && L.powered(tv.fixture) && p.room !== 'living') opts.push({ kind: 'tv', at: V(-8.8, 0, 13.6), w: 1.2 });
    if (L.power.palieres && (m.minuteroUse > 0 || g.minuteroUntil) && p.room !== 'lavadero') opts.push({ kind: 'breaker', id: 'palieres', at: V(2.8, 0, 32.4), w: .9 + (this.g.companion && !this.g.companion.fake ? 1.5 : 0) });
    if (L.power['1b'] && m.lightsOn >= 2 && p.room !== 'lavadero') opts.push({ kind: 'breaker', id: '1b', at: V(2.8, 0, 32.4), w: .8 });
    if (!g.minuteroUntil && !['zaguan', 'pasillo'].includes(p.room)) opts.push({ kind: 'minutero', at: V(-.8, 0, 16.2), w: .5 });
    for (const f of L.fixtures) if (f.on && f.switch && f.switch.startsWith('sw_') && L.lit(f) && f.room !== p.room && this.nav.byRoom[f.room]) opts.push({ kind: 'light', fx: f, at: this.switchSpot(f), w: .7 });
    const d1b = this.b.doors['1b']; if (d1b.isOpen && !d1b.locked && g.entered && !['hall1b', 'pasillo'].includes(p.room)) opts.push({ kind: 'close', door: '1b', at: V(-1.9, 0, 12.4), w: 1.0 + (m.escapes.zaguan || 0) * .5 });
    if (m.hideUse.placard && !this.chairMoved) opts.push({ kind: 'chair', at: V(-7.6, 0, 11.6), to: V(-8.6, 0, 19.2), w: 1.3 + m.hideUse.placard * .6 });
    if ((m.learned.has('voice') || m.tapesHeard >= 1) && !this.tapeLeft && g.player.inventory.has('grabador')) opts.push({ kind: 'tape', at: this.tapeSpot(), w: 1.1 });
    opts.push({ kind: 'pipes', at: this.rand() < .5 ? V(-2.3, 0, 16.8) : V(-4.0, 0, 19.1), w: .4 });
    // weighted choice
    let sum = opts.reduce((a, o) => a + o.w, 0), x = this.rand() * sum; let pick = opts[0];
    for (const o of opts) { x -= o.w; if (x <= 0) { pick = o; break; } }
    this.goal.manip = pick;
  }
  switchSpot(f) { const th = Object.values(this.g.props.things).find(t => t.fixture === f.id); const pos = th ? th.pos : f.pos; const n = this.nav.nearest(pos.x, pos.z, f.room); return V(n.x, 0, n.z); }
  tapeSpot() { const heat = this.mem.roomHeat; const r = ['zaguan', 'hall1b', 'pasillo'].sort((a, b) => (heat[b] || 0) - (heat[a] || 0))[0]; return r === 'zaguan' ? V(.3, 0, 3.2) : r === 'hall1b' ? V(-2.6, 0, 12.0) : V(-.4, 0, 14.5); }

  // ======================= per frame =======================
  update(dt, t) {
    if (this.disabled) return;
    this.runQueue();
    // si entraron al 1°B por una puerta que dejó abierta ella, también cuenta como "entraron"
    if (!this.g.entered && ['hall1b', 'living', 'cocina', 'distrib', 'dormitorio', 'bano'].includes(this.g.player.room)) this.g.enteredApartment?.();
    this.timers.sense -= dt; if (this.timers.sense <= 0) { this.timers.sense = .2; this.sense(.2); }
    this.aware = Math.max(0, this.aware - dt * .004); this.caution = Math.max(0, this.caution - dt * .006);
    this.hunger = Math.min(1, this.hunger + dt * .0016 * this.T.hunger * (this.g.entered ? 1.6 : .6));
    this.timers.plan -= dt; if (this.timers.plan <= 0) { this.timers.plan = 1.5 + this.rand() * 2; this.replan(); }
    this.firstTableau();
    // seen by the player
    const sees = this.playerSees(); const P = this.g.player;
    // histéresis: una mirada es un evento, no un parpadeo por frame
    if (sees) {
      this.seenT += dt; this.lastSeesT = t;
      // no puede "sentir" la mirada de alguien escondido: eso sólo asusta al jugador
      if (!this.seenByPlayer && !P.hidden) { this.seenByPlayer = true; this.mem.seenBy++; this.timers.lastSeenByPlayer = t; this.reactSeen(); }
    } else if (t - (this.lastSeesT ?? -9) > .8) { this.seenByPlayer = false; this.seenT = 0; }
    const dist = this.pos.distanceTo(P.hidden ? P.hidden.pos : P.pos);
    this.fear += ((sees ? 1 : 0) * Math.max(.3, 1 - dist / 12) + (this.goal.type === 'chase' ? .5 : 0) - this.fear) * Math.min(1, dt * 1.5);
    this.run(dt, t);
    this.embody(dt);
  }

  // what it does when it notices it's being looked at
  reactSeen() {
    const g = this.goal.type, d = this.pos.distanceTo(this.g.player.pos);
    if (['chase', 'escort', 'reveal', 'kill'].includes(g)) return;
    if (this.goal.type === 'tableau' && this.goal.phase !== 'go') return; // sentada: es la escena
    const h = this.hunger * this.T.hunger;
    if (h > .62 && d < 9 && this.g.t - this.timers.lastChase > 25 && this.canHurt()) return this.startChase();
    // otherwise: hold perfectly still for a moment, then remove itself from sight (never teleport)
    this.goal = { type: 'slip', start: this.g.t, until: this.g.t + 12, holdUntil: this.g.t + .8 + this.rand() * 1.6 };
    this.path = null; this.caution += .08 * this.T.caution;
    if (this.mem.seenBy === 1) this.note('seen1', 'Se dejó ver una vez. Quería ver qué hacían.');
  }

  startChase(force = false) {
    if (!force && !this.canHurt()) return;
    // aviso: se queda clavada mirándolos y respira, un segundo y pico, antes de correr
    this.goal = { type: 'chase', start: this.g.t, until: this.g.t + 40, windup: this.g.t + 1.1 + this.rand() * .6 }; this.path = null; this.mem.chases++;
    this.g.audio.play('breath', { pos: this.pos.clone(), roomId: this.room, gain: 1 });
    this.timers.lastChase = this.g.t; this.g.audio.music?.('chase');
    this.note('chase' + Math.min(3, this.mem.chases), this.mem.chases === 1 ? 'Decidió que ya sabía lo suficiente. Los persiguió.' : 'Volvió a perseguirlos. Esta vez ya conocía el camino.');
  }

  firstTableau() {
    // the first time a player steps into 1°B, it may already be sitting where Elena sat, in front of the TV
    if (this.timers.tableau || !this.g.entered || this.goal.type === 'chase') return;
    this.timers.tableau = true;
    if (this.rand() < .65 && this.g.player.room !== 'living') {
      this.goal = { type: 'tableau', start: this.g.t, until: this.g.t + 90, phase: 'go' }; this.path = null;
    }
  }

  // ---- movement toward a point along the nav graph, opening doors physically
  goTo(target, speedKind = 'walk', dt) {
    if (!this.path || !this.pathTarget || this.pathTarget.distanceTo(target) > .5) {
      const a = this.nav.nearest(this.pos.x, this.pos.z, this.room), bRoom = this.b.roomAt(target);
      const bn = this.nav.nearest(target.x, target.z, this.nav.byRoom[bRoom] ? bRoom : null);
      // el pasador de Elena (cerrado desde adentro) no lo abre desde afuera
      const doorCost = id => { if (!id) return 0; const d = this.b.doors[id]; if (d?.lockedInside && this.room !== id) return Infinity; return d && !d.isOpen ? 1.5 : 0; };
      const p = this.nav.path(a, bn, doorCost);
      this.pathTarget = target.clone();
      if (!p) { this.path = null; this.unreachable = true; this.speed = 0; return false; }
      this.path = p;
      // último tramo recto sólo si no atraviesa paredes
      const last = p.length ? p[p.length - 1].node : a;
      if (this.b.lineOfSight(V(last.x, 1, last.z), V(target.x, 1, target.z))) this.path.push({ node: { x: target.x, z: target.z, room: bRoom }, door: null });
      if (!p.length && !this.b.lineOfSight(this.pos, V(a.x, 1, a.z))) this.path.unshift({ node: a, door: null });
    }
    if (this.waitDoor) {
      const d = this.waitDoor; if (d.amount > .62) this.waitDoor = null; else { this.speed = 0; return false; }
    }
    if (!this.path) { this.speed = 0; return false; }
    const step = this.path[0]; if (!step) { this.speed = 0; return true; }
    // a closed door between here and the next node: open it with a hand, then wait
    if (step.door && this.b.doors[step.door] && !this.b.doors[step.door].isOpen) {
      const d = this.b.doors[step.door];
      if (Math.hypot(this.pos.x - step.node.x, this.pos.z - step.node.z) < 1.4 || this.distToDoor(d) < .9) {
        const fast = speedKind === 'run' || this.mem.closesDoorsFleeing >= 2;
        // una puerta con llave: la abre (vive acá), y al pasar la vuelve a cerrar con llave. Se oye.
        if (d.locked && !(d.id === '1b' && this.g.entered)) this.relock = { door: d, from: this.room };
        d.locked = false; d.lockedInside = d.lockedInside && this.room !== 'hueco' && this.room !== 'baulera' ? d.lockedInside : false;
        d.speed = fast ? 4.5 : .55; d.target = 1;
        this.g.audio.play(fast ? 'door_slam' : 'door_open_slow', { pos: d.handlePos(), roomId: this.room, gain: fast ? 1 : .8 });
        this.waitDoor = d; this.mode = 'reach'; this.speed = 0; return false;
      }
    }
    if (this.relock) {
      const R = this.relock, d = R.door;
      if (this.room !== R.from && this.distToDoor(d) > 1.3 && !(d.id === '1b' && this.g.entered)) {
        if (d.target !== 0) { d.target = 0; d.speed = .7; }
        if (d.amount < .03) { d.locked = true; this.g.audio.play('key_turn', { pos: d.handlePos(), roomId: this.room, gain: .7 }); this.g.noise?.({ pos: d.handlePos(), room: this.room, loud: 0, kind: 'key', by: 'entity' }); this.relock = null; this.note('relock', 'Cerró con llave detrás suyo. Tenía la llave de Elena.'); }
      } else if (this.g.entered && d.id === '1b') this.relock = null;
    }
    const tx = step.node.x, tz = step.node.z; const dx = tx - this.pos.x, dz = tz - this.pos.z; const dd = Math.hypot(dx, dz);
    const v = SPEED[speedKind] || SPEED.walk;
    if (dd < .15) { this.path.shift(); return this.path.length === 0; }
    const mv = Math.min(dd, v * dt); this.pos.x += dx / dd * mv; this.pos.z += dz / dd * mv;
    this.speed = v; const want = Math.atan2(dx, dz); this.turnTo(want, dt * (speedKind === 'run' ? 10 : 4));
    this.room = this.b.roomAt(this.pos) || this.room;
    // footsteps: uneven, sometimes a scuff, sometimes nothing at all
    this.stepAcc = (this.stepAcc || 0) + mv;
    if (this.stepAcc > (speedKind === 'run' ? 1.1 : .62)) {
      this.stepAcc = 0; const loudness = speedKind === 'run' ? 1 : speedKind === 'stalk' ? .35 : .55;
      if (this.rand() > .08) this.g.audio.footstep({ surface: this.b.rooms[this.room]?.surface || 'mosaic', intensity: loudness, pos: this.pos.clone(), roomId: this.room, by: this.escorting ? 'elena' : 'entity' });
    }
    return false;
  }
  distToDoor(d) { const h = d.hinge; return Math.hypot(this.pos.x - h.x, this.pos.z - h.y); }
  turnTo(a, k) { let d = a - this.facing; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; this.facing += d * Math.min(1, k); }

  // ======================= goal execution =======================
  run(dt, t) {
    const G = this.goal, P = this.g.player, m = this.mem;
    if (G.type === 'escort') return;
    this.mode = 'idle'; this.lookAt = null;
    switch (G.type) {
      case 'dormant': {
        const lairNode = this.nav.byRoom[this.lair][0];
        if (this.room !== this.lair) this.goTo(V(lairNode.x, 0, lairNode.z), 'walk', dt), this.mode = 'walk';
        else { this.speed = 0; this.mode = 'still'; }
        break;
      }
      case 'tableau': {
        const seat = this.g.props.things.sillon;
        if (G.phase === 'go') {
          if (this.g.props.things.tv.screen.mode === 'off' && this.g.lighting.powered(this.g.props.things.tv.fixture)) this.g.setTV('static', 'entity');
          const spot = V(seat.pos.x + .55, 0, seat.pos.z - .35);
          if (this.goTo(spot, 'walk', dt)) G.phase = 'sit';
          this.mode = 'walk';
        } else if (G.phase === 'sit') {
          this.turnTo(Math.atan2(-9.2 - this.pos.x, 14.2 - this.pos.z), dt * 3); this.speed = 0; this.mode = 'still';
          const d = this.pos.distanceTo(P.pos);
          if (this.seenByPlayer && (d < 3 || this.inBeam || this.seenT > 4)) { G.phase = 'leave'; G.holdUntil = t + 1.2; this.note('tableau', 'La esperaba sentada frente al televisor, donde se sentaba Elena.'); }
          if (t > G.until) this.replan(true);
        } else {
          if (t < G.holdUntil) { this.mode = 'turn_head'; this.lookAt = this.g.camera.position; this.speed = 0; break; }
          G.type = 'slip'; G.holdUntil = t; G.until = t + 12;
        }
        break;
      }
      case 'slip': {
        if (t < G.holdUntil) { this.speed = 0; this.mode = 'still'; this.lookAt = this.g.camera.position; break; }
        if (!G.dest) G.dest = this.hidingDestination();
        this.mode = 'walk'; if (this.goTo(G.dest, this.seenByPlayer ? 'walk' : 'stalk', dt) || t > G.until) this.replan(true);
        break;
      }
      case 'observe': {
        // a dark vantage point with sight of where it believes the player is
        if (!G.spot || t - (G.spotT || 0) > 8) { G.spot = this.vantage(); G.spotT = t; }
        if (!G.spot) { this.replan(true); break; }
        const arrived = this.goTo(G.spot, 'stalk', dt); this.mode = arrived ? 'still' : 'stalk';
        if (arrived && this.belief) { this.lookAt = V(this.belief.pos.x, 1.5, this.belief.pos.z); this.turnTo(Math.atan2(this.belief.pos.x - this.pos.x, this.belief.pos.z - this.pos.z), dt * 2); m.stareTime += dt; }
        if (m.stareTime > 25) this.note('stare', 'Los estuvo mirando un rato largo desde lo oscuro. No se dieron cuenta.');
        break;
      }
      case 'stalk': {
        if (!this.belief) { this.replan(true); break; }
        const bp = this.belief.pos; const d = this.pos.distanceTo(bp);
        // stay 5-9 m behind, never in their view cone, approach from behind if they learned to sweep with the torch
        const behind = this.mem.torched >= 2; const pf = P.forward(V()); const target = behind ? bp.clone().addScaledVector(V(pf.x, 0, pf.z).normalize(), -5) : bp;
        if (d > 6.5) { this.goTo(target, 'stalk', dt); this.mode = 'stalk'; } else { this.speed = 0; this.mode = 'still'; this.lookAt = V(bp.x, 1.5, bp.z); }
        if (this.conf() < .1) this.replan(true);
        break;
      }
      case 'lure': {
        const L = G.lure; const node = this.nav.byRoom[L.room][Math.floor(this.rand() * 0.999 * this.nav.byRoom[L.room].length)];
        if (!G.at) G.at = V(node.x, 0, node.z);
        if (!G.placed) { this.mode = 'stalk'; if (this.goTo(G.at, 'stalk', dt)) { this.emitLure(L); G.placed = t; G.playerD0 = P.pos.distanceTo(G.at); } }
        else {
          // wait in the dark next to it: did they come?
          this.speed = 0; this.mode = 'still';
          if (P.pos.distanceTo(G.at) < 3) { m.lureBites++; this.note('bite', 'Fueron hacia el sonido que les dejó. Lo anotó.'); if (this.hunger * this.T.hunger > .45 && this.b.lineOfSight(this.pos, P.pos)) this.startChase(); else this.replan(true); }
          else if (t - G.placed > 22) { m.lureIgnored++; if (m.lureIgnored === 2) this.note('ignored', 'Dejaron de hacerle caso a los ruidos. Cambió de táctica.'); this.timers.lastLure = t; this.replan(true); }
          else if (t - G.placed > 9 && !G.second) { G.second = true; this.emitLure(L); }
        }
        break;
      }
      case 'manipulate': {
        const M = G.manip; if (!M) { this.replan(true); break; }
        if (M.kind === 'chair' && this.carry) { this.mode = 'walk'; if (this.goTo(M.to, 'walk', dt)) { this.dropChair(M.to); this.timers.lastManip = t; this.replan(true); } break; }
        this.mode = 'walk';
        if (this.goTo(M.at, 'walk', dt)) { this.doManipulation(M); if (!(M.kind === 'chair' && this.carry)) { this.timers.lastManip = t; G.until = t; this.replan(true); } }
        break;
      }
      case 'hunt': {
        const next = this.searchList?.[0];
        if (this.lastSight && t - this.lastSight < .4 && this.hunger * this.T.hunger > .4) { this.startChase(); break; }
        if (!next) { this.replan(true); break; }
        let dest = next.pos;
        if (next.hide) dest = V(...HIDE_FRONT[next.hide]);
        if (!dest) { const n = this.nav.byRoom[next.room]?.[0]; dest = n ? V(n.x, 0, n.z) : null; }
        if (!dest) { this.searchList.shift(); break; }
        this.mode = 'walk';
        if (this.goTo(dest, 'search', dt)) {
          if (next.hide) this.checkHide(next.hide); else this.searchList.shift();
        }
        break;
      }
      case 'chase': {
        const seeNow = this.lastSight && t - this.lastSight < .5;
        const tgt = seeNow ? (P.hidden ? P.hidden.pos : P.pos) : this.belief?.pos;
        if (!tgt) { this.setGoal('hunt'); break; }
        if (t < G.windup) { this.speed = 0; this.mode = 'still'; this.lookAt = this.g.camera.position; this.turnTo(Math.atan2(P.pos.x - this.pos.x, P.pos.z - this.pos.z), dt * 6); break; }
        this.mode = 'run'; this.wrong = 1;
        // nunca mata en el arranque: el jugador siempre tiene un par de segundos de ventaja
        if (seeNow && this.pos.distanceTo(P.pos) < .85 && !P.hidden && t > G.windup + 1.4) { this.kill(); break; }
        const arrived = this.goTo(tgt, 'run', dt);
        if (!seeNow && (arrived || t - (this.lastSight || 0) > 7)) {
          // lost them. note where, and switch to searching with that knowledge
          const r = this.belief?.room || this.room; m.escapes[r] = (m.escapes[r] || 0) + 1;
          if (m.escapes[r] === 2) this.note('escape_' + r, `Notó que siempre escapan hacia ${this.b.rooms[r].name.replace('1°B · ', 'el ').toLowerCase()}. Empezó a esperarlos ahí.`);
          this.g.audio.music?.('none'); this.hunger *= .7;
          this.setGoal('hunt'); this.goal.until = t + 30;
        }
        break;
      }
      case 'escort': break; // driven by Companion
      case 'reveal': {
        this.speed = 0; this.mode = 'turn_head'; this.lookAt = this.g.camera.position; this.wrong = Math.min(1, this.wrong + dt * .6);
        if (t > G.until) { this.escorting = false; this.g.companion = null; this.hunger = 1; this.startChase(true); }
        break;
      }
      case 'kill': this.speed = 0; this.mode = 'reach'; this.lookAt = this.g.camera.position; break;
    }
    if (this.unreachable) { this.unreachable = false; this.path = null; if (G.type === 'chase') this.setGoal('hunt'); else if (G.type === 'hunt') this.searchList?.shift(); else if (!['escort', 'reveal', 'kill'].includes(G.type)) this.replan(true); }
    // territorial: it will not tolerate them carrying the tapes in its rooms
    if (this.T.guards && ['observe', 'stalk', 'dormant'].includes(G.type) && this.lastSight && t - this.lastSight < .3 && ['living', 'dormitorio'].includes(P.room) && ['elena2', 'elena3'].some(x => P.inventory.has(x)) && this.hunger > .45 && t - this.timers.lastChase > 30) this.startChase();
  }

  hidingDestination() {
    // a dark room out of the player's sight, preferably not where they are heading
    const P = this.g.player; const cand = [];
    for (const n of this.nav.nodes) {
      if (n.portal) continue; const r = n.room; if (r === P.room) continue;
      const lit = this.g.lighting.lightAt(V(n.x, 1, n.z), r); const vis = this.b.lineOfSight(P.pos, V(n.x, 0, n.z));
      const d = Math.hypot(n.x - this.pos.x, n.z - this.pos.z);
      cand.push({ n, s: lit * 4 + (vis ? 6 : 0) + Math.abs(d - 7) * .3 + this.rand() });
    }
    cand.sort((a, b) => a.s - b.s); const n = cand[0]?.n || this.nav.byRoom[this.lair][0];
    return V(n.x, 0, n.z);
  }

  vantage() {
    if (!this.belief) return null;
    const bp = this.belief.pos, P = this.g.player; const pf = P.forward(V()); let best = null, bs = 1e9;
    for (const n of this.nav.nodes) {
      const p = V(n.x, 0, n.z); const d = p.distanceTo(bp); if (d < 3.5 || d > 11) continue;
      if (!this.b.lineOfSight(V(n.x, 1.5, n.z), V(bp.x, 1.5, bp.z))) continue;
      const lit = this.g.lighting.lightAt(V(n.x, 1.2, n.z), n.room);
      const inView = pf.dot(p.clone().sub(P.pos).normalize()) > .5 ? 1 : 0;
      const s = lit * 6 + inView * (this.mem.torched >= 2 ? 6 : 2.5) + Math.abs(d - 6) * .3 + this.rand() * .8;
      if (s < bs) { bs = s; best = p; }
    }
    return best;
  }

  emitLure(L) {
    const a = this.g.audio, pos = this.pos.clone(), room = this.room;
    if (L.sound === 'voice' && this.mem.voices.length) { const buf = this.mem.voices[Math.floor(this.rand() * this.mem.voices.length)]; a.playBuffer?.(buf, { pos, roomId: room, gain: .9, color: 'wall' }); this.note('usedvoice', 'Usó sus propias voces para llamarlos desde otro cuarto.'); }
    else if (L.sound === 'knock') { const k = this.mem.knock; const gaps = k?.is21 ? [.3, 1.0] : [.35, .35]; let tt = 0; a.play('knock', { pos, roomId: room }); for (const gp of gaps) { tt += gp; this.later(() => a.play('knock', { pos, roomId: room }), tt * 1000); } this.note('usedknock', k?.is21 ? 'Golpeó como golpeaba Rubén, para que creyeran que era Elena.' : 'Golpeó igual que ustedes.'); }
    else if (L.sound === 'steps') { for (let i = 0; i < 5; i++) this.later(() => a.footstep({ surface: this.b.rooms[room]?.surface || 'parquet', intensity: .5, pos, roomId: room, by: 'player' }), i * 520); this.note('usedsteps', 'Imitó sus pasos en otro cuarto.'); }
    else if (L.sound === 'tape') { a.tape?.('mimic', { pos, roomId: room, short: true }); this.note('usedtape', 'Hizo sonar la voz de Elena donde no había nadie.'); }
    else { a.play('whisper', { pos, roomId: room }); }
  }

  checkLureResponse() { }

  doManipulation(M) {
    const g = this.g, P = g.player;
    if (M.kind === 'tv') { g.setTV(this.rand() < .5 ? 'program' : 'static', 'entity'); this.note('tv', 'Prendió el televisor de Elena, como todas las noches.'); }
    if (M.kind === 'breaker') { g.flipBreaker(M.id, 'entity'); this.note('breaker_' + M.id, M.id === 'palieres' ? 'Bajó la térmica de los palieres. Había notado que dependían del pulsador de luz.' : 'Cortó la luz del 1°B. Había visto que prendían todas las luces.'); }
    if (M.kind === 'minutero') { g.pressMinutero('entity'); this.mem.minuteroUse++; this.note('minutero', 'Apretó el pulsador de luz del pasillo. Alguien vio la luz prenderse sola.'); }
    if (M.kind === 'light' && M.fx.on) { M.fx.on = false; g.audio.play('switch', { pos: M.fx.pos, roomId: M.fx.room }); this.note('lightoff', 'Apagó las luces que dejaron prendidas.'); }
    if (M.kind === 'close') { const d = this.b.doors[M.door]; d.speed = .5; d.target = 0; g.audio.play('door_open_slow', { pos: d.handlePos(), roomId: 'hall1b', gain: .5 }); this.note('closed1b', 'Cerró la puerta del 1°B, la que dejaban abierta para escapar.'); }
    if (M.kind === 'chair') { this.pickChair(); }
    if (M.kind === 'tape') { this.leaveTape(this.pos.clone()); }
    if (M.kind === 'pipes') { for (let i = 0; i < 3; i++) this.later(() => g.audio.play('pipe_knock', { pos: this.pos.clone(), roomId: this.room }), i * (300 + this.rand() * 600)); this.note('pipes', 'Golpeó las cañerías, como se quejaban los vecinos.'); }
  }

  pickChair() {
    const ch = this.g.props.things.silla_living; if (!ch?.root) return; this.carry = ch.root; this.g.audio.play('chair_scrape', { pos: this.pos.clone(), roomId: this.room });
  }
  dropChair(at) {
    const c = this.carry; this.carry = null; c.position.set(at.x, 0, at.z); c.rotation.y = Math.atan2(-9.7 - at.x, 19.4 - at.z) + Math.PI; this.chairMoved = true;
    this.g.audio.play('chair_scrape', { pos: at.clone(), roomId: this.b.roomAt(at) });
    this.note('chair', 'Puso una silla del comedor frente al placard donde se escondían. Mirando hacia adentro.');
  }

  leaveTape(at) {
    this.tapeLeft = true; const g = this.g;
    const tape = new THREE.Group(); const b = new THREE.Mesh(new THREE.BoxGeometry(.1, .012, .064), new THREE.MeshStandardMaterial({ color: 0x1c1b1a, roughness: .4 })); tape.add(b);
    tape.position.set(at.x, .006, at.z); tape.rotation.y = this.rand() * 6; g.scene.add(tape);
    tape.traverse(o => { if (o.isMesh) { o.userData.thing = 'item:mimic'; g.pickables.push(o); } });
    g.items.mimic = { id: 'mimic', mesh: tape, taken: false };
    this.note('lefttape', 'Les dejó un casete en el camino. Tenía sus propios ruidos grabados.');
  }

  checkHide(spot) {
    const P = this.g.player; const th = this.g.props.things[spot === 'bañera' ? 'cortina' : spot];
    this.speed = 0; this.mode = 'reach';
    if (th?.doors) for (const d of th.doors) d.piv.rotation.y = d.side * -1.2;
    this.g.audio.play(spot === 'placard' ? 'wardrobe_open' : 'pickup_small', { pos: th.pos, roomId: th.room });
    const found = P.hidden && P.hidden.id === spot;
    this.later(() => { if (th?.doors && !(P.hidden && P.hidden.id === spot)) for (const d of th.doors) d.piv.rotation.y = 0; }, 2500);
    this.searchList.shift();
    if (found) {
      this.mem.hideUse[spot] = (this.mem.hideUse[spot] || 0) + 2;
      // la primera vez que los encuentra escondidos, los perdona: es la lección (y la silla frente al placard)
      if (this.canHurt() && this.mem.spared && (this.hunger * this.T.hunger > .5 || this.mem.sawHide === spot && this.mem.chases > 1)) { this.note('foundhide', `Los buscó en ${HIDE_NAME[spot]}. Ya sabía que se escondían ahí.`); this.kill(); }
      else { this.mem.spared = (this.mem.spared || 0) + 1; this.note('spared', `Abrió ${HIDE_NAME[spot]}, los miró, y cerró. Todavía no.`); this.goal = { type: 'slip', start: this.g.t, until: this.g.t + 15, holdUntil: this.g.t + 3.5 }; this.lookAt = this.g.camera.position; this.hunger += .25; this.later(() => { if (th?.doors) for (const d of th.doors) d.piv.rotation.y = d.side * .05; }, 3400); }
      this.mem.sawHide = null;
    }
  }

  kill() {
    if (this.goal.type === 'kill') return; this.goal = { type: 'kill', start: this.g.t, until: this.g.t + 99 };
    const P = this.g.player; this.turnTo(Math.atan2(this.g.camera.position.x - this.pos.x, this.g.camera.position.z - this.pos.z), 1);
    this.note('kill', 'Los alcanzó.'); this.g.die('entity');
  }

  // hueco/baulera knocking: if it's occupying the hiding place, it answers by copying the knocks exactly
  knockedAt(door, times, gaps) {
    const inside = (door.id === 'hueco' && this.room === 'hueco') || (door.id === 'baulera' && this.room === 'baulera');
    if (!inside || this.goal.type === 'chase') return;
    const a = this.g.audio, pos = door.handlePos(), room = this.room; let tt = 1.4;
    a.play('knock_soft', { pos, roomId: room }); for (const gp of gaps) { tt += gp; this.later(() => a.play('knock_soft', { pos, roomId: room }), (tt - 1.4) * 1000); }
    this.knockAnswers = (this.knockAnswers || 0) + 1; this.note('copyknock', 'Les devolvió los golpes, idénticos. Copiar es lo que mejor hace.');
    if (this.knockAnswers >= 2 || (this.mem.knock?.is21)) this.later(() => this.impersonate(door), (tt + 1.6) * 1000);
  }

  impersonate(door) {
    if (this.g.companion || this.goal.type === 'chase') return;
    door.lockedInside = false; this.g.audio.play('key_turn', { pos: door.handlePos(), roomId: this.room }); door.speed = .4; door.target = .4;
    this.goal = { type: 'escort', start: this.g.t, until: 1e9 }; this.escorting = true; this.wrong = .02;
    this.note('elena', 'Salió del escondite con la cara de Elena. Quería que la sacaran del edificio.');
    this.g.meetElena(door.id, true);
  }

  reveal() {
    if (this.goal.type !== 'escort') return;
    this.goal = { type: 'reveal', start: this.g.t, until: this.g.t + 1.8 }; this.g.audio.play('breath', { pos: this.pos.clone(), roomId: this.room, gain: 1 });
    this.note('reveal', 'Se dieron cuenta en el espejo. Dejó de hacer de Elena.');
  }

  // ======================= body =======================
  embody(dt) {
    const B = this.body; B.root.position.set(this.pos.x, 0, this.pos.z); B.root.rotation.y = this.facing;
    const targetW = this.goal.type === 'escort' ? .02 : this.goal.type === 'chase' || this.goal.type === 'reveal' || this.goal.type === 'kill' ? 1 : this.seenByPlayer ? .5 : .32;
    this.wrong += (targetW - this.wrong) * Math.min(1, dt * (targetW > this.wrong ? .8 : .3)); B.setWrongness(this.wrong);
    B.update(dt, { speed: this.speed, mode: this.mode, lookAt: this.lookAt });
    if (this.carry) { this.carry.position.set(this.pos.x + Math.sin(this.facing) * .45, .25, this.pos.z + Math.cos(this.facing) * .45); this.carry.rotation.y = this.facing; }
  }
}

const HIDE_FRONT = { placard: [-8.9, 0, 19.2], hueco: [0, 0, 12.6], 'bañera': [-4.6, 0, 19.2] };
const HIDE_NAME = { placard: 'el placard', hueco: 'el hueco de la escalera', 'bañera': 'la bañera' };
