// Builds the architectural shell (floors, ceilings, walls with real openings, frames, door leaves,
// windows, gates) from layout.js and exposes the queries the rest of the game needs.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ROOMS, PORTALS } from './layout.js';

const EPS = 1e-3;

export class Building {
  constructor(scene, mats) {
    this.scene = scene; this.mats = mats;
    this.rooms = ROOMS; this.portals = PORTALS.map(p => ({ ...p }));
    this.portalById = Object.fromEntries(this.portals.map(p => [p.id, p]));
    this.segments = [];          // static wall segments [{x1,z1,x2,z2}]
    this.boxes = [];             // furniture colliders {x0,x1,z0,z1,room}
    this.doors = {};             // id -> door runtime
    this.geoBuckets = new Map(); // material -> [geometries]
    this.group = new THREE.Group(); scene.add(this.group);
    for (const [id, r] of Object.entries(ROOMS)) this.buildRoom(id, r);
    for (const p of this.portals) this.buildPortal(p);
  }

  // ---------- queries ----------
  roomAt(pos) {
    const x = pos.x, z = pos.z;
    let best = null;
    for (const [id, r] of Object.entries(ROOMS)) {
      const [x0, x1, z0, z1] = r.b;
      if (x >= x0 - EPS && x <= x1 + EPS && z >= z0 - EPS && z <= z1 + EPS) { if (!best || id !== 'calle') best = id; }
    }
    return best;
  }
  neighbors(roomId) {
    return this.portals.filter(p => p.b && (p.a === roomId || p.b === roomId) && p.type !== 'window').map(p => ({ portal: p, room: p.a === roomId ? p.b : p.a }));
  }
  portalOpen(p) { if (p.type === 'opening') return 1; if (p.type === 'window') return .12; const d = this.doors[p.id]; return d ? d.amount : 0; }
  portalCenter(p) { const u = (p.from + p.to) / 2; return p.axis === 'x' ? new THREE.Vector3(p.c, 1.2, u) : new THREE.Vector3(u, 1.2, p.c); }

  // All segments currently blocking movement/sight: walls + closed-ish door leaves.
  blockingSegments() {
    const segs = this.segments.slice();
    for (const d of Object.values(this.doors)) segs.push(d.segment());
    return segs;
  }

  // 2D sight/occlusion test on the plan (walls are full height; furniture ignored).
  lineOfSight(a, b) {
    for (const s of this.blockingSegments()) if (segIntersect(a.x, a.z, b.x, b.z, s.x1, s.z1, s.x2, s.z2)) return false;
    return true;
  }

  // ---------- construction ----------
  add(geo, mat) { if (!this.geoBuckets.has(mat)) this.geoBuckets.set(mat, []); this.geoBuckets.get(mat).push(geo); }

  finalize() {
    for (const [mat, list] of this.geoBuckets) {
      const g = mergeGeometries(list.map(x => x.index ? x.toNonIndexed() : x), false);
      const mesh = new THREE.Mesh(g, mat); mesh.matrixAutoUpdate = false; mesh.receiveShadow = true; mesh.castShadow = true;
      this.group.add(mesh);
    }
    this.geoBuckets.clear();
  }

  buildRoom(id, r) {
    const [x0, x1, z0, z1] = r.b; const w = x1 - x0, d = z1 - z0;
    const floorMat = this.mats[r.floor];
    const floor = new THREE.PlaneGeometry(w, d); floor.rotateX(-Math.PI / 2); floor.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
    worldUV(floor, 'xz', floorMat); this.add(floor, floorMat);
    if (r.outdoor) return this.buildOutdoor(id, r);
    const ceil = new THREE.PlaneGeometry(w, d); ceil.rotateX(Math.PI / 2); ceil.translate((x0 + x1) / 2, r.h, (z0 + z1) / 2);
    worldUV(ceil, 'xz', this.mats.ceiling); this.add(ceil, this.mats.ceiling);
    // cornice moulding
    const sides = [
      { axis: 'z', c: z0, u0: x0, u1: x1, n: [0, 1] }, { axis: 'z', c: z1, u0: x0, u1: x1, n: [0, -1] },
      { axis: 'x', c: x0, u0: z0, u1: z1, n: [1, 0] }, { axis: 'x', c: x1, u0: z0, u1: z1, n: [-1, 0] },
    ];
    for (const s of sides) this.buildWall(id, r, s);
  }

  openingsOn(id, s) {
    return this.portals.filter(p => (p.a === id || p.b === id) && p.axis === s.axis && Math.abs(p.c - s.c) < EPS && p.to > s.u0 && p.from < s.u1)
      .map(p => ({ u0: Math.max(p.from, s.u0), u1: Math.min(p.to, s.u1), y0: p.type === 'window' ? p.sill : 0, y1: Math.min(p.h, 99), p }))
      .sort((a, b) => a.u0 - b.u0);
  }

  buildWall(id, r, s) {
    const H = r.h, mat = this.mats[r.wall];
    const ops = this.openingsOn(id, s);
    const rects = []; let u = s.u0;
    for (const o of ops) {
      if (o.u0 > u) rects.push([u, o.u0, 0, H]);
      if (o.y0 > 0) rects.push([o.u0, o.u1, 0, o.y0]);
      if (o.y1 < H) rects.push([o.u0, o.u1, o.y1, H]);
      u = o.u1;
    }
    if (u < s.u1) rects.push([u, s.u1, 0, H]);
    for (const [a, b, y0, y1] of rects) {
      if (b - a < EPS || y1 - y0 < EPS) continue;
      this.add(wallQuad(s, a, b, y0, y1, mat), mat);
    }
    // collision: wall minus passable openings (doors/openings); windows+gates block
    let cu = s.u0;
    for (const o of ops) {
      if (o.p.type === 'door' || o.p.type === 'opening') { if (o.u0 > cu) this.pushSeg(s, cu, o.u0); cu = o.u1; }
    }
    if (cu < s.u1) this.pushSeg(s, cu, s.u1);
    // skirting board along solid parts at floor
    let su = s.u0; const skirt = this.mats.wood;
    const solid = [];
    for (const o of ops) { if (o.y0 === 0) { if (o.u0 > su) solid.push([su, o.u0]); su = o.u1; } }
    if (su < s.u1) solid.push([su, s.u1]);
    if (r.wall !== 'wallKitchen' && r.wall !== 'wallBath') for (const [a, b] of solid) this.add(boxAlong(s, a, b, 0, .14, .018), skirt);
    // cornice
    if (H > 2.6) for (const [a, b] of [[s.u0, s.u1]]) this.add(boxAlong(s, a, b, H - .09, H, .05), this.mats.enamel);
  }

  pushSeg(s, a, b) {
    if (b - a < EPS) return;
    if (s.axis === 'z') this.segments.push({ x1: a, z1: s.c, x2: b, z2: s.c }); else this.segments.push({ x1: s.c, z1: a, x2: s.c, z2: b });
  }

  buildOutdoor(id, r) {
    const [x0, x1, z0, z1] = r.b;
    if (id === 'calle') {
      // façade of our building at z=0 (facing north), tall
      const s = { axis: 'z', c: 0, u0: x0 - 6, u1: x1 + 6, n: [0, -1] };
      const fr = { ...r, h: 9 }; this.buildWall(id, fr, s);
      // sidewalk edges are invisible limits (curb + parked car read as edge)
      this.segments.push({ x1: x0, z1: z0, x2: x1, z2: z0 }, { x1: x0, z1: z0, x2: x0, z2: 0 }, { x1: x1, z1: z0, x2: x1, z2: 0 });
      const curb = new THREE.BoxGeometry(x1 - x0 + 12, .16, .25); curb.translate(0, .08, z0 - .1); this.add(curb, this.mats.concrete);
      const road = new THREE.PlaneGeometry(40, 12); road.rotateX(-Math.PI / 2); road.translate(0, -.12, z0 - 6.2); worldUV(road, 'xz', this.mats.concrete); this.add(road, this.mats.concrete);
      const opp = new THREE.PlaneGeometry(40, 14); opp.translate(0, 6, z0 - 12); worldUV(opp, 'xy', this.mats.facade); this.add(opp, this.mats.facade);
      // sidewalk continues left/right
      const side = new THREE.PlaneGeometry(14, 3.6); side.rotateX(-Math.PI / 2);
      const l = side.clone(); l.translate(x0 - 7, 0, (z0 + z1) / 2); worldUV(l, 'xz', this.mats.street); this.add(l, this.mats.street);
      const rr = side.clone(); rr.translate(x1 + 7, 0, (z0 + z1) / 2); worldUV(rr, 'xz', this.mats.street); this.add(rr, this.mats.street);
      return;
    }
    // patio: four tall façades with windows of other units
    const H = 11;
    const sides = [
      { axis: 'z', c: z0, u0: x0, u1: x1, n: [0, 1] }, { axis: 'z', c: z1, u0: x0, u1: x1, n: [0, -1] },
      { axis: 'x', c: x0, u0: z0, u1: z1, n: [1, 0] }, { axis: 'x', c: x1, u0: z0, u1: z1, n: [-1, 0] },
    ];
    for (const s of sides) this.buildWall(id, { ...r, h: H, wall: 'facade' }, s);
  }

  buildPortal(p) {
    const m = this.mats;
    const u0 = p.from, u1 = p.to, wdt = u1 - u0, H = p.h;
    const s = { axis: p.axis, c: p.c, n: p.axis === 'z' ? [0, 1] : [1, 0] };
    const depth = .2, trim = .07;
    const frameMat = p.leaf === 'paint' ? m.woodPaint : (p.type === 'opening' ? m.enamel : m.wood);
    if (p.type === 'window') {
      const y0 = p.sill;
      this.add(frameBox(s, u0 - trim, u0, y0, H, depth), m.woodPaint); this.add(frameBox(s, u1, u1 + trim, y0, H, depth), m.woodPaint);
      this.add(frameBox(s, u0 - trim, u1 + trim, H, H + trim, depth), m.woodPaint);
      this.add(frameBox(s, u0 - trim, u1 + trim, y0 - .05, y0, depth + .08), m.marble);
      // sash: two leaves with muntins + glass
      const mid = (u0 + u1) / 2;
      for (const [a, b] of [[u0, mid], [mid, u1]]) {
        this.add(frameBox(s, a, a + .05, y0, H, .05), m.woodPaint); this.add(frameBox(s, b - .05, b, y0, H, .05), m.woodPaint);
        for (const yy of [y0, y0 + (H - y0) * .55, H - .05]) this.add(frameBox(s, a, b, yy, yy + .05, .05), m.woodPaint);
      }
      this.add(frameBox(s, u0, u1, y0, H, .01), m.glass);
      if (p.bars) for (let u = u0 + .08; u < u1; u += .12) this.add(frameBox(s, u - .01, u + .01, y0, H, .02, .1), m.iron);
      if (p.outside === 'shaft') this.buildShaft(p);
      return;
    }
    if (p.type === 'gate') return this.buildGate(p, s);
    // door / opening frame (jambs + lintel through the wall)
    this.add(frameBox(s, u0 - trim, u0, 0, H + trim, depth), frameMat);
    this.add(frameBox(s, u1, u1 + trim, 0, H + trim, depth), frameMat);
    this.add(frameBox(s, u0 - trim, u1 + trim, H, H + trim, depth), frameMat);
    if (p.id === 'calle' || p.id === 'patio') { // transom glass over the tall doors
      this.add(frameBox(s, u0, u1, H + trim, H + .6, .03), m.glassFrost); this.add(frameBox(s, u0 - trim, u1 + trim, H + .6, H + .6 + trim, depth), frameMat);
    }
    if (p.type === 'door') this.doors[p.id] = new Door(this, p, s);
  }

  buildGate(p, s) {
    const m = this.mats; const H = p.h;
    if (p.id === 'ascensor') {
      // cage lift: shaft behind, scissor gate, car parked above (cables visible)
      const g = new THREE.Group(); this.group.add(g);
      for (let u = p.from + .05; u < p.to; u += .1) { this.add(frameBox(s, u - .008, u + .008, 0, H, .015, -.03), m.iron); }
      for (const y of [.05, 1.05, H - .05]) this.add(frameBox(s, p.from, p.to, y - .03, y + .03, .03, -.03), m.iron);
      for (let i = 0; i < 14; i++) { const ua = p.from + (i / 14) * (p.to - p.from); this.add(diagBar(s, ua, ua + .1, .1, H - .1, -.05), m.iron); }
      const shaft = new THREE.BoxGeometry(1.6, 7, 1.7); shaft.scale(-1, 1, 1); shaft.translate(2.05, 3.4, 10.15); worldUV(shaft, 'box', m.wallService); this.add(shaft, m.wallService);
      const floorCar = new THREE.BoxGeometry(1.35, .12, 1.4); floorCar.translate(2.0, 3.55, 10.15); this.add(floorCar, m.wood);
      for (const dx of [-.6, .6]) for (const dz of [-.6, .6]) { const b = new THREE.BoxGeometry(.03, 2.2, .03); b.translate(2.0 + dx, 4.7, 10.15 + dz); this.add(b, m.iron); }
      for (const dz of [-.15, .15]) { const c = new THREE.CylinderGeometry(.008, .008, 6, 4); c.translate(2.0, 3.0, 10.15 + dz); this.add(c, m.iron); }
      this.segments.push({ x1: p.c, z1: p.from, x2: p.c, z2: p.to });
      return;
    }
    // stair behind iron railing gate: marble flight rising north, closed at its foot with a padlocked reja
    const steps = 16, rise = 3.3 / steps, run = (p.to - p.from - .3) / steps;
    for (let i = 0; i < steps; i++) {
      const zf = p.to - .2 - i * run;
      const st = new THREE.BoxGeometry(1.3, rise * (i + 1), run); st.translate(1.9, rise * (i + 1) / 2, zf - run / 2); this.add(st, i % 2 ? m.marble : m.marble);
      const nose = new THREE.BoxGeometry(1.32, .03, .04); nose.translate(1.9, rise * (i + 1), zf - .02); this.add(nose, m.wood);
    }
    const wallS = new THREE.PlaneGeometry(p.to - p.from, 6); wallS.rotateY(-Math.PI / 2); wallS.translate(2.6, 3, (p.from + p.to) / 2); worldUV(wallS, 'zy', m.wallHall); this.add(wallS, m.wallHall);
    // handrail following the flight
    const hr = new THREE.CylinderGeometry(.025, .025, Math.hypot(steps * run, 3.3), 6);
    hr.rotateX(Math.atan2(steps * run, 3.3)); hr.translate(1.3, 3.3 / 2 + .9, p.to - .2 - steps * run / 2); this.add(hr, m.wood);
    for (let i = 0; i < steps; i += 2) { const zf = p.to - .2 - i * run - run / 2; const b = new THREE.CylinderGeometry(.01, .01, .9, 4); b.translate(1.3, rise * (i + 1) + .45, zf); this.add(b, m.iron); }
    // gate at the foot
    for (let u = p.from + 4.0; u < p.to; u += .11) this.add(frameBox(s, u - .01, u + .01, 0, 2.1, .02, .02), m.iron);
    for (const y of [.1, 1.0, 2.05]) this.add(frameBox(s, p.from + 4.0, p.to, y - .02, y + .02, .03, .02), m.iron);
    const pad = new THREE.BoxGeometry(.06, .08, .03); pad.translate(p.c + .03, 1.0, p.from + 4.05); this.add(pad, m.brass);
    this.segments.push({ x1: p.c, z1: p.from, x2: p.c, z2: p.to });
  }

  buildShaft(p) {
    // aire y luz: a narrow wet shaft outside the window, faint sky light at the top
    const m = this.mats; const u = (p.from + p.to) / 2, len = p.to - p.from + 1.4;
    const out = p.axis === 'x' ? (p.c < -5 ? -1 : 1) : 1; // outward direction
    const g = new THREE.BoxGeometry(p.axis === 'x' ? 1.3 : len, 12, p.axis === 'x' ? len : 1.3); g.scale(-1, 1, 1);
    if (p.axis === 'x') g.translate(p.c + out * .67, 5, u); else g.translate(u, 5, p.c + .67);
    worldUV(g, 'box', m.facade); this.add(g, m.facade);
  }
}

// ---------- door runtime ----------
export class Door {
  constructor(building, p, s) {
    this.b = building; this.p = p; this.id = p.id;
    this.locked = !!p.locked; this.lockedInside = !!p.lockedInside; this.padlock = !!p.padlock;
    this.amount = p.open || 0; this.target = this.amount; this.speed = 1.2; this.maxAngle = 1.75;
    const m = building.mats;
    const w = p.to - p.from, H = p.h - .01;
    const hingeU = p.hinge === 'from' ? p.from : p.to, dir = p.hinge === 'from' ? 1 : -1;
    this.hinge = p.axis === 'z' ? new THREE.Vector2(hingeU, p.c) : new THREE.Vector2(p.c, hingeU);
    const cd = p.axis === 'z' ? [dir, 0] : [0, dir];
    this.phi0 = Math.atan2(-cd[1], cd[0]);
    // swing side: test which rotation sign moves the tip toward the swing room
    const sw = p.swing && building.rooms[p.swing];
    let sign = 1;
    if (sw) {
      const t = this.phi0 + .3; const tip = [Math.cos(t), -Math.sin(t)];
      const sideCoord = p.axis === 'z' ? tip[1] : tip[0];
      const roomSide = p.axis === 'z' ? ((sw.b[2] + sw.b[3]) / 2 - p.c) : ((sw.b[0] + sw.b[1]) / 2 - p.c);
      sign = Math.sign(sideCoord) === Math.sign(roomSide) ? 1 : -1;
    }
    this.sign = sign; this.width = w;
    this.pivot = new THREE.Group(); this.pivot.position.set(this.hinge.x, 0, this.hinge.y);
    this.leaf = mergeGroup(buildLeaf(p, w, H, m)); this.leaf.position.x = w / 2;
    this.pivot.add(this.leaf); building.group.add(this.pivot);
    this.leaf.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.userData.door = this; } });
    this.apply();
  }
  angle() { return this.phi0 + this.sign * this.amount * this.maxAngle; }
  apply() { this.pivot.rotation.y = this.angle(); }
  update(dt) {
    const d = this.target - this.amount;
    if (Math.abs(d) < .001) { this.amount = this.target; return false; }
    this.amount += Math.sign(d) * Math.min(Math.abs(d), this.speed * dt);
    this.apply(); return true;
  }
  tip() { const a = this.angle(); return new THREE.Vector2(this.hinge.x + Math.cos(a) * this.width, this.hinge.y - Math.sin(a) * this.width); }
  segment() { const t = this.tip(); return { x1: this.hinge.x, z1: this.hinge.y, x2: t.x, z2: t.y, door: this }; }
  handlePos() { const a = this.angle(); const d = this.width - .08; return new THREE.Vector3(this.hinge.x + Math.cos(a) * d, 1.0, this.hinge.y - Math.sin(a) * d); }
  get isOpen() { return this.amount > .08; }
}

function buildLeaf(p, w, H, m) {
  const g = new THREE.Group(); const T = .045;
  const box = (sx, sy, sz, x, y, z, mat) => { const b = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat); b.position.set(x, y, z); g.add(b); return b; };
  if (p.leaf === 'glass' || p.leaf === 'street') {
    const mat = p.leaf === 'street' ? m.wood : m.woodPaint;
    box(w, .12, T * 1.6, 0, .06, 0, mat); box(w, .28, T * 1.6, 0, .9, 0, mat); box(w, .1, T * 1.6, 0, H - .05, 0, mat);
    box(.1, H, T * 1.6, -w / 2 + .05, H / 2, 0, mat); box(.1, H, T * 1.6, w / 2 - .05, H / 2, 0, mat);
    box(w - .2, .78, T, 0, .5, 0, mat);
    const gl = box(w - .2, H - 1.15, .008, 0, 1.04 + (H - 1.15) / 2, 0, p.leaf === 'street' ? m.glassFrost : m.glass); gl.userData.glass = true;
    // wrought iron arabesque over glass
    for (let i = 1; i < 6; i++) box(.012, H - 1.15, .02, -w / 2 + .1 + i * (w - .2) / 6, 1.04 + (H - 1.15) / 2, .03, m.iron);
    for (let i = 0; i < 3; i++) { const ring = new THREE.Mesh(new THREE.TorusGeometry((w - .2) / 6, .01, 4, 16), m.iron); ring.position.set(-w / 4 + i * w / 4, 1.04 + (H - 1.15) * .7, .03); g.add(ring); }
  } else if (p.leaf === 'plank') {
    for (let i = 0; i < 5; i++) box(w / 5 - .006, H, T, -w / 2 + w / 10 + i * w / 5, H / 2, 0, m.woodLight);
    box(w, .12, .02, 0, .4, -T, m.woodLight); box(w, .12, .02, 0, H - .4, -T, m.woodLight);
  } else {
    const mat = p.leaf === 'paint' ? m.woodPaint : m.wood;
    box(w, H, T, 0, H / 2, 0, mat);
    // raised panels on both faces
    for (const zz of [T / 2 + .006, -T / 2 - .006]) {
      box(w - .24, H * .36, .012, 0, H * .27, zz, mat);
      box(w - .24, H * .4, .012, 0, H * .73, zz, mat);
    }
  }
  // brass hardware: rosette + lever + keyhole both sides
  for (const zz of [1, -1]) {
    const ros = new THREE.Mesh(new THREE.CylinderGeometry(.03, .03, .01, 12), m.brass); ros.rotation.x = Math.PI / 2; ros.position.set(w / 2 - .08, 1.0, zz * (T / 2 + .01)); g.add(ros);
    const lever = new THREE.Mesh(new THREE.BoxGeometry(.12, .018, .018), m.brass); lever.position.set(w / 2 - .13, 1.0, zz * (T / 2 + .05)); g.add(lever);
    const stem = new THREE.Mesh(new THREE.BoxGeometry(.016, .016, .05), m.brass); stem.position.set(w / 2 - .08, 1.0, zz * (T / 2 + .03)); g.add(stem);
    const key = new THREE.Mesh(new THREE.BoxGeometry(.03, .07, .006), m.brass); key.position.set(w / 2 - .08, .88, zz * (T / 2 + .004)); g.add(key);
  }
  if (p.label) { // apartment plate
    const c = document.createElement('canvas'); c.width = 128; c.height = 64; const x = c.getContext('2d');
    x.fillStyle = '#b08a4a'; x.fillRect(0, 0, 128, 64); x.fillStyle = '#2a1d0c'; x.font = 'bold 34px Georgia'; x.textAlign = 'center'; x.fillText(p.label, 64, 44);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(.12, .06), new THREE.MeshStandardMaterial({ map: t, metalness: .7, roughness: .4 }));
    plate.position.set(0, 1.55, -(T / 2 + .002)); plate.rotation.y = Math.PI; g.add(plate);
    const plate2 = plate.clone(); plate2.position.z = T / 2 + .002; plate2.rotation.y = 0; g.add(plate2);
  }
  return g;
}

// collapse a group of meshes into one mesh per material (draw-call budget for iGPUs)
export function mergeGroup(g) {
  g.updateMatrixWorld(true); const by = new Map();
  g.traverse(o => { if (!o.isMesh) return; const geo = o.geometry.clone().applyMatrix4(o.matrixWorld); const k = o.material; if (!by.has(k)) by.set(k, []); by.get(k).push(geo.index ? geo.toNonIndexed() : geo); });
  const out = new THREE.Group();
  for (const [mat, list] of by) { for (const l of list) { for (const a of Object.keys(l.attributes)) if (!['position', 'normal', 'uv'].includes(a)) l.deleteAttribute(a); } out.add(new THREE.Mesh(mergeGeometries(list, false), mat)); }
  return out;
}

// ---------- geometry helpers ----------
function wallQuad(s, a, b, y0, y1, mat) {
  const w = b - a, h = y1 - y0; const g = new THREE.PlaneGeometry(w, h);
  const mid = (a + b) / 2, ym = (y0 + y1) / 2;
  if (s.axis === 'z') { if (s.n[1] < 0) g.rotateY(Math.PI); g.translate(mid, ym, s.c); }
  else { g.rotateY(s.n[0] > 0 ? Math.PI / 2 : -Math.PI / 2); g.translate(s.c, ym, mid); }
  // UV: u along wall in metres (consistent direction), v = height
  const metres = mat.userData.metres || [1, 1]; const uv = g.attributes.uv, pos = g.attributes.position;
  for (let i = 0; i < uv.count; i++) { const along = s.axis === 'z' ? pos.getX(i) : pos.getZ(i); uv.setXY(i, (along + s.c * 1.7) / metres[0], pos.getY(i) / metres[1]); }
  return g;
}
function boxAlong(s, a, b, y0, y1, depth) {
  const g = new THREE.BoxGeometry(s.axis === 'z' ? b - a : depth, y1 - y0, s.axis === 'z' ? depth : b - a);
  const off = depth / 2; const mid = (a + b) / 2;
  if (s.axis === 'z') g.translate(mid, (y0 + y1) / 2, s.c + s.n[1] * off); else g.translate(s.c + s.n[0] * off, (y0 + y1) / 2, mid);
  return g;
}
function frameBox(s, a, b, y0, y1, depth, offset = 0) {
  const g = new THREE.BoxGeometry(s.axis === 'z' ? b - a : depth, y1 - y0, s.axis === 'z' ? depth : b - a);
  const mid = (a + b) / 2;
  if (s.axis === 'z') g.translate(mid, (y0 + y1) / 2, s.c + offset); else g.translate(s.c + offset, (y0 + y1) / 2, mid);
  return g;
}
function diagBar(s, a, b, y0, y1, offset) {
  const len = Math.hypot(b - a, y1 - y0); const g = new THREE.BoxGeometry(.008, len, .008);
  g.rotateZ(-Math.atan2(b - a, y1 - y0) * (s.axis === 'z' ? 1 : 1));
  const mid = (a + b) / 2;
  if (s.axis === 'x') { g.rotateY(Math.PI / 2); g.translate(s.c + offset, (y0 + y1) / 2, mid); } else g.translate(mid, (y0 + y1) / 2, s.c + offset);
  return g;
}
export function worldUV(g, mode, mat) {
  const metres = mat.userData.metres || [1, 1]; const uv = g.attributes.uv, pos = g.attributes.position, nrm = g.attributes.normal;
  for (let i = 0; i < uv.count; i++) {
    let u, v; const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (mode === 'xz') { u = x; v = z; } else if (mode === 'xy') { u = x; v = y; } else if (mode === 'zy') { u = z; v = y; }
    else { const nx = Math.abs(nrm.getX(i)), ny = Math.abs(nrm.getY(i)); if (ny > .5) { u = x; v = z; } else if (nx > .5) { u = z; v = y; } else { u = x; v = y; } }
    uv.setXY(i, u / metres[0], v / metres[1]);
  }
  return g;
}
export function segIntersect(ax, az, bx, bz, cx, cz, dx, dz) {
  const d = (bx - ax) * (dz - cz) - (bz - az) * (dx - cx); if (Math.abs(d) < 1e-9) return false;
  const t = ((cx - ax) * (dz - cz) - (cz - az) * (dx - cx)) / d, u = ((cx - ax) * (bz - az) - (cz - az) * (bx - ax)) / d;
  return t > 0.001 && t < .999 && u >= 0 && u <= 1;
}
