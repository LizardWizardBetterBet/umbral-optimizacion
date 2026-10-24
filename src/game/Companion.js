// Elena (or what wears her) following the player out. Real Elena is afraid of the dark and of it;
// the imitator is not afraid of anything, and does not appear in mirrors.
import * as THREE from 'three';
import { createEntityBody } from '../entity/Body.js';
import { ELENA_LINES } from './caseData.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export class Companion {
  constructor(game, where, fake) {
    this.g = game; this.fake = fake; this.where = where; this.nav = game.entity.nav;
    if (fake) { this.agent = game.entity; }
    else {
      const body = createEntityBody({ guise: 'elena' }); body.setLayer(0); body.setWrongness(0); game.scene.add(body.root);
      const n = this.nav.byRoom[where][0];
      this.agent = { pos: V(n.x, 0, n.z), room: where, facing: 0, speed: 0, mode: 'crouch', body };
      game.entity.hunger = Math.min(1, game.entity.hunger + .3); // it will not let her go easily
      game.entity.note('realelena', 'Supo que Elena seguía viva cuando la vio salir. Fue a cortarles el paso.');
    }
    this.t0 = game.t; this.lastLine = game.t; this.path = null; this.stuckDark = 0; this.mirrorT = 0;
  }
  near(p, r) { return this.agent.pos.distanceTo(p) < r; }

  update(dt, t) {
    const A = this.agent, P = this.g.player, g = this.g;
    if (t - this.t0 < 4) { A.speed = 0; A.mode = t - this.t0 < 2.5 ? 'crouch' : 'idle'; this.face(P.pos, dt); return this.pose(dt); }
    const target = P.pos; const d = A.pos.distanceTo(target);
    let go = d > 1.7;
    // real Elena: won't step into darkness unless the torch is on her way, and freezes when it is close
    if (!this.fake && go) {
      const ahead = this.nextPoint(); const room = g.building.roomAt(ahead) || A.room;
      const lit = g.lighting.lightAt(V(ahead.x, 1.2, ahead.z), room) + (P.flashlight && d < 4.5 ? .5 : 0);
      if (lit < .12) { go = false; this.stuckDark += dt; if (t - this.lastLine > 7) { this.say(ELENA_LINES.dark[Math.floor(Math.random() * 3)]); } }
      else this.stuckDark = 0;
      const ent = g.entity; if (ent.pos.distanceTo(A.pos) < 7 && t - this.lastLine > 10) this.say(ELENA_LINES.afraid);
    }
    if (go) this.step(dt, d > 5 ? 1.15 : .8); else { A.speed = 0; A.mode = 'idle'; this.face(P.pos, dt); }
    if (P.room === 'calle' && t - this.lastLine > 4 && !this.saidStreet && !this.fake) { this.saidStreet = true; this.say(ELENA_LINES.street); }
    if (this.fake) this.checkMirror(dt);
    this.pose(dt);
  }

  say(txt) { this.lastLine = this.g.t; this.g.subtitle(txt, 3.4); }

  nextPoint() { return this.path?.[0] ? V(this.path[0].node.x, 0, this.path[0].node.z) : this.g.player.pos; }

  step(dt, v) {
    const A = this.agent, P = this.g.player, B = this.g.building;
    if (B.lineOfSight(A.pos, P.pos) && A.pos.distanceTo(P.pos) < 6) this.path = null;
    else if (!this.path || !this.path.length || this.g.t - (this.pathT || 0) > 1.5) {
      const a = this.nav.nearest(A.pos.x, A.pos.z, A.room), b = this.nav.nearest(P.pos.x, P.pos.z, this.nav.byRoom[P.room] ? P.room : null);
      this.path = this.nav.path(a, b) || []; this.pathT = this.g.t;
    }
    const tgt = this.path?.length ? V(this.path[0].node.x, 0, this.path[0].node.z) : P.pos;
    const door = this.path?.[0]?.door && B.doors[this.path[0].door];
    if (door && !door.isOpen && door.id !== 'calle') { door.locked = false; door.lockedInside = false; door.speed = .6; door.target = 1; this.g.audio.play('door_open_slow', { pos: door.handlePos(), roomId: A.room, gain: .6 }); }
    const dx = tgt.x - A.pos.x, dz = tgt.z - A.pos.z, dd = Math.hypot(dx, dz);
    if (dd < .2) { this.path?.shift(); return; }
    const mv = Math.min(dd, v * dt); A.pos.x += dx / dd * mv; A.pos.z += dz / dd * mv; A.speed = v; A.mode = 'walk';
    A.room = B.roomAt(A.pos) || A.room; this.face(tgt, dt);
    this.acc = (this.acc || 0) + mv;
    if (this.acc > .55) { this.acc = 0; this.g.audio.footstep({ surface: B.rooms[A.room]?.surface || 'mosaic', intensity: .35, pos: A.pos.clone(), roomId: A.room, by: this.fake && Math.random() < .12 ? 'entity' : 'elena' }); }
  }
  face(p, dt) { const A = this.agent; const a = Math.atan2(p.x - A.pos.x, p.z - A.pos.z); let d = a - A.facing; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; A.facing += d * Math.min(1, dt * 3); }
  pose(dt) { if (this.fake) return; const A = this.agent; A.body.root.position.copy(A.pos); A.body.root.rotation.y = A.facing; A.body.update(dt, { speed: A.speed, mode: A.mode, lookAt: A.mode === 'idle' ? this.g.camera.position : null }); }

  // the only thing it cannot copy: a reflection
  checkMirror(dt) {
    const cam = this.g.camera, A = this.agent; const fwd = this.g.player.forward(V());
    let looking = false;
    for (const m of this.g.props.mirrors) {
      if (!m.refl.visible) continue;
      const to = m.pos.clone().sub(cam.position); const d = to.length(); if (d > 4.5) continue;
      if (fwd.dot(to.normalize()) < .9) continue;
      if (A.pos.distanceTo(this.g.player.pos) > 4.5) continue;
      if (m.normal.dot(A.pos.clone().sub(m.pos)) <= 0) continue;
      looking = true;
    }
    this.mirrorT = looking ? this.mirrorT + dt : 0;
    if (this.mirrorT > .9) { this.g.entity.reveal(); }
  }
}
