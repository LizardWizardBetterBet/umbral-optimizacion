// First-person investigator. Kinematic circle vs plan segments + furniture boxes. Emits noise.
import * as THREE from 'three';

const RADIUS = .28;

export class Player {
  constructor(id, camera, building) {
    this.id = id; this.camera = camera; this.b = building;
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0; this.eye = 1.68; this.eyeTarget = 1.68;
    this.crouch = false; this.sprint = false; this.stepDist = 0; this.bob = 0;
    this.room = null; this.alive = true; this.hidden = null; this.flashlight = false;
    this.inventory = new Set(); this.speed = 0; this.noise = 0; // instantaneous noise 0..1
    this.input = { f: 0, r: 0 };
    this.onStep = null; // (surface, intensity, pos, room)
    this.stamina = 1; this.lastSprintEnd = -99; this.shake = 0;
    this.lean = 0;
  }
  spawn(pos, yaw) { this.pos.set(...pos); this.yaw = yaw; this.room = this.b.roomAt(this.pos); }

  look(dx, dy) {
    if (this.hidden) { this.yaw = THREE.MathUtils.clamp(this.yaw - dx * .0019, this.hidden.yawMin, this.hidden.yawMax); this.pitch = THREE.MathUtils.clamp(this.pitch - dy * .0019, -.5, .4); return; }
    this.yaw -= dx * .0021; this.pitch = THREE.MathUtils.clamp(this.pitch - dy * .0021, -1.45, 1.4);
  }

  update(dt, t) {
    if (!this.alive) return;
    if (this.hidden) { this.speed = 0; this.noise = 0; this.applyCamera(dt, t); return; }
    const { f, r } = this.input;
    const want = new THREE.Vector3(r, 0, -f); if (want.lengthSq() > 1) want.normalize();
    want.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    const sprinting = this.sprint && f > 0 && !this.crouch && this.stamina > .05;
    const maxV = this.crouch ? .85 : sprinting ? 3.3 : 1.45;
    if (sprinting) this.stamina = Math.max(0, this.stamina - dt * .12); else this.stamina = Math.min(1, this.stamina + dt * (this.speed < .1 ? .14 : .07));
    const target = want.multiplyScalar(maxV);
    const acc = want.lengthSq() > 0 ? 9 : 11;
    this.vel.x += (target.x - this.vel.x) * Math.min(1, acc * dt);
    this.vel.z += (target.z - this.vel.z) * Math.min(1, acc * dt);
    const step = this.vel.clone().multiplyScalar(dt);
    this.move(step);
    this.speed = Math.hypot(this.vel.x, this.vel.z);
    this.eyeTarget = this.crouch ? 1.05 : 1.68;
    // footsteps by travelled distance
    const stride = this.crouch ? .55 : sprinting ? 1.05 : .74;
    this.stepDist += this.speed * dt;
    if (this.stepDist > stride) {
      this.stepDist = 0;
      const intensity = this.crouch ? .12 : sprinting ? 1 : .42;
      this.noise = Math.max(this.noise, intensity);
      this.onStep?.(this.surface(), intensity, this.pos.clone(), this.room);
    }
    this.noise = Math.max(0, this.noise - dt * 2.2);
    this.room = this.b.roomAt(this.pos) || this.room;
    this.applyCamera(dt, t);
  }

  surface() {
    const r = this.b.rooms[this.room]; if (!r) return 'mosaic';
    if (this.room === 'living' && Math.abs(this.pos.x + 7) < 1.1 && Math.abs(this.pos.z - 11) < 1.45) return 'carpet';
    return r.surface;
  }

  move(step) {
    // substeps against segments and boxes
    const n = Math.ceil(step.length() / .08) || 1; const s = step.clone().divideScalar(n);
    const segs = this.b.blockingSegments();
    for (let k = 0; k < n; k++) {
      this.pos.x += s.x; this.pos.z += s.z;
      for (let it = 0; it < 2; it++) {
        for (const g of segs) pushOutSeg(this.pos, g, RADIUS);
        for (const bx of this.b.boxes) pushOutBox(this.pos, bx, RADIUS);
      }
    }
  }

  applyCamera(dt, t) {
    this.eye += (this.eyeTarget - this.eye) * Math.min(1, dt * 7);
    const moving = this.speed > .2;
    this.bob += dt * this.speed * 5.6;
    const bobY = moving ? Math.sin(this.bob) * .018 * Math.min(1, this.speed / 1.4) : 0;
    const bobX = moving ? Math.cos(this.bob * .5) * .012 : 0;
    const breath = Math.sin(t * 1.3) * .004;
    this.shake = Math.max(0, this.shake - dt * 1.5);
    const sh = this.shake * .02;
    const c = this.camera;
    if (this.hidden) c.position.set(this.hidden.pos.x, this.hidden.eye, this.hidden.pos.z);
    else c.position.set(this.pos.x + bobX * Math.cos(this.yaw), this.eye + bobY + breath, this.pos.z - bobX * Math.sin(this.yaw));
    c.rotation.set(this.pitch + (Math.random() - .5) * sh, this.yaw + (Math.random() - .5) * sh, Math.sin(this.bob * .5) * .004 * (moving ? 1 : 0));
  }

  forward(out = new THREE.Vector3()) { return this.camera.getWorldDirection(out); }
  headPos() { return this.camera.position.clone(); }
}

export function pushOutSeg(p, s, r) {
  const ax = s.x1, az = s.z1, bx = s.x2, bz = s.z2;
  const dx = bx - ax, dz = bz - az; const L = dx * dx + dz * dz || 1;
  let t = ((p.x - ax) * dx + (p.z - az) * dz) / L; t = Math.max(0, Math.min(1, t));
  const cx = ax + dx * t, cz = az + dz * t; const ox = p.x - cx, oz = p.z - cz; const d = Math.hypot(ox, oz);
  if (d < r && d > 1e-6) { p.x = cx + ox / d * r; p.z = cz + oz / d * r; return true; }
  return false;
}
export function pushOutBox(p, b, r) {
  const cx = Math.max(b.x0, Math.min(p.x, b.x1)), cz = Math.max(b.z0, Math.min(p.z, b.z1));
  const ox = p.x - cx, oz = p.z - cz; const d = Math.hypot(ox, oz);
  if (d < r) {
    if (d > 1e-6) { p.x = cx + ox / d * r; p.z = cz + oz / d * r; }
    else { // inside: push out along shallowest axis
      const l = p.x - b.x0, rr = b.x1 - p.x, u = p.z - b.z0, dd = b.z1 - p.z; const m = Math.min(l, rr, u, dd);
      if (m === l) p.x = b.x0 - r; else if (m === rr) p.x = b.x1 + r; else if (m === u) p.z = b.z0 - r; else p.z = b.z1 + r;
    }
    return true;
  }
  return false;
}
