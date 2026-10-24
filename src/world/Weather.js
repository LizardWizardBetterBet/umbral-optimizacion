// Rain only where the sky is open (vereda, patio). Streaks catch the nearby light; ripples on the ground.
import * as THREE from 'three';

export class Rain {
  constructor(scene, volumes) {
    this.volumes = volumes; const N = 2600; this.N = N;
    const pos = new Float32Array(N * 6); this.drops = [];
    for (let i = 0; i < N; i++) { const v = volumes[i % volumes.length]; const d = { v, x: 0, y: 0, z: 0, s: 7 + Math.random() * 3 }; this.reset(d, true); this.drops.push(d); }
    this.geo = new THREE.BufferGeometry(); this.geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.mat = new THREE.LineBasicMaterial({ color: 0x9aa7ad, transparent: true, opacity: .32, depthWrite: false });
    this.lines = new THREE.LineSegments(this.geo, this.mat); this.lines.frustumCulled = false; scene.add(this.lines);
    // splash ripples on wet ground
    const rp = new Float32Array(400 * 3); this.rippleGeo = new THREE.BufferGeometry(); this.rippleGeo.setAttribute('position', new THREE.BufferAttribute(rp, 3));
    this.ripples = new THREE.Points(this.rippleGeo, new THREE.PointsMaterial({ color: 0xb8c4c8, size: .03, transparent: true, opacity: .5, depthWrite: false }));
    this.ripples.frustumCulled = false; scene.add(this.ripples);
  }
  reset(d, any) { const [x0, x1, z0, z1, top] = d.v; d.x = x0 + Math.random() * (x1 - x0); d.z = z0 + Math.random() * (z1 - z0); d.y = any ? Math.random() * top : top; }
  update(dt, wind = .4) {
    const p = this.geo.attributes.position.array; const rp = this.rippleGeo.attributes.position.array; let r = 0;
    for (let i = 0; i < this.N; i++) {
      const d = this.drops[i]; d.y -= d.s * dt; d.x += wind * dt;
      if (d.y < 0) { if (r < 400) { rp[r * 3] = d.x; rp[r * 3 + 1] = .01; rp[r * 3 + 2] = d.z; r++; } this.reset(d, false); }
      const o = i * 6; p[o] = d.x; p[o + 1] = d.y; p[o + 2] = d.z; p[o + 3] = d.x - wind * .03; p[o + 4] = d.y + .16; p[o + 5] = d.z;
    }
    for (let k = r; k < 400; k++) rp[k * 3 + 1] = -10;
    this.geo.attributes.position.needsUpdate = true; this.rippleGeo.attributes.position.needsUpdate = true;
  }
}
