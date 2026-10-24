// Furnishing of every space. Static pieces are merged into the building's geometry buckets;
// interactive pieces are separate meshes registered in `things` (id -> {root, room, pos, ...}).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Reflector } from 'three/addons/objects/Reflector.js';

export function furnish(building, lighting, mats) {
  const F = new Furnisher(building, lighting, mats);
  F.zaguan(); F.pasillo(); F.hueco(); F.patio(); F.lavadero(); F.baulera(); F.calle();
  F.hall1b(); F.living(); F.cocina(); F.distrib(); F.dormitorio(); F.bano();
  return F;
}

const V = (x, y, z) => new THREE.Vector3(x, y, z);

class Furnisher {
  constructor(b, l, m) { this.b = b; this.l = l; this.m = m; this.things = {}; this.mirrors = []; this.animated = []; this.shadowTex = blobTexture(); }

  // ---- primitives (y = bottom) ----
  geo(g, x, y, z, rot = 0, mat) { if (rot) g.rotateY(rot); g.translate(x, y, z); this.b.add(g, mat); return g; }
  box(w, h, d, x, y, z, mat, rot = 0) { const g = new THREE.BoxGeometry(w, h, d); g.translate(0, h / 2, 0); return this.geo(g, x, y, z, rot, mat); }
  rbox(w, h, d, x, y, z, mat, rot = 0, r = .04) { const g = new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2.1, h / 2.1, d / 2.1)); g.translate(0, h / 2, 0); return this.geo(g, x, y, z, rot, mat); }
  cyl(rt, rb, h, x, y, z, mat, seg = 16) { const g = new THREE.CylinderGeometry(rt, rb, h, seg); g.translate(0, h / 2, 0); return this.geo(g, x, y, z, 0, mat); }
  lathe(pts, x, y, z, mat, seg = 24) { const g = new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), seg); return this.geo(g, x, y, z, 0, mat); }
  collide(x0, x1, z0, z1) { this.b.boxes.push({ x0, x1, z0, z1 }); }
  collideAround(x, z, w, d, rot = 0) { const c = Math.abs(Math.cos(rot)), s = Math.abs(Math.sin(rot)); const W = w * c + d * s, D = w * s + d * c; this.collide(x - W / 2, x + W / 2, z - D / 2, z + D / 2); }
  blob(x, z, w, d, a = .7, rot = 0) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: this.shadowTex, transparent: true, opacity: a, depthWrite: false, color: 0x000000 }));
    m.rotation.x = -Math.PI / 2; m.rotation.z = rot; m.position.set(x, .004, z); m.renderOrder = 1; this.b.group.add(m);
  }
  mesh(g, mat, x, y, z, parent = this.b.group) { const m = new THREE.Mesh(g, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; parent.add(m); return m; }
  thing(id, root, data = {}) {
    root.traverse(o => { if (o.isMesh) { o.userData.thing = id; o.castShadow = o.receiveShadow = true; } });
    if (!root.parent) this.b.group.add(root);
    const pos = data.pos || root.getWorldPosition(new THREE.Vector3());
    this.things[id] = { id, root, room: this.b.roomAt(pos), pos, ...data }; return this.things[id];
  }
  hotspot(id, w, h, d, x, y, z, data) { // invisible pick volume
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ visible: false }));
    m.position.set(x, y, z); this.b.group.add(m); return this.thing(id, m, { pos: V(x, y, z), ...data });
  }
  // light fixture: visible lamp + registered fixture
  bulbLamp(id, room, x, y, z, { zone = '1b', kind = 'bulb', intensity = 28, distance = 9, color = 0xffad60, shade = 'glass', sw = null, on = true, spill = [] } = {}) {
    const g = new THREE.Group(); g.position.set(x, y, z); this.b.group.add(g);
    const bulbMat = new THREE.MeshStandardMaterial({ color: 0xfff1d6, emissive: new THREE.Color(color).multiplyScalar(1.4), roughness: .3 });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(.045, 12, 8), bulbMat); g.add(bulb);
    if (shade === 'glass') {
      const glass = new THREE.Mesh(new THREE.SphereGeometry(.16, 20, 12, 0, Math.PI * 2, 0, Math.PI * .62), new THREE.MeshStandardMaterial({ color: 0xe8dcc4, emissive: new THREE.Color(color).multiplyScalar(.12), transparent: true, opacity: .9, side: THREE.DoubleSide, roughness: .4 }));
      glass.rotation.x = Math.PI; glass.position.y = .06; g.add(glass);
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(.01, .01, .3), this.m.brass); rod.position.y = .3; g.add(rod);
      const fx = this.l.add({ id, room, pos: V(x, y - .05, z), zone, kind, intensity, distance, color, on, mesh: glass, spill }); fx.mesh2 = bulb; fx.switch = sw; return fx;
    }
    if (shade === 'bare') {
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(.006, .006, .5), this.m.black); cord.position.y = .28; g.add(cord);
      const sock = new THREE.Mesh(new THREE.CylinderGeometry(.02, .025, .06), this.m.black); sock.position.y = .05; g.add(sock);
      const fx = this.l.add({ id, room, pos: V(x, y, z), zone, kind, intensity, distance, color, on, mesh: bulb, spill }); fx.switch = sw; return fx;
    }
    if (shade === 'tube') {
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(.018, .018, 1.2, 8), new THREE.MeshStandardMaterial({ color: 0xe8f2ea, emissive: new THREE.Color(0xd8ffe8).multiplyScalar(1.6) }));
      tube.rotation.z = Math.PI / 2; g.add(tube);
      const housing = new THREE.Mesh(new THREE.BoxGeometry(1.3, .05, .12), this.m.enamel); housing.position.y = .05; g.add(housing);
      g.remove(bulb);
      const fx = this.l.add({ id, room, pos: V(x, y - .1, z), zone, kind: 'tube', intensity, distance, color: 0xd6efe0, on, mesh: tube, spill }); fx.switch = sw; return fx;
    }
    if (shade === 'cone') { // table/floor lamp fabric shade
      const sh = new THREE.Mesh(new THREE.CylinderGeometry(.12, .2, .24, 20, 1, true), new THREE.MeshStandardMaterial({ color: 0xc9b38a, emissive: new THREE.Color(color).multiplyScalar(.5), side: THREE.DoubleSide, roughness: .9 }));
      g.add(sh);
      const fx = this.l.add({ id, room, pos: V(x, y, z), zone, kind, intensity, distance, color, on, mesh: sh, spill }); fx.mesh2 = bulb; fx.switch = sw; return fx;
    }
  }
  switchPlate(id, x, y, z, normal, data = {}) {
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = Math.atan2(normal[0], normal[1]);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(.08, .12, .012), this.m.enamel); plate.position.z = .006; g.add(plate);
    const tog = new THREE.Mesh(new THREE.BoxGeometry(.02, .035, .02), data.button ? this.m.brass : this.m.porcelain); tog.position.z = .018; g.add(tog);
    if (data.button) { tog.geometry = new THREE.CylinderGeometry(.014, .014, .02, 12); tog.rotation.x = Math.PI / 2; // minutero: lit amber pilot
      const pilot = new THREE.Mesh(new THREE.SphereGeometry(.006), new THREE.MeshBasicMaterial({ color: 0xff8a2a })); pilot.position.set(0, .04, .014); g.add(pilot); }
    this.b.group.add(g); return this.thing(id, g, { pos: V(x, y, z), toggle: tog, ...data });
  }
  frame(x, y, z, w, h, normal, img) { // picture on wall
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = Math.atan2(normal[0], normal[1]);
    const fr = new THREE.Mesh(new THREE.BoxGeometry(w, h, .03), this.m.wood); fr.position.z = .015; g.add(fr);
    const pic = new THREE.Mesh(new THREE.PlaneGeometry(w - .06, h - .06), new THREE.MeshStandardMaterial({ map: img, roughness: .6 })); pic.position.z = .031; g.add(pic);
    this.b.group.add(g); return g;
  }
  chair(x, z, rot, dynamic = false) { // thonet-style bentwood chair; static ones are merged into the building
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot;
    const m = this.m;
    for (const [dx, dz] of [[-.19, -.19], [.19, -.19], [-.17, .19], [.17, .19]]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(.018, .022, .45, 8), m.wood); l.position.set(dx, .225, dz); g.add(l); }
    const seat = new THREE.Mesh(new THREE.CylinderGeometry(.22, .22, .035, 20), m.woodLight); seat.position.y = .46; g.add(seat);
    for (const dx of [-.17, .17]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(.013, .013, .5, 6), m.wood); p.position.set(dx, .71, .19); g.add(p); }
    const back = new THREE.Mesh(new THREE.TorusGeometry(.17, .013, 6, 16, Math.PI), m.wood); back.position.set(0, .86, .19); g.add(back);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.19, .01, 6, 20), m.wood); ring.rotation.x = Math.PI / 2; ring.position.y = .2; g.add(ring);
    this.blob(x, z, .6, .6, .55);
    if (!dynamic) { g.updateMatrixWorld(true); for (const c of g.children) { const geo = c.geometry.clone(); geo.applyMatrix4(c.matrixWorld); this.b.add(geo, c.material); } return null; }
    this.b.group.add(g); g.traverse(o => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
    return g;
  }
  shelf(w, h, d, x, z, n, rotY = 0) { // open metal/wood shelving: four uprights + boards
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rotY;
    for (const dx of [-w / 2 + .02, w / 2 - .02]) for (const dz of [-d / 2 + .02, d / 2 - .02]) { const u = new THREE.Mesh(new THREE.BoxGeometry(.035, h, .035), this.m.iron); u.position.set(dx, h / 2, dz); g.add(u); }
    for (let i = 0; i < n; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(w, .025, d), this.m.woodLight); b.position.y = .12 + i * (h - .2) / (n - 1); g.add(b); }
    g.updateMatrixWorld(true); for (const c of g.children) { const geo = c.geometry.clone(); geo.applyMatrix4(c.matrixWorld); this.b.add(geo, c.material); }
  }
  plant(x, z, s = 1, y = 0) {
    this.lathe([[0, 0], [.13 * s, 0], [.17 * s, .3 * s], [.18 * s, .32 * s], [0, .32 * s]], x, y, z, this.m.terracotta, 14);
    const leaves = new THREE.Group(); leaves.position.set(x, y + .3 * s, z);
    for (let i = 0; i < 9; i++) { const lf = new THREE.Mesh(new THREE.PlaneGeometry(.08 * s, .5 * s), this.m.plant); lf.position.y = .22 * s; lf.rotation.set(.35 + Math.random() * .4, i * .7, 0); lf.geometry.translate(0, .2 * s, 0); leaves.add(lf); }
    this.b.group.add(leaves); this.blob(x, z, .5 * s, .5 * s, .5); return leaves;
  }

  // ===================== spaces =====================
  calle() {
    const m = this.m;
    // street lamp (sodium) on the opposite side, house number, intercom, a parked Falcon-ish silhouette
    this.cyl(.06, .08, 5.2, 3.6, 0, -3.3, m.iron, 8);
    this.box(.08, .08, 1.2, 3.6, 5.1, -2.8, m.iron);
    const fx = this.bulbLamp('farola', 'calle', 3.6, 5.0, -2.25, { zone: 'none', kind: 'street', intensity: 45, distance: 16, color: 0xffb877, shade: 'bare' });
    this.box(.22, .32, .05, .98, 1.25, -.03, m.brass); // portero eléctrico
    for (let i = 0; i < 6; i++) this.box(.03, .03, .02, .98 + (i % 2 ? .05 : -.05), 1.3 + Math.floor(i / 2) * .06, -.06, m.black);
    this.hotspot('portero', .25, .35, .12, .98, 1.4, -.08, { label: 'Portero eléctrico' });
    const num = labelTex('1418', 'bold 64px Georgia', '#c8b98e', '#1a1a16'); this.frame(-1.15, 2.95, -.01, .4, .2, [0, -1], num);
    const car = new THREE.Group(); car.position.set(-2.2, 0, -5.4);
    const body = new THREE.Mesh(new RoundedBoxGeometry(4.6, .75, 1.8, 3, .2), new THREE.MeshStandardMaterial({ color: 0x3b4a49, roughness: .25, metalness: .5 })); body.position.y = .55; car.add(body);
    const cab = new THREE.Mesh(new RoundedBoxGeometry(2.4, .55, 1.6, 3, .15), new THREE.MeshStandardMaterial({ color: 0x0d1212, roughness: .1, metalness: .4 })); cab.position.set(.2, 1.15, 0); car.add(cab);
    for (const dx of [-1.5, 1.4]) for (const dz of [-.85, .85]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(.33, .33, .2, 14), m.black); w.rotation.x = Math.PI / 2; w.position.set(dx, .33, dz); car.add(w); }
    this.b.group.add(car);
    // opposite building: a few lit windows
    const winMat = new THREE.MeshStandardMaterial({ color: 0x110d08, emissive: 0xff9a4a, emissiveIntensity: .5 });
    for (const [wx, wy] of [[-6, 4.5], [5, 7.5], [9, 4.5]]) { const w = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.5), winMat); w.position.set(wx, wy, -15.59); this.b.group.add(w); }
    this.l.add({ id: 'luna', room: 'calle', pos: V(-3, 9, -12), zone: 'none', kind: 'street', intensity: 25, distance: 30, color: 0x6f86a0 });
    return fx;
  }

  zaguan() {
    const m = this.m;
    // mailboxes: 3x4 grid of brass-fronted wooden boxes
    this.box(.18, 1.0, 1.5, -1.51, .95, 2.3, m.wood);
    const nums = ['PB A', 'PB B', '1°A', '1°B', '2°A', '2°B', '3°A', '3°B', '4°A', '4°B', '5°A', 'Enc.'];
    for (let i = 0; i < 12; i++) {
      const r = Math.floor(i / 3), c = i % 3; const z = 1.75 + c * .5, y = 1.8 - r * .24;
      if (nums[i] === '1°B') continue;
      this.box(.012, .2, .44, -1.415, y - .1, z, m.brass);
      this.box(.01, .02, .3, -1.405, y + .03, z, m.black);
    }
    const mb = new THREE.Group(); mb.position.set(-1.41, 1.8 - 1 * .24 - .1, 1.75 + 0 * .5);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(.012, .2, .44), m.brass); lid.position.y = .1; mb.add(lid);
    const slot = new THREE.Mesh(new THREE.BoxGeometry(.01, .02, .3), m.black); slot.position.set(.006, .13, 0); mb.add(slot);
    this.thing('buzon1b', mb, { pos: V(-1.4, 1.6, 1.75), label: 'Buzón 1°B', lid });
    this.box(.9, .015, .6, 0, 0, .55, new THREE.MeshStandardMaterial({ color: 0x2d2418, roughness: 1 })); // felpudo
    this.plant(1.25, 4.55, 1.4);
    const umb = this.cyl(.12, .1, .55, 1.3, 0, .45, m.iron, 10);
    this.bulbLamp('l_zaguan', 'zaguan', 0, 3.05, 2.5, { zone: 'palier', intensity: 26, distance: 10, sw: 'minutero', spill: ['pasillo'] });
    this.switchPlate('min_zaguan', 1.59, 1.3, .7, [-1, 0], { button: true, label: 'Pulsador de luz' });
    this.frame(1.59, 2.0, 3.0, .5, .65, [-1, 0], noticeTex(['CONSORCIO MORENO 1418', '', 'Se ruega mantener', 'cerrada la puerta', 'de calle después', 'de las 22 hs.', '', 'LA ADMINISTRACIÓN']));
  }

  pasillo() {
    const m = this.m;
    for (const [i, z] of [[0, 8.4], [1, 14.8], [2, 20.2]]) this.bulbLamp('l_pasillo' + i, 'pasillo', 0, 2.85, z, { zone: 'palier', intensity: 22, distance: 9, sw: 'minutero' });
    this.switchPlate('min_pasillo1', -1.19, 1.3, 5.6, [1, 0], { button: true, label: 'Pulsador de luz' });
    this.switchPlate('min_pasillo2', -1.19, 1.3, 16.2, [1, 0], { button: true, label: 'Pulsador de luz' });
    this.switchPlate('min_pasillo3', 1.19, 1.3, 21.5, [-1, 0], { button: true, label: 'Pulsador de luz' });
    // cartelera del consorcio
    const notes = noticeTex(['EXPENSAS OCTUBRE 1991', 'Vencimiento día 10.', '', 'Sra. RÍOS (1°B):', 'favor comunicarse', 'con la administración.', '', 'Se ruega no golpear', 'las cañerías de noche.']);
    this.frame(-1.19, 1.55, 9.2, .7, .9, [1, 0], notes);
    this.hotspot('cartelera', .1, .9, .7, -1.15, 1.55, 9.2, { label: 'Cartelera', read: 'cartelera' });
    this.chair(.85, 8.9, -Math.PI / 2 - .3); this.collide(.6, 1.2, 8.65, 9.15);
    this.plant(-.92, 21.55, 1.2); this.collide(-1.2, -.7, 21.3, 21.8);
    this.box(.16, .5, .16, 1.08, .6, 19.2, new THREE.MeshStandardMaterial({ color: 0x8c1d14, roughness: .4 })); // matafuegos
    this.box(.04, .04, .3, 1.15, 1.25, 19.2, m.iron);
    // lift call panel
    this.box(.12, .22, .02, 1.19, 1.2, 11.2, m.brass); this.box(.03, .03, .02, 1.18, 1.25, 11.2, new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0x300000 }));
    this.hotspot('ascensor_boton', .12, .3, .2, 1.15, 1.25, 11.2, { label: 'Llamar al ascensor' });
    // a neighbour lives behind 1°A: doormat and a little light under the door
    this.box(.6, .012, .9, .85, 0, 7.5, new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 1 }));
    const under = new THREE.Mesh(new THREE.PlaneGeometry(.8, .02), new THREE.MeshBasicMaterial({ color: 0xffb070 })); under.rotation.y = -Math.PI / 2; under.position.set(1.205, .012, 7.5); this.b.group.add(under);
    this.things.luz1a = { id: 'luz1a', root: under, room: 'pasillo', pos: V(1.2, 0, 7.5) };
    this.box(.6, .012, .9, -.85, 0, 12.4, new THREE.MeshStandardMaterial({ color: 0x2a2620, roughness: 1 }));
  }

  hueco() {
    const m = this.m;
    // sloped underside of the flight
    const slope = new THREE.PlaneGeometry(2.0, 2.0); slope.rotateX(Math.PI / 2 + .55); slope.translate(2.2, 1.85, 12.45); this.b.add(slope, m.concrete);
    this.bulbLamp('l_hueco', 'hueco', 2.4, 2.1, 12.4, { zone: 'building', intensity: 9, distance: 4, shade: 'bare', on: false, sw: 'cadena' });
    this.hotspot('sw_hueco', .2, .5, .2, 2.4, 1.75, 12.4, { label: 'Cadenita de la luz', fixture: 'l_hueco' });
    this.shelf(1.6, 1.6, .4, 3.0, 12.45, 4, Math.PI / 2);
    this.rbox(.55, .2, .4, 3.0, .76, 12.1, new THREE.MeshStandardMaterial({ color: 0x4c3524, roughness: .6 })); // valija
    this.cyl(.11, .11, .2, 3.0, 1.16, 12.8, new THREE.MeshStandardMaterial({ color: 0x6a6f5a, roughness: .5, metalness: .4 }));
    this.collide(2.75, 3.2, 11.6, 13.3);
    this.blob(3.0, 12.45, .7, 1.8, .6);
  }

  patio() {
    const m = this.m;
    this.plant(-3.1, 22.5, 1.6); this.plant(-3.1, 23.4, 1.2); this.plant(3.1, 29.4, 1.5); this.plant(2.4, 29.5, 1.1);
    for (const [x, z] of [[-3.1, 22.5], [-3.1, 23.4], [3.1, 29.4], [2.4, 29.5]]) this.collide(x - .25, x + .25, z - .25, z + .25);
    // drain grate
    this.box(.3, .01, .3, 0, 0, 26, m.iron);
    // clothesline with two sheets that move with the wind
    for (const z of [24.2]) { this.box(.04, 2.1, .04, -3.3, 0, z, m.iron); this.box(.04, 2.1, .04, 3.3, 0, z, m.iron); this.box(6.6, .01, .01, 0, 2.05, z, m.iron); }
    for (const x of [-1.6, .9]) {
      const g = new THREE.PlaneGeometry(1.3, 1.4, 10, 10); g.translate(0, -.7, 0);
      const sh = new THREE.Mesh(g, m.sheet); sh.position.set(x, 2.05, 24.2); this.b.group.add(sh); sh.castShadow = true;
      this.animated.push({ mesh: sh, base: g.attributes.position.array.slice(), kind: 'sheet', phase: x });
    }
    // bicycle leaning on the wall (simple but readable)
    const bike = new THREE.Group(); bike.position.set(-3.35, 0, 27.4); bike.rotation.y = Math.PI / 2;
    for (const dx of [-.5, .5]) { const w = new THREE.Mesh(new THREE.TorusGeometry(.33, .015, 6, 24), m.iron); w.position.set(dx, .34, 0); bike.add(w); }
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(.015, .015, 1.0), new THREE.MeshStandardMaterial({ color: 0x5a1a14, metalness: .5, roughness: .4 })); tube.rotation.z = Math.PI / 2; tube.position.y = .6; bike.add(tube);
    bike.rotation.z = .08; this.b.group.add(bike); this.collide(-3.5, -3.1, 26.8, 28);
    // windows of other units on the façades (some lit, some dark). Lit ones are fixtures.
    const lit = new THREE.MeshStandardMaterial({ color: 0x0b0806, emissive: 0xb5763e, emissiveIntensity: .22 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x0f1416, roughness: .1, metalness: .3 });
    const wins = [[-3.49, 4.2, 25, 'x', 1], [-3.49, 7.2, 27, 'x', 0], [3.49, 4.2, 24.5, 'x', 0], [3.49, 7.2, 26.5, 'x', 1], [3.49, 4.2, 28, 'x', 0], [0, 4.2, 22.01, 'z', 0], [-1.5, 7.2, 29.99, 'zr', 1], [1.8, 10, 22.01, 'z', 0]];
    for (const [x, y, z, ax, on] of wins) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.5), on ? lit : dark);
      w.position.set(x, y, z); if (ax === 'x') w.rotation.y = x < 0 ? Math.PI / 2 : -Math.PI / 2; if (ax === 'zr') w.rotation.y = Math.PI; this.b.group.add(w);
      const sill = new THREE.Mesh(new THREE.BoxGeometry(ax === 'x' ? .2 : 1.3, .06, ax === 'x' ? 1.3 : .2), m.marble); sill.position.set(x, y - .78, z); this.b.group.add(sill);
      for (const [mw, mh, oy] of [[1.16, .05, .75], [1.16, .05, -.75], [1.16, .04, .2], [.05, 1.5, 0]]) { const mu = new THREE.Mesh(new THREE.BoxGeometry(ax === 'x' ? .06 : mw, mh, ax === 'x' ? mw : .06), m.woodPaint); mu.position.set(x, y + oy, z); mu.rotation.y = 0; if (mh > 1) { mu.geometry = new THREE.BoxGeometry(ax === 'x' ? .06 : .05, 1.5, ax === 'x' ? .05 : .06); } this.b.group.add(mu); }
    }
    const sil = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.5), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0 })); sil.position.set(3.47, 7.2, 26.5); sil.rotation.y = -Math.PI / 2; this.b.group.add(sil);
    this.things.ventana_vecina = { id: 'ventana_vecina', root: sil, room: 'patio', pos: V(3.4, 7.2, 26.5) };
    this.l.add({ id: 'cielo', room: 'patio', pos: V(0, 5.5, 26.5), zone: 'none', kind: 'street', intensity: 55, distance: 20, color: 0x8197ad });
    this.l.add({ id: 'ventana_patio', room: 'patio', pos: V(3.0, 7.2, 26.5), zone: 'none', kind: 'bulb', intensity: 6, distance: 7, color: 0xffa24c });
    this.bulbLamp('l_patio', 'patio', 0, 2.9, 22.25, { zone: 'palier', intensity: 10, distance: 7, shade: 'bare', sw: 'minutero' });
  }

  lavadero() {
    const m = this.m;
    this.bulbLamp('l_lav', 'lavadero', 0, 2.72, 32.4, { zone: 'building', shade: 'tube', intensity: 34, distance: 10, sw: 'sw_lav' });
    this.switchPlate('sw_lav', 2.65, 1.3, 30.01, [0, 1], { label: 'Interruptor', fixture: 'l_lav' });
    // double concrete sink under the window
    this.box(1.6, .82, .6, -1.5, 0, 30.32, m.concrete); this.box(1.5, .05, .5, -1.5, .78, 30.33, new THREE.MeshStandardMaterial({ color: 0x3e3e3a, roughness: .9 }));
    this.cyl(.012, .012, .25, -1.9, .85, 30.08, m.chrome, 6); this.cyl(.012, .012, .25, -1.1, .85, 30.08, m.chrome, 6);
    this.collide(-2.3, -.7, 30, 30.62); this.blob(-1.5, 30.4, 1.9, .9, .6);
    // top-loading washing machine (late 80s)
    this.rbox(.62, .88, .62, -2.95, 0, 30.4, m.enamel, 0, .05); this.box(.6, .1, .2, -2.95, .88, 30.16, m.enamel); this.box(.1, .03, .02, -2.95, .9, 30.06, m.chrome);
    this.collide(-3.5, -2.6, 30, 30.72); this.blob(-2.95, 30.4, .9, .9, .7);
    // shelving with paint cans + buckets
    this.shelf(1.8, 1.9, .4, 1.4, 34.78, 4);
    for (let i = 0; i < 6; i++) this.cyl(.1, .1, .22, .7 + i * .26, .32 + (i % 3) * .5, 34.75, new THREE.MeshStandardMaterial({ color: [0x7a7768, 0x4f6a72, 0x8a3b2a][i % 3], metalness: .5, roughness: .5 }));
    this.collide(.5, 2.3, 34.5, 35); this.blob(1.4, 34.7, 2.1, .7, .6);
    this.cyl(.16, .13, .3, -.3, 0, 34.6, new THREE.MeshStandardMaterial({ color: 0x2c5a7a, roughness: .5 }));
    // clothesline with a sheet across the room: hides what's behind it
    this.box(6.8, .01, .01, 0, 2.15, 33.0, m.iron);
    const g = new THREE.PlaneGeometry(1.6, 1.5, 10, 10); g.translate(0, -.75, 0); const sh = new THREE.Mesh(g, m.sheet); sh.position.set(-.5, 2.15, 33.0); this.b.group.add(sh); sh.castShadow = true;
    this.animated.push({ mesh: sh, base: g.attributes.position.array.slice(), kind: 'sheet', phase: 2, gentle: true });
    // ELECTRICAL PANEL (tablero): enclosure + three breakers the player and entity can flip
    const T = new THREE.Group(); T.position.set(3.49, 1.45, 32.4); T.rotation.y = -Math.PI / 2; this.b.group.add(T);
    const encl = new THREE.Mesh(new THREE.BoxGeometry(.6, .8, .14), new THREE.MeshStandardMaterial({ color: 0x6d7468, roughness: .5, metalness: .5 })); encl.position.z = .07; T.add(encl);
    const inner = new THREE.Mesh(new THREE.PlaneGeometry(.52, .7), new THREE.MeshStandardMaterial({ color: 0x1e211f, roughness: .8 })); inner.position.z = .141; T.add(inner);
    const lbl = labelTex('GRAL   PALIERES   1°B', 'bold 20px monospace', '#c9c2a0', '#1e211f'); const lb = new THREE.Mesh(new THREE.PlaneGeometry(.5, .05), new THREE.MeshBasicMaterial({ map: lbl })); lb.position.set(0, .12, .143); T.add(lb);
    const ids = ['general', 'palieres', '1b'];
    ids.forEach((id, i) => {
      const br = new THREE.Group(); br.position.set(-.16 + i * .16, 0, .15); T.add(br);
      const bodyB = new THREE.Mesh(new THREE.BoxGeometry(.06, .12, .05), new THREE.MeshStandardMaterial({ color: 0xd8d3c4, roughness: .4 })); br.add(bodyB);
      const lever = new THREE.Mesh(new THREE.BoxGeometry(.025, .05, .03), new THREE.MeshStandardMaterial({ color: i === 0 ? 0x7a1a14 : 0x222222 })); lever.position.set(0, .025, .035); br.add(lever);
      this.thing('breaker_' + id, br, { pos: br.getWorldPosition(new THREE.Vector3()), label: 'Térmica ' + ['general', 'palieres', '1°B'][i], lever });
    });
    this.box(.04, 2.0, .04, 3.45, 1.85, 32.15, m.iron); // conduit up
    this.l.add({ id: 'piloto_tablero', room: 'lavadero', pos: V(3.3, 1.8, 32.4), zone: 'building', kind: 'bulb', intensity: .5, distance: 1.5, color: 0xff3a1a });
  }

  baulera() {
    const m = this.m;
    this.bulbLamp('l_baulera', 'baulera', -4.35, 2.3, 33, { zone: 'building', intensity: 6, distance: 4, shade: 'bare', on: false });
    this.shelf(2.8, 2.0, .5, -4.95, 33, 5, Math.PI / 2);
    for (let i = 0; i < 5; i++) this.rbox(.4, .3, .45, -4.95, .42 + (i % 3) * .45, 32 + i * .5, new THREE.MeshStandardMaterial({ color: 0x8a7350, roughness: .95 }), 0, .01);
    this.collide(-5.2, -4.7, 31.4, 34.6);
    this.chair(-4.0, 34.2, .4);
  }

  hall1b() {
    const m = this.m;
    this.bulbLamp('l_hall', 'hall1b', -2.6, 2.75, 12.4, { intensity: 16, distance: 6, sw: 'sw_hall' });
    this.switchPlate('sw_hall', -1.21, 1.3, 13.2, [-1, 0], { label: 'Interruptor', fixture: 'l_hall' });
    // perchero with Elena's coat
    this.cyl(.02, .025, 1.8, -1.55, 0, 13.45, m.wood, 8); this.cyl(.2, .2, .02, -1.55, 0, 13.45, m.wood, 12);
    this.lathe([[0, 0], [.2, 0], [.24, .4], [.2, .9], [.12, 1.05], [0, 1.08]], -1.55, .62, 13.45, new THREE.MeshStandardMaterial({ color: 0x3e3a33, roughness: .95 }), 14);
    this.collide(-1.8, -1.3, 13.2, 13.7);
    // phone table
    this.box(.5, .7, .35, -3.65, 0, 11.3, m.wood); this.blob(-3.65, 11.3, .7, .55, .6); this.collide(-3.95, -3.35, 11, 11.5);
    this.rbox(.2, .09, .22, -3.65, .7, 11.3, new THREE.MeshStandardMaterial({ color: 0x1b1a18, roughness: .3 }), 0, .03);
    this.hotspot('telefono', .3, .2, .3, -3.65, .8, 11.3, { label: 'Teléfono' });
    this.frame(-2.6, 1.6, 11.01, .4, .5, [0, 1], photoTex('virgen'));
  }

  living() {
    const m = this.m;
    // rug + table with lace cloth + chairs
    const rug = new THREE.PlaneGeometry(2.2, 2.9); rug.rotateX(-Math.PI / 2); rug.translate(-7, .006, 11); this.b.add(rug, m.rug);
    this.box(1.5, .04, .85, -7, .72, 11, m.wood); for (const [dx, dz] of [[-.68, -.36], [.68, -.36], [-.68, .36], [.68, .36]]) this.box(.05, .72, .05, -7 + dx, 0, 11 + dz, m.wood);
    const cloth = new THREE.Group(); cloth.position.set(-7, .765, 11);
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.62, .006, .97), m.lace); cloth.add(top);
    for (const [w, x, z, ry] of [[1.62, 0, .485, 0], [1.62, 0, -.485, Math.PI], [.97, .81, 0, Math.PI / 2], [.97, -.81, 0, -Math.PI / 2]]) {
      const g = new THREE.PlaneGeometry(w, .26, 16, 1); const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 22) * .01); g.computeVertexNormals();
      const sk = new THREE.Mesh(g, m.lace); sk.position.set(x, -.13, z); sk.rotation.y = ry; sk.material.side = THREE.DoubleSide; cloth.add(sk);
    }
    this.b.group.add(cloth); cloth.traverse(o => { o.castShadow = o.receiveShadow = true; });
    this.collide(-7.8, -6.2, 10.55, 11.45); this.blob(-7, 11, 2.1, 1.4, .55);
    this.chair(-7.4, 10.25, Math.PI); this.chair(-6.6, 11.75, 0); this.chair(-7.4, 11.75, .1); const sl = this.chair(-7.95, 11, -Math.PI / 2 + .25, true);
    this.things.silla_living = { id: 'silla_living', root: sl, room: 'living', pos: V(-7.95, 0, 11) };
    // a cup of cold mate, letters on the table
    this.cyl(.035, .03, .08, -6.8, .77, 10.9, new THREE.MeshStandardMaterial({ color: 0x5a3a1a, roughness: .7 }));
    const letters = new THREE.Group(); letters.position.set(-7.3, .772, 11.1);
    for (let i = 0; i < 3; i++) { const p = new THREE.Mesh(new THREE.BoxGeometry(.22, .004, .11), m.paper); p.position.set(i * .02, i * .004, i * .015); p.rotation.y = i * .2; letters.add(p); }
    this.thing('cartas', letters, { pos: V(-7.3, .8, 11.1), label: 'Sobres sobre la mesa', read: 'cartas' });
    // sideboard + MIRROR on the north wall
    this.box(1.8, .88, .5, -7, 0, 7.25, m.wood); this.box(1.84, .03, .54, -7, .88, 7.27, m.wood);
    for (let i = 0; i < 3; i++) this.box(.5, .5, .01, -7.6 + i * .6, .2, 7.505, m.wood);
    this.collide(-7.9, -6.1, 7, 7.52); this.blob(-7, 7.3, 2.2, .8, .65);
    const doily = new THREE.Mesh(new THREE.CylinderGeometry(.18, .18, .003, 20), m.lace); doily.position.set(-6.5, .912, 7.3); this.b.group.add(doily);
    this.mirror('espejo_living', -7, 1.75, 7.012, 1.0, 1.15, [0, 1]);
    // wedding portrait and a recent photo
    this.frame(-6.45, 1.02, 7.15, .2, .26, [0, 1], photoTex('boda')).rotation.x = -.15;
    this.hotspot('foto_boda', .25, .3, .15, -6.45, 1.05, 7.2, { label: 'Foto de casamiento', read: 'foto_boda' });
    // cassette recorder on the sideboard (portable, can be taken)
    const rec = new THREE.Group(); rec.position.set(-7.55, .9, 7.32);
    const rb = new THREE.Mesh(new RoundedBoxGeometry(.28, .07, .16, 2, .01), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: .45 })); rb.position.y = .035; rec.add(rb);
    const win = new THREE.Mesh(new THREE.BoxGeometry(.11, .005, .07), new THREE.MeshStandardMaterial({ color: 0x3a3226, roughness: .1 })); win.position.set(-.04, .072, 0); rec.add(win);
    for (let i = 0; i < 5; i++) { const k = new THREE.Mesh(new THREE.BoxGeometry(.018, .012, .03), m.chrome); k.position.set(.04 + i * .022, .075, .05); rec.add(k); }
    const grill = new THREE.Mesh(new THREE.CylinderGeometry(.035, .035, .005, 16), m.iron); grill.position.set(.08, .072, -.02); rec.add(grill);
    this.thing('grabador', rec, { pos: V(-7.55, .95, 7.32), label: 'Grabador de casetes' });
    // CRT TV on a stand, in the SW corner facing the armchair
    const tv = new THREE.Group(); tv.position.set(-9.35, 0, 14.35); tv.rotation.y = Math.PI * .75; this.b.group.add(tv);
    const stand = new THREE.Mesh(new THREE.BoxGeometry(.7, .55, .45), m.wood); stand.position.y = .275; tv.add(stand);
    const cab = new THREE.Mesh(new RoundedBoxGeometry(.62, .5, .48, 2, .04), new THREE.MeshStandardMaterial({ color: 0x3d2a1b, roughness: .4 })); cab.position.y = .8; tv.add(cab);
    const scr = makeTvScreen(); const screen = new THREE.Mesh(new THREE.PlaneGeometry(.44, .34), scr.material); screen.position.set(-.04, .82, .241); tv.add(screen);
    for (let i = 0; i < 2; i++) { const k = new THREE.Mesh(new THREE.CylinderGeometry(.015, .015, .02, 10), m.chrome); k.rotation.x = Math.PI / 2; k.position.set(.24, .9 - i * .08, .245); tv.add(k); }
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(.004, .004, .45), m.chrome); ant.position.set(.05, 1.2, 0); ant.rotation.z = .5; tv.add(ant); const ant2 = ant.clone(); ant2.rotation.z = -.5; ant2.position.x = -.1; tv.add(ant2);
    tv.traverse(o => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
    this.collide(-9.8, -8.9, 13.9, 14.8); this.blob(-9.35, 14.35, 1, 1, .6, Math.PI * .75);
    const tvfx = this.l.add({ id: 'tv', room: 'living', pos: V(-9.1, .85, 14.1), zone: '1b', kind: 'tv', intensity: 14, distance: 7, color: 0x9fb6d6, on: false });
    this.thing('tv', tv, { pos: V(-9.2, .85, 14.2), label: 'Televisor', screen: scr, fixture: tvfx });
    // armchair facing the TV
    const ac = new THREE.Group(); ac.position.set(-8.25, 0, 12.75); ac.rotation.y = Math.atan2(-1.1, 1.6) + Math.PI; this.b.group.add(ac);
    const seat = new THREE.Mesh(new RoundedBoxGeometry(.75, .42, .72, 3, .08), m.sofa); seat.position.y = .21; ac.add(seat);
    const back = new THREE.Mesh(new RoundedBoxGeometry(.75, .62, .18, 3, .08), m.sofa); back.position.set(0, .62, -.3); back.rotation.x = -.12; ac.add(back);
    for (const dx of [-.34, .34]) { const arm = new THREE.Mesh(new RoundedBoxGeometry(.14, .3, .7, 3, .06), m.sofa); arm.position.set(dx, .52, 0); ac.add(arm); }
    const antiM = new THREE.Mesh(new THREE.PlaneGeometry(.4, .25), m.lace); antiM.position.set(0, .86, -.4); antiM.rotation.x = -.2; antiM.material.side = THREE.DoubleSide; ac.add(antiM);
    ac.traverse(o => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
    this.collideAround(-8.25, 12.75, .78, .75, ac.rotation.y); this.blob(-8.25, 12.75, 1.1, 1.1, .6);
    this.things.sillon = { id: 'sillon', root: ac, room: 'living', pos: V(-8.25, 0, 12.75), seat: V(-8.25, 0, 12.75), face: Math.atan2(-1.1, 1.6) + Math.PI };
    // floor lamp next to it
    this.cyl(.15, .16, .03, -9.25, 0, 11.6, m.brass); this.cyl(.012, .012, 1.45, -9.25, 0, 11.6, m.brass, 8);
    this.bulbLamp('l_pie', 'living', -9.25, 1.55, 11.6, { shade: 'cone', intensity: 7, distance: 5, sw: 'pie', on: false });
    this.hotspot('sw_pie', .3, .35, .3, -9.25, 1.5, 11.6, { label: 'Lámpara de pie', fixture: 'l_pie' });
    this.collide(-9.45, -9.05, 11.4, 11.8);
    // sofa along the south wall
    const sofa = new THREE.Group(); sofa.position.set(-6.9, 0, 14.55); sofa.rotation.y = Math.PI; this.b.group.add(sofa);
    const ss = new THREE.Mesh(new RoundedBoxGeometry(1.9, .42, .8, 3, .08), m.sofa); ss.position.y = .21; sofa.add(ss);
    const sb = new THREE.Mesh(new RoundedBoxGeometry(1.9, .5, .2, 3, .08), m.sofa); sb.position.set(0, .6, -.32); sofa.add(sb);
    for (const dx of [-.9, .9]) { const arm = new THREE.Mesh(new RoundedBoxGeometry(.16, .28, .8, 3, .06), m.sofa); arm.position.set(dx, .5, 0); sofa.add(arm); }
    sofa.traverse(o => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
    this.collide(-7.9, -5.9, 14.1, 15); this.blob(-6.9, 14.55, 2.2, 1.0, .6);
    // china cabinet + clock on the east wall, gas heater with pilot flame
    this.box(.45, 1.9, 1.1, -4.25, 0, 10.0, m.wood); this.box(.01, 1.1, .95, -4.48, .75, 10.0, m.glass);
    for (let i = 0; i < 6; i++) this.cyl(.05, .04, .02, -4.3, 1.05 + Math.floor(i / 3) * .38, 9.7 + (i % 3) * .3, m.porcelain, 12);
    this.collide(-4.5, -4, 9.45, 10.55); this.blob(-4.3, 10, .7, 1.3, .6);
    const clock = new THREE.Group(); clock.position.set(-4.02, 2.15, 8.6); clock.rotation.y = -Math.PI / 2;
    const cf = new THREE.Mesh(new THREE.CylinderGeometry(.17, .17, .04, 24), m.wood); cf.rotation.x = Math.PI / 2; clock.add(cf);
    const face = new THREE.Mesh(new THREE.CircleGeometry(.145, 24), new THREE.MeshStandardMaterial({ map: clockTex(), roughness: .5 })); face.position.z = .022; clock.add(face);
    const hh = new THREE.Mesh(new THREE.BoxGeometry(.008, .08, .004), m.black); hh.geometry.translate(0, .04, 0); hh.position.z = .026; clock.add(hh);
    const mh = new THREE.Mesh(new THREE.BoxGeometry(.006, .12, .004), m.black); mh.geometry.translate(0, .06, 0); mh.position.z = .028; clock.add(mh);
    this.b.group.add(clock); this.things.reloj = { id: 'reloj', root: clock, room: 'living', pos: V(-4.05, 2.15, 8.6), hh, mh };
    this.rbox(.15, .55, .7, -4.08, .05, 7.9, m.enamel, 0, .03);
    const pilot = new THREE.Mesh(new THREE.SphereGeometry(.008), new THREE.MeshBasicMaterial({ color: 0x5f8cff })); pilot.position.set(-4.16, .14, 7.9); this.b.group.add(pilot);
    // ceiling araña (three bulbs in tulip shades), switch by the hall opening
    this.bulbLamp('l_living', 'living', -7, 2.45, 11, { intensity: 22, distance: 10, sw: 'sw_living', spill: ['hall1b'] });
    this.switchPlate('sw_living', -4.01, 1.3, 13.4, [-1, 0], { label: 'Interruptor', fixture: 'l_living' });
    // curtains
    for (const [z0, z1] of [[8.6, 10.0], [11.8, 13.2]]) for (const s of [0, 1]) this.curtain(-9.93, s ? z1 - .25 : z0 + .25, .55);
    this.box(.03, .03, 5.2, -9.95, 2.62, 10.9, m.brass);
    this.plant(-9.6, 7.45, 1.5); this.collide(-9.85, -9.35, 7.2, 7.7);
    this.frame(-9.99, 1.9, 11.0, .55, .4, [1, 0], photoTex('paisaje'));
  }

  curtain(x, z, w) {
    const g = new THREE.PlaneGeometry(w, 2.5, 28, 1); const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 34) * .045 + Math.sin(p.getX(i) * 9) * .02);
    g.computeVertexNormals(); g.rotateY(Math.PI / 2); g.translate(x + .06, 1.36, z); this.b.add(g, this.m.curtain); this.m.curtain.side = THREE.DoubleSide;
  }

  mirror(id, x, y, z, w, h, normal) {
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = Math.atan2(normal[0], normal[1]); this.b.group.add(g);
    const fr = new THREE.Mesh(new THREE.BoxGeometry(w + .12, h + .12, .035), this.m.wood); fr.position.z = .012; g.add(fr);
    const refl = new Reflector(new THREE.PlaneGeometry(w, h), { textureWidth: 512, textureHeight: 512, color: 0x8f8d86, clipBias: .003 });
    refl.position.z = .031; g.add(refl);
    // patina border
    const pat = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: patinaTex(), transparent: true, depthWrite: false })); pat.position.z = .032; g.add(pat);
    const world = new THREE.Vector3(); refl.getWorldPosition(world);
    const n = new THREE.Vector3(normal[0], 0, normal[1]);
    this.mirrors.push({ id, refl, pos: world, normal: n, room: this.b.roomAt(V(x + normal[0] * .3, 0, z + normal[1] * .3)) });
    this.thing(id, fr, { pos: world, label: 'Espejo', mirror: true });
  }

  cocina() {
    const m = this.m;
    this.bulbLamp('l_cocina', 'cocina', -2.6, 2.8, 15.9, { intensity: 14, distance: 7, shade: 'bare', sw: 'sw_cocina' });
    this.switchPlate('sw_cocina', -3.35, 1.3, 13.81, [0, 1], { label: 'Interruptor', fixture: 'l_cocina' });
    // counter along the south wall with sink under the window
    const top = new THREE.MeshStandardMaterial({ color: 0x3e3b36, roughness: .35 });
    this.box(2.4, .86, .6, -2.4, 0, 17.7, m.woodPaint); this.box(2.44, .04, .62, -2.4, .86, 17.69, top);
    this.box(.5, .01, .38, -2.1, .9, 17.7, m.chrome); this.cyl(.012, .012, .3, -2.1, .9, 17.94, m.chrome, 6);
    this.collide(-3.6, -1.2, 17.38, 18); this.blob(-2.4, 17.7, 2.7, .9, .6);
    for (let i = 0; i < 4; i++) this.box(.55, .7, .01, -3.3 + i * .6, .1, 17.395, m.woodPaint);
    const drawer = new THREE.Group(); drawer.position.set(-3.3, .78, 17.39);
    const df = new THREE.Mesh(new THREE.BoxGeometry(.5, .14, .02), m.woodPaint); drawer.add(df); const dk = new THREE.Mesh(new THREE.BoxGeometry(.1, .02, .02), m.chrome); dk.position.z = -.02; drawer.add(dk);
    this.thing('cajon_cocina', drawer, { pos: V(-3.3, .78, 17.35), label: 'Cajón', drawer: true, dir: V(0, 0, -1) });
    // wall cupboard
    this.box(1.6, .6, .32, -2.8, 1.65, 17.84, m.woodPaint);
    // stove on the east wall
    this.box(.55, .85, .6, -1.5, 0, 16.0, m.enamel); this.box(.56, .02, .61, -1.5, .85, 16.0, m.iron);
    for (const [dx, dz] of [[-.12, -.14], [.12, -.14], [-.12, .14], [.12, .14]]) this.cyl(.07, .07, .015, -1.5 + dx, .87, 16.0 + dz, m.iron, 12);
    this.box(.01, .5, .45, -1.79, .15, 16.0, m.black);
    this.collide(-1.8, -1.2, 15.7, 16.3); this.blob(-1.5, 16, .8, .8, .6);
    // round-cornered fridge with its hum
    this.rbox(.68, 1.55, .66, -1.55, 0, 14.2, m.fridge, 0, .09); this.box(.03, .3, .04, -1.9, 1.0, 13.95, m.chrome);
    this.collide(-1.9, -1.2, 13.85, 14.55); this.blob(-1.55, 14.2, .95, .95, .7);
    this.things.heladera = { id: 'heladera', room: 'cocina', pos: V(-1.55, .8, 14.2) };
    // table with oilcloth, two chairs, mate and thermos
    this.box(.85, .74, .62, -3.0, 0, 15.6, m.woodLight); const oil = new THREE.MeshStandardMaterial({ map: (m.cloth.map), color: 0xb7a27c, roughness: .4 });
    this.box(.95, .01, .72, -3.0, .74, 15.6, oil);
    this.collide(-3.45, -2.55, 15.27, 15.93); this.blob(-3, 15.6, 1.2, 1, .55);
    this.chair(-3.0, 16.25, .1); this.chair(-3.6, 15.2, -1.4);
    this.lathe([[0, 0], [.04, 0], [.045, .06], [.03, .09], [0, .09]], -2.85, .75, 15.55, new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: .7 }), 12);
    this.cyl(.045, .045, .3, -3.2, .75, 15.7, new THREE.MeshStandardMaterial({ color: 0x8a1f1a, roughness: .3, metalness: .3 }), 12);
    // intercom handset and a calendar
    this.box(.09, .22, .06, -1.24, 1.35, 15.0, m.enamel);
    this.hotspot('portero_int', .15, .3, .15, -1.25, 1.45, 15.0, { label: 'Portero eléctrico' });
    this.frame(-3.99, 1.6, 14.6, .35, .5, [1, 0], calendarTex());
    this.hotspot('calendario', .1, .5, .4, -3.95, 1.6, 14.6, { label: 'Almanaque', read: 'calendario' });
  }

  distrib() {
    const m = this.m;
    this.bulbLamp('l_distrib', 'distrib', -4.9, 2.75, 16.5, { intensity: 10, distance: 5, sw: 'sw_distrib' });
    this.switchPlate('sw_distrib', -5.79, 1.3, 15.4, [1, 0], { label: 'Interruptor', fixture: 'l_distrib' });
    this.frame(-4.01, 1.6, 15.6, .3, .4, [-1, 0], photoTex('virgen'));
  }

  dormitorio() {
    const m = this.m;
    this.bulbLamp('l_dorm', 'dormitorio', -7.8, 2.6, 18, { intensity: 22, distance: 8, sw: 'sw_dorm' });
    this.switchPlate('sw_dorm', -5.81, 1.3, 16.35, [-1, 0], { label: 'Interruptor', fixture: 'l_dorm' });
    // double bed with headboard and quilt
    this.box(1.45, .3, 2.0, -7.6, .12, 20.0, m.wood); this.box(1.5, 1.05, .06, -7.6, 0, 20.97, m.wood);
    this.rbox(1.4, .2, 1.95, -7.6, .42, 20.0, new THREE.MeshStandardMaterial({ color: 0xd7d0bf, roughness: .9 }), 0, .06);
    const q = new THREE.Mesh(new RoundedBoxGeometry(1.52, .08, 1.55, 3, .04), m.quilt); q.position.set(-7.6, .64, 19.75); this.b.group.add(q); q.castShadow = q.receiveShadow = true;
    for (const dx of [-.35, .35]) this.rbox(.55, .14, .35, -7.6 + dx, .62, 20.68, new THREE.MeshStandardMaterial({ color: 0xe1dbc9, roughness: .9 }), 0, .06);
    for (const dx of [-.7, .7]) for (const dz of [-.95, .95]) this.box(.06, .12, .06, -7.6 + dx, 0, 20 + dz, m.wood);
    this.collide(-8.35, -6.85, 18.95, 21); this.blob(-7.6, 20, 1.9, 2.4, .6);
    // nightstands: Elena's side has a drawer and lamp
    for (const x of [-8.75, -6.45]) { this.box(.44, .58, .38, x, 0, 20.75, m.wood); this.collide(x - .22, x + .22, 20.56, 21); this.blob(x, 20.75, .6, .55, .6); }
    const nd = new THREE.Group(); nd.position.set(-8.75, .4, 20.555);
    const ndf = new THREE.Mesh(new THREE.BoxGeometry(.38, .14, .02), m.wood); nd.add(ndf); const ndk = new THREE.Mesh(new THREE.SphereGeometry(.015), m.brass); ndk.position.z = -.02; nd.add(ndk);
    this.thing('cajon_mesita', nd, { pos: V(-8.75, .4, 20.5), label: 'Cajón de la mesita', drawer: true, dir: V(0, 0, -1) });
    this.cyl(.05, .07, .25, -8.75, .58, 20.8, m.porcelain, 12);
    this.bulbLamp('l_velador', 'dormitorio', -8.75, .95, 20.8, { shade: 'cone', intensity: 4, distance: 4, sw: 'velador', on: false });
    this.hotspot('sw_velador', .3, .4, .3, -8.75, .9, 20.8, { label: 'Velador', fixture: 'l_velador' });
    // slippers by the bed (Elena left barefoot, or didn't)
    const slip = new THREE.Group(); slip.position.set(-8.55, 0, 18.8);
    for (const dx of [-.06, .07]) { const s = new THREE.Mesh(new RoundedBoxGeometry(.09, .05, .25, 2, .03), new THREE.MeshStandardMaterial({ color: 0x6b5160, roughness: 1 })); s.position.set(dx, .025, dx * .5); s.rotation.y = dx * 2; slip.add(s); }
    this.thing('pantuflas', slip, { pos: V(-8.55, .05, 18.8), label: 'Pantuflas', read: 'pantuflas' });
    // wardrobe (placard): two doors, the player can hide inside and peek through the gap
    const W = new THREE.Group(); W.position.set(-9.7, 0, 19.4); this.b.group.add(W);
    const shell = (w, h, d, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m.wood); b.position.set(x, y, z); W.add(b); return b; };
    shell(.6, .05, 1.7, 0, 2.18, 0); shell(.6, .08, 1.7, 0, .04, 0); shell(.04, 2.2, 1.7, -.28, 1.1, 0); shell(.6, 2.2, .04, 0, 1.1, -.83); shell(.6, 2.2, .04, 0, 1.1, .83);
    const crown = shell(.66, .1, 1.78, .02, 2.25, 0);
    const doorsW = [];
    for (const side of [-1, 1]) {
      const piv = new THREE.Group(); piv.position.set(.3, 0, side * .83); W.add(piv);
      const d = new THREE.Mesh(new THREE.BoxGeometry(.03, 2.05, .82), m.wood); d.position.set(0, 1.12, -side * .41); piv.add(d);
      const pan = new THREE.Mesh(new THREE.BoxGeometry(.012, 1.6, .6), m.wood); pan.position.set(.02, 1.12, -side * .41); piv.add(pan);
      const kn = new THREE.Mesh(new THREE.SphereGeometry(.018), m.brass); kn.position.set(.04, 1.1, -side * .76); piv.add(kn);
      doorsW.push({ piv, side });
    }
    // hanging clothes inside (dark shapes)
    for (let i = 0; i < 6; i++) { const c = new THREE.Mesh(new THREE.BoxGeometry(.4, 1.0, .05), new THREE.MeshStandardMaterial({ color: [0x3c3530, 0x4b3a3e, 0x2e3436][i % 3], roughness: 1 })); c.position.set(-.02, 1.5, -.6 + i * .24); c.rotation.y = Math.random() * .3; W.add(c); }
    this.thing('placard', W, { pos: V(-9.4, 1.1, 19.4), label: 'Placard', doors: doorsW, hide: 'placard' });
    this.collide(-10, -9.38, 18.55, 20.25); this.blob(-9.7, 19.4, .9, 2.0, .7);
    // cómoda with photos
    this.box(1.1, .85, .48, -7.8, 0, 15.25, m.wood); for (let i = 0; i < 3; i++) this.box(1.0, .22, .01, -7.8, .1 + i * .25, 15.495, m.wood);
    this.collide(-8.35, -7.25, 15, 15.5); this.blob(-7.8, 15.25, 1.3, .7, .6);
    this.frame(-8.1, .86, 15.2, .18, .24, [0, 1], photoTex('sobrina')).rotation.x = -.15;
    this.hotspot('foto_sobrina', .2, .3, .15, -8.1, .95, 15.25, { label: 'Foto', read: 'foto_sobrina' });
    this.chair(-6.3, 18.3, -2.2);
    for (const [z0, z1] of [[15.6, 17.0]]) for (const s of [0, 1]) this.curtain(-9.93, s ? z1 - .25 : z0 + .25, .55);
    this.frame(-7.6, 2.0, 20.95, .35, .45, [0, -1], photoTex('virgen'));
  }

  bano() {
    const m = this.m;
    this.bulbLamp('l_bano', 'bano', -3.35, 2.05, 18.65, { intensity: 7, distance: 5, shade: 'bare', sw: 'sw_bano' });
    this.switchPlate('sw_bano', -4.6, 1.3, 18.01, [0, 1], { label: 'Interruptor', fixture: 'l_bano' });
    // bathtub with curtain (hiding place)
    this.rbox(1.58, .55, .72, -5.0, 0, 20.24, m.porcelain, 0, .08); this.box(1.45, .03, .55, -5.0, .53, 20.24, new THREE.MeshStandardMaterial({ color: 0xb9b6aa, roughness: .1 }));
    this.cyl(.012, .012, .25, -5.7, .55, 20.24, m.chrome, 6);
    this.collide(-5.8, -4.2, 19.88, 20.6); this.blob(-5, 20.24, 1.8, .9, .6);
    this.box(1.6, .02, .02, -5.0, 2.0, 19.86, m.chrome);
    const cg = new THREE.PlaneGeometry(1.5, 1.6, 20, 1); const cp = cg.attributes.position; for (let i = 0; i < cp.count; i++) cp.setZ(i, Math.sin(cp.getX(i) * 26) * .03); cg.computeVertexNormals();
    const cmat = new THREE.MeshStandardMaterial({ color: 0xb8c4bc, roughness: .6, transparent: true, opacity: .88, side: THREE.DoubleSide });
    const curtain = new THREE.Mesh(cg, cmat); curtain.position.set(-5.0, 1.2, 19.86); this.b.group.add(curtain); curtain.castShadow = true;
    this.thing('cortina', curtain, { pos: V(-5.0, 1.2, 19.86), label: 'Cortina de la bañera', hide: 'bañera' });
    // pedestal sink + medicine cabinet MIRROR
    this.lathe([[0, 0], [.08, 0], [.06, .6], [.1, .75], [0, .75]], -3.3, 0, 18.75, m.porcelain);
    this.rbox(.42, .12, .5, -3.3, .72, 18.75, m.porcelain, Math.PI / 2, .04);
    this.collide(-3.55, -3, 18.5, 19); this.blob(-3.3, 18.75, .6, .6, .5);
    this.mirror('espejo_bano', -3.012, 1.55, 18.75, .5, .65, [-1, 0]);
    const cab = new THREE.Group(); cab.position.set(-3.08, 1.98, 18.75);
    const cb = new THREE.Mesh(new THREE.BoxGeometry(.12, .16, .5), m.enamel); cab.add(cb);
    this.thing('botiquin', cab, { pos: V(-3.1, 1.98, 18.75), label: 'Repisa del botiquín', drawer: true, dir: V(-1, 0, 0) });
    // toilet + bidet
    for (const [z, h] of [[20.15, .42], [19.45, .38]]) { this.rbox(.38, h, .55, -3.32, 0, z, m.porcelain, Math.PI / 2, .1); this.collide(-3.6, -3, z - .22, z + .22); this.blob(-3.32, z, .6, .6, .5); }
    this.rbox(.45, .4, .18, -3.08, .4, 20.15, m.porcelain, Math.PI / 2, .04);
    this.things.canilla = { id: 'canilla', room: 'bano', pos: V(-3.3, .9, 18.75) };
  }
}

// ---------- canvas helpers ----------
function blobTexture() { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'); const g = x.createRadialGradient(64, 64, 10, 64, 64, 64); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(c); return t; }
function labelTex(text, font, bg, fg) { const c = document.createElement('canvas'); c.width = 512; c.height = 128; const x = c.getContext('2d'); x.fillStyle = bg; x.fillRect(0, 0, 512, 128); x.fillStyle = fg; x.font = font; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, 256, 66); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }
function noticeTex(lines) { const c = document.createElement('canvas'); c.width = 384; c.height = 512; const x = c.getContext('2d'); x.fillStyle = '#d9cfb4'; x.fillRect(0, 0, 384, 512); x.fillStyle = 'rgba(90,70,40,.25)'; x.fillRect(0, 0, 384, 512 * .1); x.fillStyle = '#2a2318'; x.font = '22px Courier New'; lines.forEach((l, i) => x.fillText(l, 26, 60 + i * 44)); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }
function clockTex() { const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d'); x.fillStyle = '#e4dcc6'; x.fillRect(0, 0, 256, 256); x.fillStyle = '#2a2016'; x.font = 'bold 26px Georgia'; x.textAlign = 'center'; x.textBaseline = 'middle'; for (let i = 1; i <= 12; i++) { const a = i / 12 * Math.PI * 2; x.fillText(['I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'][i - 1], 128 + Math.sin(a) * 96, 128 - Math.cos(a) * 96); } const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }
function calendarTex() { const c = document.createElement('canvas'); c.width = 256; c.height = 384; const x = c.getContext('2d'); x.fillStyle = '#e8e0c8'; x.fillRect(0, 0, 256, 384); x.fillStyle = '#7a1a14'; x.fillRect(0, 0, 256, 120); x.fillStyle = '#f4e9cc'; x.font = 'bold 22px Georgia'; x.fillText('Farmacia Moreno', 20, 60); x.fillStyle = '#222'; x.font = 'bold 26px Georgia'; x.fillText('OCTUBRE 1991', 30, 160); x.font = '18px Georgia'; for (let d = 1; d <= 31; d++) { const col = (d + 1) % 7, row = Math.floor((d + 1) / 7); x.fillText(d, 20 + col * 32, 200 + row * 34); if (d >= 3 && d <= 13) { x.strokeStyle = '#8a1a14'; x.lineWidth = 2; x.beginPath(); x.moveTo(16 + col * 32, 186 + row * 34); x.lineTo(42 + col * 32, 204 + row * 34); x.stroke(); } } const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }
function patinaTex() { const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d'); const g = x.createRadialGradient(128, 128, 60, 128, 128, 180); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(40,32,20,.75)'); x.fillStyle = g; x.fillRect(0, 0, 256, 256); for (let i = 0; i < 80; i++) { x.fillStyle = `rgba(30,25,15,${Math.random() * .3})`; const r = Math.random() * 8; const px = Math.random() < .5 ? Math.random() * 40 : 216 + Math.random() * 40; x.beginPath(); x.arc(px, Math.random() * 256, r, 0, 7); x.fill(); } return new THREE.CanvasTexture(c); }
export function photoTex(kind) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 320; const x = c.getContext('2d');
  const sepia = kind === 'boda' || kind === 'virgen';
  x.fillStyle = sepia ? '#8a7656' : '#5d6a66'; x.fillRect(0, 0, 256, 320);
  const g = x.createRadialGradient(128, 150, 20, 128, 160, 180); g.addColorStop(0, sepia ? '#c4ad84' : '#a5a58e'); g.addColorStop(1, sepia ? '#3d3020' : '#2c3330'); x.fillStyle = g; x.fillRect(0, 0, 256, 320);
  const fig = (cx, cy, s, col) => { x.fillStyle = col; x.beginPath(); x.ellipse(cx, cy, 18 * s, 23 * s, 0, 0, 7); x.fill(); x.beginPath(); x.moveTo(cx - 40 * s, 320); x.quadraticCurveTo(cx - 36 * s, cy + 30 * s, cx, cy + 28 * s); x.quadraticCurveTo(cx + 36 * s, cy + 30 * s, cx + 40 * s, 320); x.fill(); };
  if (kind === 'boda') { fig(95, 120, 1.3, '#2a2016'); fig(165, 130, 1.2, '#e8dcc0'); x.fillStyle = 'rgba(240,230,210,.6)'; x.beginPath(); x.moveTo(165, 95); x.lineTo(210, 320); x.lineTo(120, 320); x.fill(); }
  else if (kind === 'virgen') { x.fillStyle = '#d8c79a'; x.beginPath(); x.arc(128, 100, 50, 0, 7); x.fill(); fig(128, 110, 1.4, '#3b4f7a'); }
  else if (kind === 'sobrina') { fig(128, 130, 1.5, '#4a3a30'); x.fillStyle = 'rgba(255,240,210,.2)'; x.fillRect(0, 0, 256, 40); }
  else { x.fillStyle = '#3c4a3a'; x.beginPath(); x.moveTo(0, 220); x.quadraticCurveTo(128, 150, 256, 210); x.lineTo(256, 320); x.lineTo(0, 320); x.fill(); }
  for (let i = 0; i < 3000; i++) { x.fillStyle = `rgba(255,255,255,${Math.random() * .06})`; x.fillRect(Math.random() * 256, Math.random() * 320, 1, 1); }
  x.strokeStyle = '#efe6d0'; x.lineWidth = 10; x.strokeRect(0, 0, 256, 320);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function makeTvScreen() {
  const c = document.createElement('canvas'); c.width = 160; c.height = 120; const x = c.getContext('2d');
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshStandardMaterial({ color: 0x0a0c0c, roughness: .15, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0 });
  let mode = 'off';
  return {
    material, set(m) { mode = m; material.emissiveIntensity = m === 'off' ? 0 : 1.4; },
    get mode() { return mode; },
    draw(time) {
      if (mode === 'off') return;
      const img = x.createImageData(160, 120); const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        let v = Math.random() * 255;
        if (mode === 'program') { const yy = (i / 4 / 160) | 0; v = v * .25 + 120 + 70 * Math.sin(yy * .08 + time * 2) * Math.sin(((i / 4) % 160) * .05 + time); }
        d[i] = v * .85; d[i + 1] = v * .92; d[i + 2] = v; d[i + 3] = 255;
      }
      x.putImageData(img, 0, 0); x.fillStyle = 'rgba(0,0,0,.25)'; for (let yy = 0; yy < 120; yy += 2) x.fillRect(0, yy, 160, 1);
      t.needsUpdate = true;
    },
  };
}
