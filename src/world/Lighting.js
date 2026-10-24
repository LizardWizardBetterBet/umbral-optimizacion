// Light fixtures are real objects in the world (switch, power zone, bulb state). A small pool of
// PointLights is assigned each frame to the relevant fixtures so the shader light count stays constant.
import * as THREE from 'three';

const POOL = 7;

export class Lighting {
  constructor(scene, building) {
    this.scene = scene; this.b = building; this.fixtures = []; this.power = { general: true, palieres: true, '1b': true };
    this.pool = [];
    for (let i = 0; i < POOL; i++) {
      const l = new THREE.PointLight(0xffb36b, 0, 8, 2); l.castShadow = false; scene.add(l); this.pool.push({ light: l, fx: null, cur: 0 });
    }
    // the first pool light may cast shadows (closest fixture in the player's room)
    const sl = this.pool[0].light; sl.castShadow = false; // perf: only the torch casts dynamic shadows
     sl.shadow.mapSize.set(512, 512); sl.shadow.bias = -.004; sl.shadow.camera.near = .1; sl.shadow.radius = 3;
    this.hemi = new THREE.HemisphereLight(0x3a5d66, 0x221d16, 1.1); scene.add(this.hemi);
  }

  add(fx) {
    const f = { on: true, broken: false, flicker: 0, zone: 'building', intensity: 30, distance: 8, color: 0xffb36b, level: 1, ...fx };
    if (f.mesh) { f.mesh.material = f.mesh.material.clone(); f.baseEmissive = f.mesh.material.emissive.clone(); f.mesh.material.emissiveIntensity = 1; }
    queueMicrotask(() => { if (f.mesh2) { f.mesh2.material = f.mesh2.material.clone(); f.baseEmissive2 = f.mesh2.material.emissive.clone(); } });
    this.fixtures.push(f); return f;
  }
  byId(id) { return this.fixtures.find(f => f.id === id); }
  powered(f) { if (f.zone === 'none') return true; if (!this.power.general) return false; if (f.zone === 'palier') return this.power.palieres; if (f.zone === '1b') return this.power['1b']; return true; }
  lit(f) { return f.on && !f.broken && this.powered(f); }

  update(dt, t, viewer, viewerRoom) {
    // per-fixture level with flicker; tubes blink when starting
    for (const f of this.fixtures) {
      let target = this.lit(f) ? 1 : 0;
      if (target && f.kind === 'tube') {
        if (f.startT === undefined || f.wasOff) { f.startT = t; f.wasOff = false; }
        const age = t - f.startT; if (age < 1.4) target = (Math.sin(age * 40) > .3 && Math.random() > .3) ? 1 : .05;
        else if (Math.random() < .002) f.blinkT = t; if (f.blinkT && t - f.blinkT < .12) target = .15;
      }
      if (!this.lit(f)) f.wasOff = true;
      if (target && f.flicker) target *= 1 - f.flicker * (Math.random() * .6) * (Math.sin(t * 13) > .7 ? 1 : 0);
      if (f.kind === 'tv' && target) target = .55 + Math.random() * .45;
      const k = f.kind === 'tube' ? 1 : Math.min(1, dt * 14); // filament inertia
      f.level += (target - f.level) * k;
      if (f.mesh) { f.mesh.material.emissive.copy(f.baseEmissive).multiplyScalar(f.level); }
      if (f.baseEmissive2) f.mesh2.material.emissive.copy(f.baseEmissive2).multiplyScalar(f.level);
    }
    // choose fixtures for the pool: same room first, then by graph+distance
    const near = new Set([viewerRoom, ...this.b.neighbors(viewerRoom).map(n => n.room)]);
    const cand = this.fixtures.filter(f => f.level > .01 && f.intensity > 0).map(f => {
      const d = f.pos.distanceTo(viewer); const penalty = f.room === viewerRoom ? 0 : near.has(f.room) ? 3 : 12;
      return { f, s: d + penalty - (f.kind === 'street' ? 4 : 0) };
    }).sort((a, b) => a.s - b.s).slice(0, POOL);
    const chosen = new Set(cand.map(c => c.f));
    for (const slot of this.pool) if (slot.fx && !chosen.has(slot.fx)) slot.fx = null;
    for (const c of cand) if (!this.pool.some(s => s.fx === c.f)) { const free = this.pool.find(s => !s.fx && s !== this.pool[0]) || (!this.pool[0].fx ? this.pool[0] : null); if (free) free.fx = c.f; }
    // shadow slot gets the strongest fixture in the viewer's room
    const mine = cand.find(c => c.f.room === viewerRoom && c.f.kind !== 'tv');
    if (mine && this.pool[0].fx !== mine.f) { const other = this.pool.find(s => s.fx === mine.f); if (other) { other.fx = this.pool[0].fx; } this.pool[0].fx = mine.f; }
    for (const slot of this.pool) {
      const l = slot.light, f = slot.fx;
      if (!f) { l.intensity = 0; continue; }
      l.position.copy(f.pos); l.color.setHex(f.color); l.distance = f.distance; l.intensity = f.intensity * f.level;
    }
  }

  // how lit a point is (0 dark .. 1 well lit), for perception. Line of sight to fixture uses the plan.
  lightAt(pos, room) {
    let sum = 0;
    for (const f of this.fixtures) {
      if (f.level < .05 || f.kind === 'street') continue;
      if (f.room !== room && !(f.spill || []).includes(room)) continue;
      const d = Math.max(.6, f.pos.distanceTo(pos)); sum += (f.intensity * f.level) / (d * d) * (f.room === room ? 1 : .3);
    }
    return Math.min(1, sum / 6);
  }
}
