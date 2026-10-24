// Gameplay layer: input, physical interactions, the case (variants, evidence, decisions, endings),
// noise events, and the bridge to audio and the entity. Single local player today; every rule reads
// from `this.players` so a networked session can feed remote players into the same simulation.
import * as THREE from 'three';
import { BRIEF, READ, TAPES, ELENA_LINES, ENDINGS } from './caseData.js';
import { HIDES } from '../world/layout.js';
import { Entity } from '../entity/Entity.js';
import { Companion } from './Companion.js';

const HOLD = .32;
const $ = s => document.querySelector(s);

function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

export class Game {
  constructor(ctx) {
    Object.assign(this, ctx);
    this.players = [this.player];
    this.seed = Number(this.params.get('seed')) || (Date.now() % 100000);
    this.rand = mulberry(this.seed);
    const pick = arr => arr[Math.floor(this.rand() * arr.length)];
    this.variant = {
      elena: this.params.get('elena') || pick(['hueco', 'baulera', 'gone']),
      key: pick(['maceta', 'tablero']),
      power1b: this.rand() < .55,
      temperament: this.params.get('temper') || pick(['paciente', 'territorial', 'cazador']),
    };
    this.state = 'menu'; this.t = 0;
    this.keys = new Set(); this.eDown = -1; this.holdFired = false; this.holdTarget = null; this.kickT = 0; this.kicks = {};
    this.found = new Map(); this.heardTapes = new Set(); this.read = new Set(); this.flags = {};
    this.knocks = []; this.minuteroUntil = 0; this.entered = false; this.subQueue = [];
    this.audio = stubAudio();
    this.raycaster = new THREE.Raycaster(); this.raycaster.far = 2.3; this.raycaster.layers.enableAll();
    this.pickables = [];
    this.building.group.traverse(o => { if (o.isMesh && (o.userData.thing || o.userData.door)) this.pickables.push(o); });
    this.player.onStep = (surface, intensity, pos, room) => {
      this.audio.footstep({ surface, intensity, pos, roomId: room, by: 'player' });
      this.noise({ pos, room, loud: intensity * (surface === 'carpet' ? .5 : 1), kind: 'step', by: this.player.id });
    };
    this.setupCase();
    this.entity = new Entity(this);
    this.companion = null;
    this.bindInput(); this.bindUI();
    for (const f of this.lighting.fixtures) if (f.switch === 'minutero') f.on = false;
  }

  // ---------------- case setup ----------------
  setupCase() {
    const v = this.variant, P = this.props.things;
    this.lighting.power['1b'] = v.power1b;
    this.items = {}; // id -> {mesh, at: thingId, taken}
    const mk = (id, mesh, parent, offset) => { mesh.position.copy(offset); parent.add(mesh); mesh.traverse(o => { if (o.isMesh) { o.userData.thing = 'item:' + id; this.pickables.push(o); } }); this.items[id] = { id, mesh, taken: false }; return mesh; };
    const keyMesh = () => { const g = new THREE.Group(); const ring = new THREE.Mesh(new THREE.TorusGeometry(.012, .003, 6, 12), this.mats.brass); g.add(ring); const k = new THREE.Mesh(new THREE.BoxGeometry(.055, .012, .004), this.mats.brass); k.position.x = .04; g.add(k); const tag = new THREE.Mesh(new THREE.BoxGeometry(.03, .02, .002), this.mats.paper); tag.position.set(-.02, -.012, 0); g.add(tag); return g; };
    const tapeMesh = (col = 0xd8d0b8) => { const g = new THREE.Group(); const b = new THREE.Mesh(new THREE.BoxGeometry(.1, .012, .064), new THREE.MeshStandardMaterial({ color: 0x1c1b1a, roughness: .4 })); g.add(b); const l = new THREE.Mesh(new THREE.PlaneGeometry(.08, .03), new THREE.MeshStandardMaterial({ color: col, roughness: .9 })); l.rotation.x = -Math.PI / 2; l.position.y = .0065; g.add(l); return g; };
    // key to 1°B
    if (v.key === 'maceta') { const k = keyMesh(); k.rotation.x = -Math.PI / 2; mk('llave1b', k, this.building.group, new THREE.Vector3(-.82, .34, 21.45)); this.keyWhere = 'maceta'; }
    else { const k = keyMesh(); k.rotation.y = -Math.PI / 2; mk('llave1b', k, this.building.group, new THREE.Vector3(3.46, 1.45, 31.9)); const nail = new THREE.Mesh(new THREE.CylinderGeometry(.003, .003, .03), this.mats.iron); nail.rotation.z = Math.PI / 2; nail.position.set(3.48, 1.47, 31.9); this.building.group.add(nail); }
    // tapes
    mk('elena2', tapeMesh(0xcfc3a0), this.building.group, new THREE.Vector3(-8.75, .4, 20.75)); this.items.elena2.inside = 'cajon_mesita';
    mk('elena3', tapeMesh(0xc9b9a0), this.building.group, new THREE.Vector3(-3.1, 1.92, 18.75)); this.items.elena3.inside = 'botiquin';
    this.items.elena2.mesh.visible = false; this.items.elena3.mesh.visible = false;
    this.tapeVariant = { elena3: 'elena3_' + v.elena };
    // the recorder holds tape 1
    this.items.elena1 = { id: 'elena1', inRecorder: true };
    // slippers: if Elena is gone only one remains
    if (v.elena === 'gone') { const s = P.pantuflas.root.children[1]; s.visible = false; P.pantuflas.read = 'pantuflas_gone'; }
    // who's behind the locked doors
    this.hideOccupant = { hueco: null, baulera: null };
    if (v.elena === 'hueco') this.hideOccupant.hueco = 'elena';
    if (v.elena === 'baulera') this.hideOccupant.baulera = 'elena';
    this.objectives = [
      { id: 'entrar', text: 'Entrar al 1°B', done: false },
      { id: 'elena', text: 'Encontrar a Elena o averiguar qué le pasó', done: false },
      { id: 'casetes', text: 'Recuperar los casetes (0/3)', done: false },
    ];
    if (!v.power1b) this.objectives.push({ id: 'luz', text: 'El 1°B está sin luz. Buscar el tablero', done: false, optional: true });
  }

  // ---------------- input ----------------
  bindInput() {
    this.dragLook = false;
    addEventListener('keydown', e => {
      if (this.state === 'notebook' && (e.code === 'Tab' || e.code === 'Escape')) { e.preventDefault(); this.closeNotebook(); return; }
      if (this.state !== 'play') return;
      if (e.code === 'Tab') { e.preventDefault(); this.openNotebook(); return; }
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'KeyF') this.toggleTorch();
      if (e.code === 'KeyE') { this.eDown = this.t; this.holdFired = false; this.holdTarget = this.focus; }
      if (e.code === 'KeyQ') this.knock();
      if (e.code === 'KeyR') this.playTape();
      if (e.code === 'KeyC' || e.code === 'ControlLeft') this.player.crouch = !this.player.crouch;
    });
    addEventListener('keyup', e => {
      this.keys.delete(e.code);
      if (e.code === 'KeyE' && this.eDown >= 0) { if (!this.holdFired && this.state === 'play') this.interact('tap'); this.eDown = -1; this.endHold(); }
    });
    addEventListener('mousemove', e => { if (this.state === 'play' && (document.pointerLockElement || this.dragLook)) this.player.look(e.movementX, e.movementY); });
    addEventListener('mousedown', () => {
      if (this.state !== 'play' || document.pointerLockElement) return;
      this.dragLook = true;
      this.requestPointerLock();
    });
    addEventListener('mouseup', () => { this.dragLook = false; });
    document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement && this.state === 'play') this.pause(); });
  }

  requestPointerLock() {
    try {
      const result = this.renderer.domElement.requestPointerLock?.();
      result?.catch?.(() => { this.pointerLockUnavailable = true; });
    } catch { this.pointerLockUnavailable = true; }
  }

  bindUI() {
    $('#brief').innerHTML = `<div class="eyebrow">${BRIEF.title}</div>` + BRIEF.lines.map(l => `<p>${l}</p>`).join('');
    $('#start').addEventListener('click', () => this.start());
    $('#resume').addEventListener('click', () => this.resume());
    $('#nb-close').addEventListener('click', () => this.closeNotebook());
    $('#end-stay').addEventListener('click', () => { $('#exit').hidden = true; this.player.pos.z = -.6; this.resume(); });
    $('#restart').addEventListener('click', () => { const u = new URL(location.href); u.searchParams.delete('seed'); location.href = u.toString(); });
  }

  async start() {
    $('#start-screen').hidden = true; $('#hud').hidden = false;
    try {
      const mod = await import('../audio/AudioEngine.js');
      this.audio = new mod.AudioEngine(); await this.audio.start();
      this.audio.setAcoustics(this.acoustics());
      this.scriptTapes();
      if ($('#mic').checked && this.audio.mic) { this.micOn = await this.audio.mic.enable(); }
      this.startLoops();
    } catch (err) { console.warn('[audio] unavailable', err); this.audio = stubAudio(); }
    this.state = 'play'; this.requestPointerLock();
    this.message('Moreno 1418. Llueve desde la tarde.', 4);
  }
  scriptTapes() {
    const A = this.audio; if (!A.setTapeScript) return;
    A.setTapeScript('elena1', TAPES.elena1.lines.map(l => l[1]));
    A.setTapeScript('elena2', TAPES.elena2.lines.map(l => l[1]));
    A.setTapeScript('elena3', TAPES[this.tapeVariant.elena3].lines.map(l => l[1]));
    A.setTapeScript('mimic', [
      { text: 'Marta.' }, { text: 'Marta.', repeatOf: 0 }, { text: 'Son las tres y cuarto.', gapWord: 2, gapSec: 1.5 },
      { text: 'Estoy abajo.' }, { text: 'Estoy abajo.', repeatOf: 3 }, { text: 'Vení, abrime.', holdWord: 0, holdSec: 1.3, monotone: true },
      { text: 'No le contesto.' }, { text: 'No le contesto.', repeatOf: 6 },
    ]);
  }
  pause() { this.state = 'pause'; $('#pause').hidden = false; this.audio.suspend?.(); }
  resume() { $('#pause').hidden = true; this.state = 'play'; this.audio.resume?.(); this.requestPointerLock(); }

  acoustics() {
    const B = this.building; const rooms = {};
    for (const [id, r] of Object.entries(B.rooms)) { const [x0, x1, z0, z1] = r.b; rooms[id] = { reverb: r.reverb, size: [x1 - x0, r.h || 10, z1 - z0], center: { x: (x0 + x1) / 2, y: 1.4, z: (z0 + z1) / 2 }, outdoor: !!r.outdoor }; }
    const portals = B.portals.filter(p => p.b).map(p => ({ id: p.id, a: p.a, b: p.b, pos: B.portalCenter(p), getOpen: () => B.portalOpen(p) }));
    return { rooms, portals, roomAt: pos => B.roomAt(pos) };
  }
  startLoops() {
    const P = this.props.things, A = this.audio;
    this.loops = {
      fridge: A.loop('fridge', { pos: P.heladera.pos, roomId: 'cocina', gain: .9 }),
      clock: A.loop('clock', { pos: P.reloj.pos, roomId: 'living', gain: .8 }),
      tube: A.loop('tube_hum', { pos: new THREE.Vector3(0, 2.7, 32.4), roomId: 'lavadero', gain: .7 }),
      drip: A.loop('drip', { pos: P.canilla.pos, roomId: 'bano', gain: .7 }),
      tv: null,
    };
    A.setPower?.('1b', this.lighting.power['1b']);
  }

  // ---------------- noise bus: everything audible by the entity goes through here ----------------
  noise(ev) { // {pos, room, loud 0..1, kind, by}
    if (!ev.room) ev.room = this.building.roomAt(ev.pos);
    ev.t = this.t; this.entity?.hear(ev);
  }
  sfx(name, pos, room, loud = 0, kind = name, by = this.player.id, opts = {}) {
    room = room || this.building.roomAt(pos);
    this.audio.play(name, { pos, roomId: room, ...opts });
    if (loud > 0) this.noise({ pos, room, loud, kind, by });
  }

  later(fn, ms) { (this.queue ||= []).push({ at: this.t + ms / 1000, fn }); }
  runQueue() {
    if (this.knockEvalAt && this.t >= this.knockEvalAt) { this.knockEvalAt = 0; this.evalKnocks(); }
    if (this.tapeEndAt && this.t >= this.tapeEndAt) { this.tapeEndAt = 0; this.tapePlaying = null; }
    if (!this.queue?.length) return; const due = this.queue.filter(q => q.at <= this.t); this.queue = this.queue.filter(q => q.at > this.t); for (const q of due) q.fn();
  }

  // ---------------- per frame ----------------
  update(dt, t) {
    this.t = t;
    const P = this.player;
    if (this.state === 'play' || this.state === 'qa') {
      const k = this.keys;
      P.input.f = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0);
      P.input.r = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
      P.sprint = k.has('ShiftLeft') || k.has('ShiftRight');
      if (this.state === 'play') P.update(dt, t); else { P.applyCamera(dt, t); if (this.qaEntity) this.entity.embody(dt); }
      this.updateHold(dt);
    }
    for (const d of Object.values(this.building.doors)) d.update(dt);
    // minutero relay
    if (this.minuteroUntil && t > this.minuteroUntil) { this.minuteroUntil = 0; this.setMinutero(false); }
    this.lighting.update(dt, t, this.camera.position, P.hidden ? P.hidden.room : P.room);
    this.updateFocus();
    this.updateMirrors();
    this.animateWorld(dt, t);
    if (this.state === 'play') {
      this.runQueue();
      this.entity.update(dt, t);
      this.companion?.update(dt, t);
      this.checkVoice(dt);
      if (P.stamina < .25 && this.t - (this.breathT || 0) > 1.6) { this.breathT = this.t; this.audio.play('breath', { pos: this.camera.position, roomId: P.room, gain: .45 }); this.noise({ pos: P.pos.clone(), room: P.room, loud: .18, kind: 'breath', by: P.id }); }
      this.checkExit();
    }
    this.audio.setListener?.(this.camera.position, P.forward(new THREE.Vector3()), P.hidden ? P.hidden.room : P.room);
    this.audio.update?.(dt);
    this.updateSubs(t);
    const loc = this.building.rooms[P.room]?.name || '';
    if (loc !== this.lastLoc) { this.lastLoc = loc; }
    this.post.u.vignette.value += ((P.hidden ? 1.25 : .55) - this.post.u.vignette.value) * Math.min(1, dt * 3);
    const fear = this.entity.fearSignal?.() || 0;
    this.post.u.fear.value += (fear - this.post.u.fear.value) * Math.min(1, dt * 2);
  }

  animateWorld(dt, t) {
    for (const a of this.props.animated) {
      if (a.kind !== 'sheet') continue;
      const p = a.mesh.geometry.attributes.position, b = a.base; const amp = a.gentle ? (this.entity.nearSheet?.(a.mesh) ? .12 : .02) : .08;
      for (let i = 0; i < p.count; i++) { const y = b[i * 3 + 1]; const w = -y / 1.4; p.setZ(i, b[i * 3 + 2] + Math.sin(t * 1.7 + b[i * 3] * 2 + a.phase) * amp * w + Math.sin(t * 3.1 + a.phase) * amp * .3 * w); }
      p.needsUpdate = true;
    }
    const tv = this.props.things.tv; tv.screen.draw(t);
    const c = this.props.things.reloj; // stopped at 3:15 — the night she left. It ticks but never advances.
    c.hh.rotation.z = -(3.25 / 12) * Math.PI * 2; c.mh.rotation.z = -(15 / 60) * Math.PI * 2 - Math.sin(t * 6.28) * .004;
  }

  updateMirrors() {
    const cam = this.camera.position; const room = this.player.hidden ? this.player.hidden.room : this.player.room;
    for (const m of this.props.mirrors) {
      const to = cam.clone().sub(m.pos); const d = to.length();
      m.refl.visible = d < 9 && to.dot(m.normal) > 0 && (room === m.room || d < 3.5);
    }
  }

  // ---------------- focus + interaction ----------------
  updateFocus() {
    if (this.state !== 'play' || this.player.hidden) { this.focus = this.player.hidden ? { kind: 'hidden' } : null; this.showPrompt(); return; }
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    const hits = this.raycaster.intersectObjects(this.pickables, false);
    // walls occlude picks: only accept hits nearer than the first wall segment
    let f = null;
    for (const h of hits) {
      const o = h.object;
      if (o.userData.door) { f = { kind: 'door', door: o.userData.door, point: h.point }; break; }
      const id = o.userData.thing; if (!id) continue;
      if (id.startsWith('item:')) { const it = this.items[id.slice(5)]; if (it && !it.taken && it.mesh.visible) { f = { kind: 'item', item: it }; break; } continue; }
      const th = this.props.things[id]; if (th) { f = { kind: 'thing', thing: th }; break; }
    }
    this.focus = f; this.showPrompt();
  }

  showPrompt() {
    const el = $('#interact'); const f = this.focus; let txt = '';
    if (f?.kind === 'hidden') txt = '<b>E</b> salir';
    else if (f?.kind === 'door') {
      const d = f.door;
      if (d.locked) txt = (d.id === '1b' && this.player.inventory.has('llave1b')) ? '<b>E</b> abrir con la llave' : '<b>E</b> picaporte · <b>Q</b> golpear' + (d.id === '1b' ? ' · <i>mantener E: forzar</i>' : '');
      else if (d.lockedInside) txt = '<b>E</b> picaporte · <b>Q</b> golpear';
      else txt = (d.isOpen ? '<b>E</b> cerrar' : '<b>E</b> abrir') + ' <i>· mantener: despacio</i> · <b>Q</b> golpear';
    } else if (f?.kind === 'item') txt = '<b>E</b> tomar';
    else if (f?.kind === 'thing') txt = this.thingPrompt(f.thing);
    if (el.innerHTML !== txt) el.innerHTML = txt;
    $('#crosshair').classList.toggle('active', !!txt && f?.kind !== 'hidden');
  }

  thingPrompt(th) {
    if (th.read) return '<b>E</b> ' + (th.id.startsWith('foto') ? 'mirar' : 'leer');
    if (th.fixture || th.toggle) return th.button ? '<b>E</b> pulsador de luz' : '<b>E</b> ' + (th.label || 'luz').toLowerCase();
    if (th.id.startsWith('breaker_')) return '<b>E</b> ' + th.label.toLowerCase() + (this.breakerOn(th.id) ? ' · <i>arriba</i>' : ' · <i>abajo</i>');
    if (th.hide) return '<b>E</b> esconderse en ' + (th.id === 'placard' ? 'el placard' : 'la bañera');
    if (th.drawer) return th.open ? '' : '<b>E</b> abrir ' + th.label.toLowerCase();
    if (th.id === 'buzon1b') return th.open ? '' : '<b>E</b> revisar el buzón (la tapa está floja)';
    if (th.id === 'grabador') return '<b>E</b> tomar el grabador';
    if (th.id === 'tv') return th.screen.mode === 'off' ? '<b>E</b> prender el televisor' : '<b>E</b> apagar el televisor';
    if (th.id === 'telefono') return '<b>E</b> levantar el tubo';
    if (th.id === 'portero' || th.id === 'portero_int') return '<b>E</b> portero eléctrico';
    if (th.id === 'ascensor_boton') return '<b>E</b> llamar al ascensor';
    if (th.mirror) return '';
    return '';
  }

  updateHold(dt) {
    if (this.eDown < 0 || this.state !== 'play') return;
    const held = this.t - this.eDown;
    if (held > HOLD && !this.holdFired) { this.holdFired = true; this.interact('hold'); }
    // forcing a locked door: a kick every .85s while held
    const f = this.holdTarget;
    if (this.holdFired && f?.kind === 'door' && f.door.locked && f.door.id === '1b' && !this.player.inventory.has('llave1b')) {
      this.kickT -= dt; if (this.kickT <= 0) { this.kickT = .85; this.kick(f.door); }
    }
  }
  endHold() { const f = this.holdTarget; if (f?.kind === 'door' && f.door.slow) { f.door.target = f.door.amount; f.door.slow = false; f.door.speed = 1.2; } this.holdTarget = null; this.kickT = 0; }

  interact(mode) {
    const f = mode === 'tap' ? this.focus : this.holdTarget; const P = this.player;
    if (P.hidden) { if (mode === 'tap') this.unhide(); return; }
    if (!f) return;
    if (f.kind === 'door') return this.useDoor(f.door, mode);
    if (mode === 'hold') return;
    if (f.kind === 'item') return this.take(f.item);
    if (f.kind === 'thing') return this.useThing(f.thing);
  }

  useDoor(d, mode) {
    const pos = d.handlePos(), room = this.player.room;
    if (d.locked) {
      if (d.id === '1b' && this.player.inventory.has('llave1b')) { d.locked = false; this.sfx('key_turn', pos, room, .25, 'key'); this.message('La llave gira con dificultad.'); this.entity.observe('unlock1b', { by: this.player.id }); return; }
      if (mode === 'tap') { this.sfx('door_locked', pos, room, .35, 'rattle'); this.message(d.id === '1a' ? 'Cerrado. Del otro lado se escucha una radio, muy bajo.' : d.id === '1b' ? 'Cerrado con llave.' : 'Cerrado.'); }
      return;
    }
    if (d.lockedInside) { if (mode === 'tap') { this.sfx('door_locked', pos, room, .3, 'rattle'); this.message('Tiene pasador. Está cerrado desde adentro.'); this.knockedAt = d.id; } return; }
    if (mode === 'hold') { // slow, quiet
      d.slow = true; d.speed = .32; d.target = d.isOpen ? 0 : 1; this.audio.play('door_open_slow', { pos, roomId: room, gain: .6 });
      this.noise({ pos, room, loud: .06, kind: 'door_slow', by: this.player.id }); this.entity.observe('door', { door: d.id, open: d.target > 0, slow: true }); return;
    }
    d.speed = 1.4; const opening = !d.isOpen; d.target = opening ? 1 : 0;
    this.sfx(opening ? 'door_open' : 'door_close', pos, room, opening ? .38 : .5, 'door');
    this.entity.observe('door', { door: d.id, open: opening, slow: false });
    if (d.id === '1b' && opening) this.enteredApartment();
  }

  kick(d) {
    this.kicks[d.id] = (this.kicks[d.id] || 0) + 1; const pos = d.handlePos();
    this.sfx('door_slam', pos, this.player.room, 1, 'kick'); this.player.shake = .8;
    if (this.kicks[d.id] >= 4) { d.locked = false; d.speed = 5; d.target = 1; this.message('El marco cede. La puerta del 1°B se abre de golpe.'); this.flags.forced = true; this.entity.observe('forced', {}); this.enteredApartment(); }
    else this.message(['Una patada. El marco cruje.', 'Otra. Algo se astilla.', 'El ruido llena el pasillo.'][this.kicks[d.id] - 1]);
  }

  enteredApartment() { if (this.entered) return; this.entered = true; this.done('entrar'); this.entity.observe('entered1b', {}); }

  take(it) {
    it.taken = true; it.mesh.visible = false; this.player.inventory.add(it.id);
    if (it.id === 'llave1b') { this.sfx('keys', it.mesh.getWorldPosition(new THREE.Vector3()), null, .2, 'keys'); this.message('Una llave Yale con una etiqueta: "1°B".'); this.found.set('llave', 'Copia de la llave del 1°B, donde Tito dijo.'); }
    if (it.id === 'mimic') { this.audio.play('pickup_small', { pos: this.camera.position, roomId: this.player.room }); this.message('Un casete sin etiqueta. Antes no estaba acá.' + (this.player.inventory.has('grabador') ? ' <b>R</b> para escucharlo.' : '')); this.found.set('mimic', 'Un casete sin etiqueta apareció en un lugar por donde ya habíamos pasado.'); }
    if (it.id.startsWith('elena')) { this.audio.play('pickup_small', { pos: this.camera.position, roomId: this.player.room }); this.gotTape(it.id); }
  }

  gotTape(id) {
    this.player.inventory.add(id); const n = ['elena1', 'elena2', 'elena3'].filter(x => this.player.inventory.has(x)).length;
    const o = this.objectives.find(o => o.id === 'casetes'); o.text = `Recuperar los casetes (${n}/3)`; if (n === 3) this.done('casetes');
    this.message(this.player.inventory.has('grabador') ? 'Un casete. <b>R</b> para escucharlo en el grabador.' : 'Un casete. Hace falta algo para escucharlo.');
    this.entity.observe('took', { what: id });
  }

  useThing(th) {
    const P = this.player, pos = th.pos;
    if (th.read) return this.readThing(th);
    if (th.button) { this.sfx('switch', pos, P.room, .12, 'switch'); this.pressMinutero(this.player.id); return; }
    if (th.fixture && th.id !== 'tv') { const fx = this.lighting.byId(th.fixture); fx.on = !fx.on; this.sfx('switch', pos, P.room, .12, 'switch'); if (th.toggle) th.toggle.rotation.x = fx.on ? 0 : .5; if (!this.lighting.powered(fx)) this.message('El interruptor hace clic. No pasa nada.'); this.entity.observe('light', { fixture: fx.id, on: fx.on }); return; }
    if (th.id.startsWith('breaker_')) return this.flipBreaker(th.id.slice(8), this.player.id);
    if (th.hide) return this.hide(th);
    if (th.drawer) return this.openDrawer(th);
    if (th.id === 'buzon1b') { th.open = true; th.lid.rotation.z = .6; this.sfx('pickup_paper', pos, P.room, .1); const r = READ['nota_tito_' + this.variant.key]; this.showRead(r); this.found.set('nota', r[1]); return; }
    if (th.id === 'grabador') { P.inventory.add('grabador'); th.root.visible = false; this.gotTape('elena1'); this.message('El grabador de Elena. Tiene un casete adentro. <b>R</b> para escucharlo.'); return; }
    if (th.id === 'tv') return this.setTV(th.screen.mode === 'off' ? 'static' : 'off', this.player.id);
    if (th.id === 'telefono') { this.sfx('pickup_small', pos, P.room, .1); this.message(this.lighting.power['1b'] ? 'Tono. Del otro lado de la línea, muy lejos, alguien respira.' : 'No hay tono.'); return; }
    if (th.id === 'portero_int') { this.sfx('pickup_small', pos, P.room, .1); this.message('Por el portero se escucha la lluvia de la calle. Y un auto que pasa.'); return; }
    if (th.id === 'portero') { this.sfx('knock_soft', pos, P.room, .2, 'buzz'); this.message('Tocás el 1°B. Arriba, adentro, suena el timbre del departamento.'); this.noise({ pos: new THREE.Vector3(-1.3, 1.4, 15), room: 'cocina', loud: .7, kind: 'buzz', by: 'world' }); return; }
    if (th.id === 'ascensor_boton') { this.sfx('switch', pos, P.room, .1); this.message(this.lighting.power.general ? 'El botón no se ilumina. El ascensor está parado en algún piso de arriba.' : 'Sin corriente.'); return; }
  }

  readThing(th) {
    const key = th.read; const r = READ[key]; if (!r) return;
    this.read.add(key); this.showRead(r); this.found.set(key, r[1]);
    this.sfx('pickup_paper', th.pos, this.player.room, .05);
    if (key === 'foto_sobrina') this.flags.knowsPattern = true;
  }

  openDrawer(th) {
    th.open = true; const dir = th.dir.clone().multiplyScalar(.28); th.root.position.add(dir);
    this.sfx(th.id === 'botiquin' ? 'drawer_open' : 'drawer_open', th.pos, this.player.room, .22, 'drawer');
    for (const it of Object.values(this.items)) if (it.inside === th.id && it.mesh) { it.mesh.visible = true; it.mesh.position.add(dir.clone().multiplyScalar(th.id === 'botiquin' ? 0 : .8)); }
    if (th.id === 'cajon_cocina') { this.showRead(['Cajón de la cocina', 'Velas, fósforos Ranchera, una libreta de teléfonos. En la "M": Marta, con dos números tachados. Al final, una lista con letra apurada:\n"heladera — pasos — puerta — mi nombre — mi voz"']); this.found.set('lista', 'Una lista: heladera, pasos, puerta, mi nombre, mi voz. Lo que fue aprendiendo.'); }
    this.entity.observe('searched', { where: th.id });
  }

  hide(th) {
    const h = HIDES[th.hide]; const P = this.player;
    P.hidden = { ...h, id: th.hide, room: h.room, pos: new THREE.Vector3(...h.pos), eye: th.hide === 'bañera' ? 1.1 : 1.55, yawMin: Math.atan2(-h.look[0], -h.look[2]) - .7, yawMax: Math.atan2(-h.look[0], -h.look[2]) + .7 };
    P.yaw = Math.atan2(-h.look[0], -h.look[2]); P.pitch = -.05; P.flashlightBefore = P.flashlight; if (P.flashlight) this.toggleTorch();
    this.sfx(th.hide === 'placard' ? 'wardrobe_open' : 'pickup_small', th.pos, P.room, .25, 'hide');
    if (th.doors) for (const d of th.doors) d.piv.rotation.y = d.side * .05; // leave a sliver to peek through
    this.entity.observe('hide', { spot: th.hide, by: P.id });
    $('#hud').classList.add('hidden-view');
  }
  unhide() {
    const P = this.player; const h = P.hidden; P.pos.set(...h.enter); P.room = this.building.roomAt(P.pos); P.hidden = null;
    this.sfx(h.id === 'placard' ? 'wardrobe_close' : 'pickup_small', P.pos, P.room, .25, 'unhide');
    const th = this.props.things[h.id === 'bañera' ? 'cortina' : h.id]; if (th?.doors) for (const d of th.doors) d.piv.rotation.y = 0;
    this.entity.observe('unhide', { spot: h.id }); $('#hud').classList.remove('hidden-view');
  }

  toggleTorch() {
    const P = this.player; P.flashlight = !P.flashlight; this.torch.intensity = P.flashlight ? 150 : 0; this.torch.castShadow = P.flashlight;
    this.audio.play('switch', { pos: this.camera.position, roomId: P.room, gain: .35, rate: 1.6 });
    this.entity.observe('torch', { on: P.flashlight });
  }

  // world systems the entity can also operate (by = who did it) -------------------------
  pressMinutero(by) {
    this.minuteroUntil = this.t + 75; this.setMinutero(true);
    if (by !== this.player.id) this.audio.play('switch', { pos: new THREE.Vector3(0, 1.3, 15), roomId: 'pasillo', gain: .5 });
  }
  setMinutero(on) {
    for (const f of this.lighting.fixtures) if (f.switch === 'minutero') f.on = on;
    this.audio.play(on ? 'switch' : 'breaker', { pos: new THREE.Vector3(0, 3.2, 1), roomId: 'zaguan', gain: on ? .4 : .5 }); // relay in the zaguán
  }
  breakerOn(id) { return this.lighting.power[id === '1b' ? '1b' : id]; }
  flipBreaker(id, by) {
    const L = this.lighting, key = id === '1b' ? '1b' : id; L.power[key] = !L.power[key];
    const th = this.props.things['breaker_' + id]; th.lever.position.y = L.power[key] ? .025 : -.025;
    const pos = th.pos; this.sfx(id === 'general' ? 'breaker_main' : 'breaker', pos, 'lavadero', by === this.player.id ? .45 : 0, 'breaker', by);
    if (by !== this.player.id) this.noise({ pos, room: 'lavadero', loud: .0, kind: 'breaker', by });
    this.audio.setPower?.(key === 'general' ? 'building' : key, L.power[key]);
    if (key === '1b' && L.power['1b']) this.done('luz');
    if (by === this.player.id) this.entity.observe('breaker', { id, on: L.power[key] });
    if (key === '1b' || key === 'general') { const tv = this.props.things.tv; if (!L.powered(tv.fixture)) this.setTV('off', 'power'); }
  }
  setTV(mode, by) {
    const tv = this.props.things.tv; if (mode !== 'off' && !this.lighting.powered(tv.fixture)) { if (by === this.player.id) this.message('No hay corriente.'); return; }
    tv.screen.set(mode); tv.fixture.on = mode !== 'off';
    this.audio.play(mode === 'off' ? 'tv_off' : 'tv_on', { pos: tv.pos, roomId: 'living' });
    if (this.loops?.tv) { this.loops.tv.stop(); this.loops.tv = null; }
    if (mode !== 'off') this.loops && (this.loops.tv = this.audio.loop(mode === 'program' ? 'tv_program' : 'tv_static', { pos: tv.pos, roomId: 'living', gain: .9 }));
    if (by === this.player.id) { this.noise({ pos: tv.pos, room: 'living', loud: mode === 'off' ? .2 : .5, kind: 'tv', by }); this.entity.observe('tv', { on: mode !== 'off' }); }
  }

  // ---------------- knocking (Q) and the 2-1 pattern ----------------
  knock() {
    const f = this.focus; if (f?.kind !== 'door') return;
    const d = f.door, pos = d.handlePos();
    this.sfx('knock', pos, this.player.room, .55, 'knock');
    this.knocks.push(this.t); this.knockDoor = d; this.knockEvalAt = this.t + 1.5;
  }
  evalKnocks() {
    const k = this.knocks; this.knocks = []; const d = this.knockDoor; if (!d) return;
    const gaps = k.slice(1).map((t, i) => t - k[i]);
    const pattern = gaps.map(g => g < .55 ? 's' : g < 2.2 ? 'L' : 'x').join('');
    const is21 = k.length === 3 && pattern === 'sL';
    this.entity.observe('knock', { door: d.id, count: k.length, pattern, is21 });
    if (is21) this.flags.usedPattern = true;
    const who = d.id === 'hueco' ? this.hideOccupant.hueco : d.id === 'baulera' ? this.hideOccupant.baulera : null;
    const pos = d.handlePos(); const room = d.id === 'hueco' ? 'hueco' : d.id === 'baulera' ? 'baulera' : null;
    if (who === 'elena' && d.lockedInside) {
      if (is21) {
        this.later(() => { this.audio.play('knock_soft', { pos, roomId: room }); this.later(() => this.audio.play('knock_soft', { pos, roomId: room }), 260); this.later(() => this.audio.play('knock_soft', { pos, roomId: room }), 1300); }, 900);
        this.later(() => { this.audio.play('key_turn', { pos, roomId: room }); d.lockedInside = false; d.speed = .4; d.target = .35; this.meetElena(d.id, false); }, 3200);
      } else if (!this.flags.elenaWhimper) { this.flags.elenaWhimper = true; this.later(() => this.audio.play('breath', { pos, roomId: room, gain: .5 }), 1200); }
      return;
    }
    // the entity may be occupying a hiding place; it copies what it heard, exactly
    this.entity.knockedAt?.(d, k, gaps);
  }

  meetElena(where, fake) {
    if (this.companion) return;
    this.companion = new Companion(this, where, fake);
    this.done('elena');
    this.subtitle(ELENA_LINES.found[0], 3); this.later(() => this.subtitle(ELENA_LINES.found[1], 3), 3300);
  }

  // ---------------- tapes ----------------
  playTape() {
    const P = this.player; if (!P.inventory.has('grabador')) { this.message('No tenés con qué escucharlos.'); return; }
    if (this.tapePlaying) { this.tapePlaying.stop(); this.tapePlaying = null; this.subQueue = []; $('#sub').textContent = ''; this.message('Stop.'); return; }
    const order = ['elena1', 'elena2', 'elena3', 'mimic'].filter(x => P.inventory.has(x));
    const next = order.find(x => !this.heardTapes.has(x)) || order[(this.lastTapeIdx = ((this.lastTapeIdx ?? -1) + 1) % order.length)];
    if (!next) return;
    const tid = next === 'elena3' ? this.tapeVariant.elena3 : next; const tape = TAPES[tid];
    this.audio.play('cassette_insert', { pos: this.camera.position, roomId: P.room });
    this.tapePlaying = this.audio.tape(next === 'mimic' ? 'mimic' : next, { pos: this.camera.position, roomId: P.room, follow: () => this.camera.position });
    const dur = this.tapePlaying?.duration || 22; const t0 = this.t + .05;
    const ph = this.tapePlaying?.phrases;
    this.subQueue = ph && ph.length ? ph.map(p => ({ at: t0 + p.start, txt: p.text, until: t0 + p.end + .6 })) : tape.lines.map(([s, txt]) => ({ at: t0 + s, txt, until: t0 + s + 4.2 }));
    this.heardTapes.add(next); this.found.set('tape:' + next, tape.title + ': ' + tape.lines.map(l => l[1]).join(' '));
    this.message(tape.title, 2.5);
    this.noise({ pos: this.camera.position.clone(), room: P.room, loud: .45, kind: 'tape', by: P.id, sustain: dur });
    this.entity.observe('tape', { id: next });
    this.tapeEndAt = this.t + dur + 1;
    if (next === 'mimic' && this.entity.mem.voices.length) { const bufs = this.entity.mem.voices; this.later(() => this.audio.playBuffer?.(bufs[bufs.length - 1], { pos: this.camera.position, roomId: this.player.room, gain: .9, color: 'tape' }), 6500); this.later(() => this.subtitle('(Es tu voz.)', 3), 6500); }
    if (next === 'elena2') this.flags.knowsPattern = true;
    if (next === 'elena3') this.flags.knowsMirror = true;
  }

  checkVoice(dt) {
    if (!this.micOn) return; const lv = this.audio.mic.level();
    if (lv > .12) { this.voiceT = (this.voiceT || 0) + dt; if (!this.voiceNoiseT || this.t - this.voiceNoiseT > .5) { this.voiceNoiseT = this.t; this.noise({ pos: this.player.pos.clone(), room: this.player.room, loud: Math.min(1, lv * 1.6), kind: 'voice', by: this.player.id }); } }
    else this.voiceT = 0;
    if (this.voiceT > .4 && !this.capturing && this.entity.wantsVoice?.()) { this.capturing = true; this.audio.mic.capture(2.2).then(buf => { this.capturing = false; if (buf) this.entity.learnVoice(buf); }); }
  }

  // ---------------- exit + endings ----------------
  checkExit() {
    const P = this.player;
    if (P.room === 'zaguan' || P.room === 'pasillo') this.wasInside = true;
    if (!this.wasInside || P.room !== 'calle' || P.pos.z > -1.3) return;
    if (this.companion && this.companion.near(P.pos, 4)) return this.end(this.companion.fake ? 'fake' : 'rescued');
    this.openExit();
  }
  openExit() {
    this.state = 'exit'; document.exitPointerLock(); $('#exit').hidden = false;
    const opts = [
      ['gone_self', 'Elena se fue por su propia voluntad.'],
      ['hiding', 'Elena sigue en el edificio, escondida.'],
      ['taken', 'Lo que vive en el 1°B se la llevó.'],
      ['unknown', 'No sabemos qué pasó.'],
    ];
    $('#exit-opts').innerHTML = opts.map(([id, t]) => `<button data-c="${id}">${t}</button>`).join('');
    $('#exit-opts').querySelectorAll('button').forEach(b => b.addEventListener('click', () => this.end('report', b.dataset.c)));
    $('#exit-found').textContent = `Evidencia: ${this.found.size} hallazgos · casetes escuchados: ${[...this.heardTapes].filter(t => t !== 'mimic').length}/3`;
  }

  end(kind, choice) {
    if (this.state === 'end') return; this.state = 'end'; document.exitPointerLock();
    this.audio.music?.('end');
    let title, body;
    if (kind === 'report') {
      const v = this.variant.elena; const truth = v === 'gone' ? 'taken' : 'hiding';
      const right = choice === truth; const heard = [...this.heardTapes].filter(t => t !== 'mimic').length;
      const verdict = right
        ? (truth === 'hiding' ? `Marta volvió con la policía al día siguiente. Elena estaba ${v === 'hueco' ? 'bajo la escalera' : 'en la baulera'}, viva, desde hacía días. Nadie supo explicar quién había estado prendiendo el televisor.` : 'Marta no volvió a pisar Moreno 1418. El 1°B se alquiló en diciembre. Los inquilinos duraron tres semanas.')
        : (truth === 'hiding' ? `Nadie volvió a buscar. Tres días después, el encargado sintió olor ${v === 'hueco' ? 'en el hueco de la escalera' : 'en el lavadero'}.` : 'Marta siguió buscándola en hospitales durante meses. El televisor del 1°B se sigue escuchando de noche.');
      title = right ? 'Informe correcto' : 'Informe equivocado';
      body = `Entregaron ${heard} de 3 casetes escuchados.\n\n${verdict}`;
    } else { [title, body] = ENDINGS[kind]; body = body.replace('{room}', (this.building.rooms[this.player.room]?.name || 'pasillo').replace('1°B · ', '').toLowerCase()); }
    $('#end-title').textContent = title; $('#end-body').textContent = body;
    $('#end-memory').innerHTML = this.entity.report().map(l => `<li>${l}</li>`).join('');
    $('#end-variant').textContent = `semilla ${this.seed} · ${this.variant.elena} · ${this.variant.temperament}`;
    $('#exit').hidden = true; $('#end').hidden = false; $('#hud').hidden = true;
  }

  die(cause) {
    if (this.state !== 'play') return; this.player.alive = false; this.state = 'dying';
    this.audio.play('death', { pos: this.camera.position, roomId: this.player.room });
    let k = 1; const fade = () => { k -= .02; this.post.u.fade.value = Math.max(0, k); if (k > 0) requestAnimationFrame(fade); else { this.state = 'play'; this.end('died'); } }; setTimeout(fade, 600);
  }

  // ---------------- UI ----------------
  done(id) { const o = this.objectives.find(o => o.id === id); if (o && !o.done) { o.done = true; } }
  message(html, s = 3) { const el = $('#message'); el.innerHTML = html; el.style.opacity = 1; clearTimeout(this.msgT); this.msgT = setTimeout(() => el.style.opacity = 0, s * 1000); }
  subtitle(txt, s = 3.5) { this.subQueue.push({ at: this.t, txt, until: this.t + s }); }
  updateSubs(t) {
    const el = $('#sub'); const cur = this.subQueue.find(q => t >= q.at && t < q.until);
    const txt = cur ? cur.txt : ''; if (el.textContent !== txt) el.textContent = txt;
    this.subQueue = this.subQueue.filter(q => q.until > t);
  }
  showRead([title, text]) { const el = $('#read'); el.querySelector('h3').textContent = title; el.querySelector('p').textContent = text; el.hidden = false; clearTimeout(this.readT); this.readT = setTimeout(() => el.hidden = true, 9000); }
  openNotebook() {
    this.state = 'notebook'; document.exitPointerLock();
    const nb = $('#notebook');
    nb.querySelector('.obj').innerHTML = this.objectives.map(o => `<li class="${o.done ? 'done' : ''}">${o.optional ? '<i>' : ''}${o.text}${o.optional ? '</i>' : ''}</li>`).join('');
    nb.querySelector('.found').innerHTML = [...this.found.values()].map(f => `<li>${f}</li>`).join('') || '<li class="muted">Nada todavía.</li>';
    const inv = [...this.player.inventory].map(i => ({ llave1b: 'llave del 1°B', grabador: 'grabador', elena1: 'casete 1', elena2: 'casete 2', elena3: 'casete 3', mimic: 'casete sin etiqueta' }[i] || i));
    nb.querySelector('.inv').textContent = inv.join(' · ') || '—';
    nb.hidden = false;
  }
  closeNotebook() { $('#notebook').hidden = true; this.state = 'play'; this.requestPointerLock(); }

  // ---------------- QA ----------------
  qaShot({ x, y, z, yaw, pitch }) {
    this.state = 'qa'; $('#start-screen').hidden = true; $('#hud').hidden = false;
    const P = this.player; P.pos.set(x, 0, z); P.eye = P.eyeTarget = y; P.yaw = yaw; P.pitch = pitch; P.room = this.building.roomAt(P.pos);
    if (this.params.has('lights')) { this.lighting.power['1b'] = true; for (const f of this.lighting.fixtures) f.on = true; }
    const E = this.entity; if (this.params.has('ent')) { const [ex, ez, ey] = this.params.get('ent').split(',').map(Number); E.pos.set(ex, 0, ez); E.facing = ey || 0; E.room = this.building.roomAt(E.pos); E.mode = this.params.get('emode') || 'still'; E.wrong = Number(this.params.get('w') || .3); } else E.embody(0.016);
    this.qaEntity = true;
    if (this.params.has('power')) this.lighting.power['1b'] = true;
    if (this.params.has('tvon')) this.setTV('static', 'qa');
    if (this.params.has('torch')) { P.flashlight = true; this.torch.intensity = 150; this.torch.castShadow = true; }
  }
}

function stubAudio() {
  const h = { stop() {}, setGain() {}, setPos() {}, duration: 20 };
  return { play: () => h, loop: () => h, footstep() {}, setListener() {}, update() {}, setAcoustics() {}, tape: () => h, playBuffer: () => h, music() {}, setPower() {}, mic: { enable: async () => false, level: () => 0, capture: async () => null } };
}
