// Cuerpo procedural de Elena / la imitadora. Origen en los pies, mira hacia +Z local.
// Geometría por anillos elípticos (no cápsulas), batón floreado con falda que se deforma con las piernas,
// cabeza esculpida por desplazamiento, manos con dedos. Animación procedural por canales con suavizado.
import * as THREE from 'three';

const TAU = Math.PI * 2;
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (cur, tgt, rate, dt) => cur + (tgt - cur) * (1 - Math.exp(-rate * dt));
const angWrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// ------------------------------------------------------------------ geometría
/**
 * Superficie por anillos: rings = [{ y, rx, rz, cx=0, cz=0 }] de abajo hacia arriba (o al revés).
 * fn(x,y,z,u,v) opcional -> [x,y,z] para esculpir. Devuelve BufferGeometry con UV (u alrededor, v a lo largo).
 */
function ringGeo(rings, segs = 20, { capTop = false, capBottom = false, fn = null } = {}) {
  const pos = [], uv = [], idx = [];
  const n = rings.length;
  let total = 0; const acc = [0];
  for (let i = 1; i < n; i++) { total += Math.hypot(rings[i].y - rings[i - 1].y, rings[i].rx - rings[i - 1].rx); acc.push(total); }
  for (let i = 0; i < n; i++) {
    const r = rings[i];
    for (let j = 0; j <= segs; j++) {
      const u = j / segs, a = u * TAU;
      // a=0 -> frente (+Z)
      let x = (r.cx ?? 0) + Math.sin(a) * r.rx, y = r.y, z = (r.cz ?? 0) + Math.cos(a) * r.rz;
      if (fn) [x, y, z] = fn(x, y, z, u, acc[i] / (total || 1), a);
      pos.push(x, y, z); uv.push(u, acc[i]);
    }
  }
  const P = (k) => [pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]];
  // triángulo con la normal apuntando hacia `out` (vector de referencia)
  const tri = (a, b, c, out) => {
    const A = P(a), B = P(b), Cc = P(c);
    const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], vx = Cc[0] - A[0], vy = Cc[1] - A[1], vz = Cc[2] - A[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (nx * out[0] + ny * out[1] + nz * out[2] >= 0) idx.push(a, b, c); else idx.push(a, c, b);
  };
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < segs; j++) {
    const a = i * (segs + 1) + j, b = a + segs + 1;
    const ang = ((j + 0.5) / segs) * TAU, out = [Math.sin(ang), 0, Math.cos(ang)];
    tri(a, a + 1, b, out); tri(b, a + 1, b + 1, out);
  }
  const cap = (ri, up) => {
    const r = rings[ri], c = pos.length / 3;
    pos.push(r.cx ?? 0, r.y, r.cz ?? 0); uv.push(0.5, acc[ri]);
    for (let j = 0; j < segs; j++) { const a = ri * (segs + 1) + j; tri(c, a, a + 1, [0, up ? 1 : -1, 0]); }
  };
  const asc = rings[n - 1].y > rings[0].y;
  if (capTop) cap(asc ? n - 1 : 0, true);
  if (capBottom) cap(asc ? 0 : n - 1, false);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Extremidad: anillos a lo largo de -Y desde el origen (articulación) hasta -len.
function limbGeo(len, radii, segs = 12, zscale = 1) {
  const rings = radii.map(([t, r, rz]) => ({ y: -t * len, rx: r, rz: (rz ?? r) * zscale }));
  return ringGeo(rings, segs, { capTop: true, capBottom: true });
}

function gauss(dx, dy, dz, w) { return Math.exp(-(dx * dx + dy * dy + dz * dz) / (w * w)); }

// ------------------------------------------------------------------ texturas
function fabricTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#5a6663'; g.fillRect(0, 0, 256, 256);
  // trama del tejido
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,250,230' : '20,25,20'},0.03)`; g.beginPath(); g.arc(Math.random() * 256, Math.random() * 256, 10 + Math.random() * 30, 0, TAU); g.fill(); }
  const flower = (x, y, s, col, rot) => {
    g.save(); g.translate(x, y); g.rotate(rot);
    g.fillStyle = '#4f5a3f';
    for (const k of [-1, 1]) { g.beginPath(); g.ellipse(k * s * 1.2, s * 0.9, s * 0.9, s * 0.35, k * 0.7, 0, TAU); g.fill(); }
    g.fillStyle = col;
    for (let p = 0; p < 5; p++) { const a = p * TAU / 5; g.beginPath(); g.ellipse(Math.cos(a) * s * 0.6, Math.sin(a) * s * 0.6, s * 0.55, s * 0.38, a, 0, TAU); g.fill(); }
    g.fillStyle = '#b39a63'; g.beginPath(); g.arc(0, 0, s * 0.28, 0, TAU); g.fill();
    g.restore();
  };
  const cols = ['#8e6a64', '#a88f84', '#b5aa92', '#7f5f62'];
  // patrón repetible: dibuja también envuelto en los bordes
  for (let i = 0; i < 26; i++) {
    const x = Math.random() * 256, y = Math.random() * 256, s = 5 + Math.random() * 6, col = cols[(Math.random() * cols.length) | 0], r = Math.random() * TAU;
    for (const dx of [-256, 0, 256]) for (const dy of [-256, 0, 256]) flower(x + dx, y + dy, s, col, r);
  }
  // desgaste: lavado muchas veces
  g.fillStyle = 'rgba(190,185,165,0.12)'; g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
function hairTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#8f8b84'; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 900; i++) {
    const v = 120 + Math.random() * 70 | 0; g.strokeStyle = `rgba(${v},${v - 3},${v - 8},0.18)`;
    const x = Math.random() * 128; g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + 6, 40, x - 6, 90, x + 3, 128); g.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ------------------------------------------------------------------ cuerpo
export function createEntityBody({ guise = 'elena' } = {}) {
  const fabTex = fabricTexture();
  const M = {
    fabric: new THREE.MeshStandardMaterial({ map: fabTex, roughness: 0.88, metalness: 0 }),
    collar: new THREE.MeshStandardMaterial({ color: 0xa79f8b, roughness: 0.85 }),
    skin: new THREE.MeshStandardMaterial({ color: 0xc8ae9b, roughness: 0.6, vertexColors: true }),
    hand: new THREE.MeshStandardMaterial({ color: 0xc2a491, roughness: 0.6 }),
    stocking: new THREE.MeshStandardMaterial({ color: 0x8f7766, roughness: 0.5 }),
    slipper: new THREE.MeshStandardMaterial({ color: 0x4a2c2a, roughness: 1 }),
    sole: new THREE.MeshStandardMaterial({ color: 0x2a2422, roughness: 0.9 }),
    hair: new THREE.MeshStandardMaterial({ map: hairTexture(), color: 0xd6d4d0, roughness: 0.92 }),
    eye: new THREE.MeshStandardMaterial({ color: 0x241c18, roughness: 0.15 }),
    button: new THREE.MeshStandardMaterial({ color: 0xd8d0be, roughness: 0.35 }),
  };
  const skinBase = M.skin.color.clone(), handBase = M.hand.color.clone();
  const grey = new THREE.Color(0xa9a39c);

  const root = new THREE.Group(); root.name = 'EntityBody';
  const J = {};
  const grp = (name, parent, x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.name = name; g.position.set(x, y, z); parent.add(g); J[name] = g; return g; };
  const mesh = (geo, mat, parent, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };

  const HIP_Y = 0.84, THIGH = 0.4, SHIN = 0.38, ANKLE = 0.06;
  const hips = grp('hips', root, 0, HIP_Y, 0);

  // ---------- falda (deformable) en espacio de cadera
  const skirtRings = [];
  const SK_TOP = 0.15, SK_BOT = -0.5;
  for (let i = 0; i <= 12; i++) {
    const t = i / 12, y = lerp(SK_TOP, SK_BOT, t);
    const r = t < 0.25 ? lerp(0.128, 0.172, t / 0.25) : lerp(0.172, 0.205, (t - 0.25) / 0.75);
    skirtRings.push({ y, rx: r * (1 + 0.04 * Math.sin(t * 9)), rz: r * 0.8, cz: 0.012 - 0.01 * t });
  }
  const skirtGeo = ringGeo(skirtRings, 36, {
    fn: (x, y, z, u, v, a) => {
      // pliegues que caen: ondulación que crece hacia el ruedo
      const t = clamp((SK_TOP - y) / (SK_TOP - SK_BOT), 0, 1);
      const fold = 1 + 0.035 * t * Math.sin(a * 9 + 0.6) + 0.02 * t * Math.sin(a * 5 + 2);
      // panza baja de señora mayor
      const belly = 0.018 * gauss(x / 0.15, (y - 0.03) / 0.12, 0, 1) * (z > 0 ? 1 : 0);
      return [x * fold, y, z * fold + belly];
    },
  });
  skirtGeo.attributes.uv.array.forEach((_, i, arr) => { if (i % 2 === 0) arr[i] *= 3; else arr[i] *= 2.4; });
  const skirt = mesh(skirtGeo, M.fabric, hips);
  // sólo la falda es doble cara (se ve el interior del ruedo desde abajo); sombras sólo de la cara frontal
  skirt.material = M.fabric.clone(); skirt.material.side = THREE.DoubleSide; skirt.material.shadowSide = THREE.FrontSide;
  const skirtBase = skirtGeo.attributes.position.array.slice();

  // ---------- piernas
  const legs = [];
  for (const side of [1, -1]) {
    const k = side > 0 ? 'L' : 'R';
    const th = grp('thigh' + k, hips, side * 0.085, -0.02, 0);
    mesh(limbGeo(THIGH, [[0, 0.07], [0.5, 0.06], [1, 0.045]], 10, 0.95), M.stocking, th);
    const sh = grp('shin' + k, th, 0, -THIGH, 0);
    mesh(ringGeo([
      { y: 0, rx: 0.043, rz: 0.043 }, { y: -0.08, rx: 0.046, rz: 0.05, cz: -0.006 },
      { y: -0.16, rx: 0.041, rz: 0.044, cz: -0.008 }, { y: -0.3, rx: 0.029, rz: 0.03 }, { y: -SHIN, rx: 0.026, rz: 0.028 },
    ], 12, { capTop: true, capBottom: true }), M.stocking, sh);
    const ft = grp('foot' + k, sh, 0, -SHIN, 0);
    // pantufla: cuerpo redondeado + suela + ribete
    const sl = mesh(ringGeo([
      { y: -0.06, rx: 0.045, rz: 0.13, cz: 0.045 }, { y: -0.035, rx: 0.048, rz: 0.135, cz: 0.047 },
      { y: -0.01, rx: 0.04, rz: 0.11, cz: 0.05 }, { y: 0.01, rx: 0.02, rz: 0.06, cz: 0.07 },
    ], 18, { capTop: true }), M.slipper, ft);
    sl.rotation.y = side * 0.08;
    const sole = mesh(ringGeo([{ y: -ANKLE - 0.005, rx: 0.047, rz: 0.134, cz: 0.045 }, { y: -ANKLE + 0.012, rx: 0.049, rz: 0.137, cz: 0.046 }], 18, { capBottom: true, capTop: true }), M.sole, ft);
    sole.rotation.y = side * 0.08;
    legs.push({ side, th, sh, ft });
  }

  // ---------- torso
  const spine = grp('spine', hips, 0, 0.14, 0);
  const chest = grp('chest', spine, 0, 0.16, 0);
  const torsoGeo = ringGeo([
    { y: -0.17, rx: 0.13, rz: 0.1 }, { y: -0.08, rx: 0.132, rz: 0.1 }, { y: 0.0, rx: 0.142, rz: 0.106 },
    { y: 0.07, rx: 0.15, rz: 0.11 }, { y: 0.13, rx: 0.158, rz: 0.1, cz: -0.008 }, { y: 0.17, rx: 0.158, rz: 0.088, cz: -0.015 },
    { y: 0.195, rx: 0.14, rz: 0.075, cz: -0.016 }, { y: 0.225, rx: 0.095, rz: 0.062, cz: -0.012 }, { y: 0.245, rx: 0.058, rz: 0.05, cz: -0.006 },
  ], 32, {
    fn: (x, y, z) => {
      // busto caído, omóplatos y joroba leve (cifosis)
      const bust = z > 0 ? 0.03 * gauss(Math.abs(x) - 0.06, y + 0.015, 0, 0.065) : 0;
      const hump = z < 0 ? -0.022 * gauss(x * 0.6, y - 0.12, 0, 0.09) : 0;
      return [x, y, z + bust + hump];
    },
  });
  torsoGeo.attributes.uv.array.forEach((_, i, arr) => { if (i % 2 === 0) arr[i] *= 3; else arr[i] *= 2.4; });
  mesh(torsoGeo, M.fabric, chest);
  // cinturón de tela anudado (tapa la unión torso/falda)
  const belt = mesh(new THREE.TorusGeometry(0.135, 0.014, 6, 32), M.fabric, spine, 0, 0.0, 0.004);
  belt.rotation.x = Math.PI / 2; belt.scale.set(1, 0.79, 1);
  for (const s of [-1, 1]) { const tie = mesh(new THREE.BoxGeometry(0.03, 0.16, 0.006), M.fabric, spine, 0.03 * s, -0.08, 0.112); tie.rotation.z = s * 0.15; }
  // cuello del batón y botones
  const collar = mesh(new THREE.TorusGeometry(0.062, 0.014, 6, 24, Math.PI * 1.6), M.collar, chest, 0, 0.235, -0.004);
  collar.rotation.x = Math.PI / 2 - 0.25; collar.rotation.z = Math.PI * 0.7; collar.scale.set(1.25, 1, 1);
  {
    const rc = new THREE.Raycaster(), probe = new THREE.Mesh(torsoGeo);
    for (let i = 0; i < 4; i++) {
      const y = 0.17 - i * 0.07;
      rc.set(new THREE.Vector3(0, y, 0.5), new THREE.Vector3(0, 0, -1));
      const hit = rc.intersectObject(probe)[0];
      const b = mesh(new THREE.CylinderGeometry(0.0065, 0.0065, 0.004, 10).rotateX(Math.PI / 2), M.button, chest, 0, y, (hit ? hit.point.z : 0.1) + 0.001);
      if (hit) b.lookAt(b.position.clone().add(hit.face.normal));
    }
  }

  // ---------- cuello y cabeza
  const neck = grp('neck', chest, 0, 0.225, 0.0);
  mesh(ringGeo([{ y: -0.01, rx: 0.058, rz: 0.052 }, { y: 0.04, rx: 0.05, rz: 0.048, cz: 0.006 }, { y: 0.09, rx: 0.047, rz: 0.046, cz: 0.012 }], 14, {}), M.skin, neck);
  const head = grp('head', neck, 0, 0.065, 0.022);
  const headGeo = new THREE.SphereGeometry(1, 48, 36);
  {
    const p = headGeo.attributes.position, col = [];
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i); // unidad: x lado, y arriba, z frente
      let { x, y, z } = v;
      let sx = 0.077, sy = 0.1, sz = 0.093;
      if (y < -0.25) { const t = (-y - 0.25) / 0.75; sx *= 1 - 0.32 * t; sz *= 1 - 0.08 * t; } // mandíbula angosta
      let r = 1;
      for (const s of [-1, 1]) {
        r -= 0.1 * gauss(x - s * 0.36, y - 0.1, z - 0.9, 0.19);           // cuencas
        r += 0.05 * gauss(x - s * 0.35, y - 0.3, z - 0.88, 0.2);          // arco superciliar
        r += 0.05 * gauss(x - s * 0.62, y + 0.1, z - 0.72, 0.22);         // pómulos
        r -= 0.035 * gauss(x - s * 0.58, y + 0.42, z - 0.64, 0.22);       // mejillas hundidas
        r -= 0.05 * gauss(x - s * 0.8, y - 0.45, z - 0.3, 0.3);           // sienes
      }
      r += 0.26 * gauss(x * 4.2, (y + 0.1) * 0.8, z - 1, 0.2) * (z > 0 ? 1 : 0); // nariz
      r += 0.035 * gauss(x * 1.6, y + 0.3, z - 0.96, 0.12);                // punta/aletas
      r -= 0.05 * gauss(x * 0.55, y + 0.47, z - 0.88, 0.13);               // boca (línea)
      r += 0.03 * gauss(x * 0.6, y + 0.38, z - 0.92, 0.1);                 // labio superior
      r += 0.05 * gauss(x * 0.8, y + 0.78, z - 0.6, 0.2);                  // mentón
      r -= 0.04 * gauss(x * 0.8, y + 0.62, z - 0.75, 0.15);                // surco mentolabial
      p.setXYZ(i, x * sx * r, y * sy * r, z * sz * r);
      // color: ojeras oscuras, nariz y mejillas algo rojizas, labios apagados
      let cr = 1, cg = 1, cb = 1;
      const eyeD = Math.min(gauss(x - 0.36, y - 0.06, z - 0.9, 0.22), 1) + gauss(x + 0.36, y - 0.06, z - 0.9, 0.22);
      cr -= 0.35 * eyeD; cg -= 0.4 * eyeD; cb -= 0.33 * eyeD;
      const red = gauss(x * 2, y + 0.1, z - 1, 0.25) + 0.6 * (gauss(x - 0.55, y + 0.2, z - 0.7, 0.25) + gauss(x + 0.55, y + 0.2, z - 0.7, 0.25));
      cg -= 0.08 * red; cb -= 0.1 * red;
      const lip = gauss(x * 0.7, y + 0.47, z - 0.9, 0.1);
      cr -= 0.1 * lip; cg -= 0.2 * lip; cb -= 0.12 * lip;
      col.push(cr, cg, cb);
    }
    headGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    headGeo.computeVertexNormals();
  }
  const headMesh = mesh(headGeo, M.skin, head, 0, 0.07, 0);
  // neck needs vertex colors attribute to share the skin material
  for (const m of neck.children) if (m.isMesh) { const n = m.geometry.attributes.position.count; m.geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Array(n * 3).fill(1), 3)); }
  const eyes = [];
  for (const s of [-1, 1]) {
    // ojo apoyado en la cuenca: se busca la superficie de la cara con un rayo
    const rc = new THREE.Raycaster(new THREE.Vector3(s * 0.027, 0.012, 0.3), new THREE.Vector3(0, 0, -1));
    const hit = rc.intersectObject(new THREE.Mesh(headGeo))[0];
    const ez = (hit ? hit.point.z : 0.075) - 0.0045;
    const e = mesh(new THREE.SphereGeometry(0.0098, 14, 10), M.eye, head, s * 0.027, 0.082, ez);
    eyes.push(e);
    // párpado superior caído (piel), cubre la parte de arriba del ojo
    const lid = mesh(new THREE.SphereGeometry(0.0106, 14, 8, 0, TAU, 0, Math.PI * 0.3), M.hand, head, s * 0.027, 0.082, ez);
    lid.rotation.x = 0.15;
    const ear = mesh(new THREE.SphereGeometry(1, 10, 8), M.hand, head, s * 0.077, 0.065, -0.004);
    ear.scale.set(0.01, 0.03, 0.019);
  }
  // pelo gris recogido: casquete (esfera recortada en la cara) + rodete
  {
    const hg = new THREE.SphereGeometry(1, 64, 44);
    const p = hg.attributes.position, idx = hg.index.array, keep = [];
    const vv = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      vv.fromBufferAttribute(p, i);
      const sx = 0.083, sy = 0.106, sz = 0.099;
      // raya al medio y entradas: levantar un poco la coronilla y adelgazar hacia la nuca
      let r = 1 + 0.03 * Math.max(0, vv.y) - 0.04 * gauss(vv.x * 4, vv.y - 1, vv.z, 0.5);
      // donde no hay pelo, el casquete se hunde bajo la piel: la línea de pelo queda suave
      const hl = 0.56 - 0.35 * Math.abs(vv.x);
      const faceM = clamp((hl - vv.y) / 0.12, 0, 1) * clamp((vv.z + 0.05) / 0.2, 0, 1);
      const lowM = clamp((-0.2 - vv.y) / 0.15, 0, 1) * clamp((vv.z + 0.6) / 0.2, 0, 1);
      r *= 1 - 0.2 * Math.max(faceM, lowM);
      p.setXYZ(i, vv.x * sx * r, vv.y * sy * r, vv.z * sz * r);
    }
    for (let t = 0; t < idx.length; t += 3) {
      let cx = 0, cy = 0, cz = 0;
      for (let k = 0; k < 3; k++) { vv.fromBufferAttribute(p, idx[t + k]); cx += vv.x / 3; cy += vv.y / 3; cz += vv.z / 3; }
      const ny = cy / 0.106, nz = cz / 0.099, nx = cx / 0.083;
      const face = nz > 0.2 && ny < 0.3 - 0.35 * Math.abs(nx);
      const low = ny < -0.25 && nz > -0.55;
      const ears = ny < 0.05 && Math.abs(nx) > 0.75 && nz > -0.3;
      if (!face && !low && !ears && ny > -0.7) keep.push(idx[t], idx[t + 1], idx[t + 2]);
    }
    hg.setIndex(keep); hg.computeVertexNormals();
    const hair = mesh(hg, M.hair, head, 0, 0.074, -0.004);
    M.hair.side = THREE.DoubleSide;
    const bun = mesh(new THREE.SphereGeometry(1, 20, 14), M.hair, head, 0, 0.13, -0.085);
    bun.scale.set(0.045, 0.038, 0.035);
    const wrap = mesh(new THREE.TorusGeometry(0.04, 0.012, 8, 20), M.hair, head, 0, 0.13, -0.075);
    wrap.rotation.x = 0.4;
    const pin = mesh(new THREE.CylinderGeometry(0.0015, 0.0015, 0.07, 4), M.sole, head, 0.01, 0.15, -0.08); pin.rotation.z = 1.2;
    void hair;
  }

  // ---------- brazos y manos
  const arms = [];
  for (const side of [1, -1]) {
    const k = side > 0 ? 'L' : 'R';
    const shoulder = grp('shoulder' + k, chest, side * 0.135, 0.165, -0.015);
    const ua = grp('upperArm' + k, shoulder, side * 0.012, 0, 0);
    // manga 3/4 de batón: tela, más ancha abajo
    mesh(ringGeo([{ y: 0.015, rx: 0.036, rz: 0.04 }, { y: -0.04, rx: 0.047, rz: 0.05 }, { y: -0.2, rx: 0.047, rz: 0.046 }, { y: -0.27, rx: 0.05, rz: 0.048 }, { y: -0.28, rx: 0.044, rz: 0.042 }], 14, { capTop: true }), M.fabric, ua);
    mesh(limbGeo(0.27, [[0, 0.035], [1, 0.03]], 10), M.hand, ua);
    const fa = grp('foreArm' + k, ua, 0, -0.27, 0);
    mesh(ringGeo([{ y: 0, rx: 0.031, rz: 0.031 }, { y: -0.06, rx: 0.03, rz: 0.028 }, { y: -0.2, rx: 0.021, rz: 0.017 }, { y: -0.235, rx: 0.02, rz: 0.015 }], 12, { capTop: true, capBottom: true }), M.hand, fa);
    const hand = grp('hand' + k, fa, 0, -0.235, 0);
    // palma: placa redondeada, nudillos marcados
    mesh(ringGeo([{ y: 0, rx: 0.022, rz: 0.014 }, { y: -0.03, rx: 0.033, rz: 0.013 }, { y: -0.075, rx: 0.036, rz: 0.012 }, { y: -0.085, rx: 0.033, rz: 0.011 }], 12, { capTop: true, capBottom: true, fn: (x, y, z) => [x, y, z + (y < -0.07 ? 0.002 : 0)] }), M.hand, hand);
    const fingers = [];
    const FL = [0.06, 0.068, 0.064, 0.05];
    for (let f = 0; f < 4; f++) {
      const fx = side * (-0.022 + f * 0.0145);
      const f1 = grp(`f${f}a${k}`, hand, fx, -0.083, 0.002);
      const l1 = FL[f] * 0.55, l2 = FL[f] * 0.45, r = 0.0062 - f * 0.0004 * (f === 3 ? 2 : 1);
      mesh(limbGeo(l1, [[0, r * 1.05], [0.5, r * 1.1], [1, r]], 6), M.hand, f1);
      const f2 = grp(`f${f}b${k}`, f1, 0, -l1, 0);
      mesh(limbGeo(l2, [[0, r], [0.6, r * 0.9], [1, r * 0.6]], 6), M.hand, f2);
      fingers.push({ f1, f2, base: 0.4 + f * 0.08 });
    }
    const th1 = grp('thumb' + k, hand, side * -0.03, -0.02, 0.01);
    mesh(limbGeo(0.045, [[0, 0.008], [0.6, 0.007], [1, 0.005]], 6), M.hand, th1);
    th1.rotation.set(0.5, 0, side * -0.6);
    arms.push({ side, shoulder, ua, fa, hand, fingers, th1 });
  }

  // capa 0 por defecto; layer 2 para la imitadora (excluida de espejos)
  const allMeshes = []; root.traverse((o) => { if (o.isMesh) allMeshes.push(o); });

  // ------------------------------------------------------------------ estado de animación
  const S = {
    phase: 0, speed: 0, mode: 'idle', t: Math.random() * 100,
    w: guise === 'wrong' ? 0.65 : 0,
    headYaw: 0, headPitch: 0, headRoll: 0,
    frozen: 0, prevMoving: false, breath: Math.random() * TAU,
    ch: {}, sway: 0, swayV: 0, lastRootPos: new THREE.Vector3(), first: true,
    idleLook: 0, idleLookT: 2,
  };
  const ch = S.ch;
  const C = (k, tgt, rate, dt) => { ch[k] = damp(ch[k] ?? tgt, tgt, rate, dt); return ch[k]; };

  const tmpV = new THREE.Vector3(), tmpM = new THREE.Matrix4();

  function setWrongness(w) {
    S.w = clamp(w, 0, 1);
    const ww = S.w;
    J.neck.scale.y = 1 + 0.22 * ww;
    for (const a of arms) {
      a.ua.scale.y = 1 + 0.1 * ww; a.fa.scale.y = 1 + 0.14 * ww;
      for (const f of a.fingers) { f.f1.scale.y = 1 + 0.3 * ww; f.f2.scale.y = 1 + 0.35 * ww; }
    }
    M.skin.color.copy(skinBase).lerp(grey, ww * 0.45);
    M.hand.color.copy(handBase).lerp(grey, ww * 0.45);
    M.eye.roughness = lerp(0.15, 0.9, ww); // los ojos dejan de brillar
  }
  setWrongness(S.w);

  function setLayer(n) { for (const m of allMeshes) m.layers.set(n); root.layers.set(n); }

  // ------------------------------------------------------------------ update
  function update(dt, { speed = 0, mode = 'idle', lookAt = null } = {}) {
    dt = clamp(dt, 0, 0.1);
    const w = S.w;
    S.t += dt;
    S.mode = mode;
    const t = S.t;
    const still = mode === 'still';
    const run = mode === 'run';
    const stalk = mode === 'stalk';
    const crouch = mode === 'crouch';
    S.speed = damp(S.speed, speed, run ? 10 : 6, dt);
    const sp = still ? 0 : S.speed;
    const moving = sp > 0.05 && !still;

    // --- parar en medio del paso (sólo si hay algo mal)
    if (S.prevMoving && !moving && w > 0.35 && Math.random() < 0.7) S.frozen = lerp(1, 3, Math.random());
    S.prevMoving = moving;
    if (moving) S.frozen = 0;
    if (S.frozen > 0) S.frozen -= dt;
    const holdPose = S.frozen > 0 || (still && w > 0.2);

    // --- marcha
    const legLen = THIGH + SHIN;
    let step = run ? clamp(0.55 + 0.12 * sp, 0.6, 1.05) : stalk ? 0.5 : clamp(0.22 + 0.22 * sp, 0.25, 0.5);
    if (moving && !holdPose) S.phase = (S.phase + dt * TAU * sp / (2 * step)) % TAU;
    const amp = moving || holdPose ? Math.asin(clamp(step / (2 * legLen), 0, 0.9)) : 0;
    const gaitW = moving || holdPose ? 1 : 0;
    const ph = S.phase;
    const kneeLift = run ? 1.5 : stalk ? 0.75 : lerp(0.32, 0.18, w); // arrastra los pies; la imitadora casi no flexiona
    const baseKnee = crouch ? 1.5 : stalk ? 0.3 : run ? 0.25 : 0.06;
    const rate = holdPose ? 0 : run ? 30 : 16 + 10 * w;

    const legPose = [], footZ = [];
    for (const L of legs) {
      const p = L.side > 0 ? ph : ph + Math.PI;
      const swing = Math.sin(p) * amp * gaitW;
      const knee = baseKnee + kneeLift * Math.max(0, Math.cos(p)) * gaitW * (amp > 0 ? 1 : 0);
      let thx = -swing - (crouch ? 0.9 : stalk ? 0.28 : run ? 0.15 : 0);
      const k = L.side > 0 ? 'L' : 'R';
      const a = holdPose ? (ch['th' + k] ?? thx) : C('th' + k, thx, rate, dt);
      const kk = holdPose ? (ch['kn' + k] ?? knee) : C('kn' + k, knee, rate, dt);
      L.th.rotation.x = a; L.sh.rotation.x = kk;
      L.ft.rotation.x = -(a + kk) * 0.85 + (run ? 0.2 * Math.max(0, -Math.cos(p)) : 0);
      L.th.rotation.z = L.side * (crouch ? 0.18 : 0.02);
      legPose.push(THIGH * Math.cos(a) + SHIN * Math.cos(a + kk));
      footZ.push(-THIGH * Math.sin(a) - SHIN * Math.sin(a + kk));
    }
    // la cadera se ubica sobre los pies (agacharse lleva la cola hacia atrás)
    hips.position.z = holdPose ? hips.position.z : C('hipZ', -(footZ[0] + footZ[1]) / 2, 12, dt);
    // cadera: altura para que el pie de apoyo toque el piso
    let hipY = Math.max(legPose[0], legPose[1]) + ANKLE;
    if (run) hipY = THIGH * Math.cos(0.15) + SHIN * Math.cos(0.4) + ANKLE - 0.04; // torso inmóvil: no rebota
    hips.position.y = holdPose ? hips.position.y : C('hipY', hipY, run ? 40 : 20, dt);
    const waddle = run ? 0 : lerp(1, 0.15, w);
    hips.position.x = C('hipX', Math.sin(ph) * 0.018 * gaitW * waddle, 10, dt);
    hips.rotation.y = C('hipYaw', Math.sin(ph) * 0.07 * gaitW * waddle, 10, dt);
    hips.rotation.z = C('hipRoll', -Math.sin(ph) * 0.035 * gaitW * waddle, 10, dt);

    // --- torso: cifosis, inclinación por modo, respiración
    S.breath += dt * TAU * (moving ? 0.38 : 0.24);
    const breathAmp = (still ? 0.3 : 1) * (1 - 0.92 * w);
    const br = Math.sin(S.breath) * breathAmp;
    let lean = 0.12 + (stalk ? 0.32 : 0) + (crouch ? 0.75 : 0) + (run ? 0.08 : 0) + (mode === 'reach' ? 0.1 : 0);
    let side = mode === 'peek' ? 0.32 : 0;
    spine.rotation.x = C('spX', lean * 0.5 - (run ? 0 : Math.sin(ph * 2) * 0.015 * gaitW), 8, dt);
    spine.rotation.z = C('spZ', side * 0.5 - hips.rotation.z * 0.8, 6, dt);
    spine.rotation.y = C('spY', -hips.rotation.y * 0.8, 8, dt);
    chest.rotation.x = C('chX', lean * 0.5 - br * 0.015, 8, dt);
    chest.rotation.z = C('chZ', side * 0.5, 6, dt);
    chest.scale.set(1 + br * 0.008, 1, 1 + br * 0.018);

    // --- cabeza: sigue lookAt. Humana: límite ~75°, giro amortiguado. Imitadora: gira de más, rápido, y se queda clavada.
    let yawT = 0, pitchT = 0;
    if (lookAt && mode !== 'run' || (lookAt && run)) {
      // sólo la matriz de root (barato); el pecho se aproxima en espacio local
      root.updateWorldMatrix(true, false);
      tmpV.copy(lookAt); root.worldToLocal(tmpV);
      tmpV.x -= hips.position.x; tmpV.z -= hips.position.z; tmpV.y -= hips.position.y + 0.6;
      tmpV.applyAxisAngle(Y_AXIS, -hips.rotation.y - spine.rotation.y);
      yawT = Math.atan2(tmpV.x, tmpV.z);
      pitchT = -Math.atan2(tmpV.y, Math.hypot(tmpV.x, tmpV.z));
    } else if (!moving && !still) {
      S.idleLookT -= dt;
      if (S.idleLookT <= 0) { S.idleLook = (Math.random() * 2 - 1) * 0.6 * (1 - w); S.idleLookT = 2 + Math.random() * 5; }
      yawT = S.idleLook; pitchT = 0.15;
    }
    const lim = lerp(1.25, Math.PI * 0.98, w);
    yawT = clamp(angWrap(yawT), -lim, lim);
    pitchT = clamp(pitchT, -0.6, 0.7) + (stalk ? -0.25 : 0) + (crouch ? -0.4 : 0);
    const hr = still && w > 0.2 ? 0 : (w > 0.5 ? 14 : 3.2) * (mode === 'turn_head' ? 0.5 : 1);
    S.headYaw = damp(S.headYaw, yawT, hr, dt);
    S.headPitch = damp(S.headPitch, pitchT, hr, dt);
    S.headRoll = damp(S.headRoll, (!moving && w > 0.45 ? 0.32 * w : 0) + (mode === 'peek' ? 0.25 : 0), 1.5, dt);
    const trem = w * 0.012 * (Math.sin(t * 81) + Math.sin(t * 107 + 1) * 0.7 + Math.sin(t * 143 + 2) * 0.5) * (still ? 0 : 1);
    // el cuello reparte el giro: humano 35% cuello / 65% cabeza; con giro extremo, todo en la cabeza
    neck.rotation.y = S.headYaw * 0.35;
    neck.rotation.x = 0.18 + S.headPitch * 0.3 - lean * 0.6;
    head.rotation.set(-0.05 + S.headPitch * 0.7 + trem, S.headYaw * 0.65 + trem * 0.5, S.headRoll);

    // --- brazos
    for (const A of arms) {
      const k = A.side > 0 ? 'L' : 'R';
      const p = A.side > 0 ? ph : ph + Math.PI;
      const swingAmp = run ? 0 : lerp(0.18, 0, clamp(w * 1.4, 0, 1));
      let uax = Math.sin(p) * swingAmp * gaitW * (amp / 0.25) + 0.06, uaz = A.side * 0.05, fax = -0.25, uay = 0;
      let curl = 1;
      if (run) { uax = 0.2; uaz = A.side * 0.05; fax = -0.05; curl = 0.4; } // brazos colgando muertos
      if (stalk) { uax = -0.35; fax = -0.55; uaz = A.side * 0.12; }
      if (crouch) { uax = -0.6; fax = -0.4; }
      if (mode === 'reach' && A.side < 0) { uax = -1.45 - 0.1 * w; fax = -0.05; uaz = -0.05; curl = 0.15; }
      if (mode === 'reach' && A.side > 0) { uax = -0.2; fax = -0.4; }
      if (mode === 'peek' && A.side < 0) { uax = -0.4; uaz = -1.0; fax = -1.2; curl = 0.3; } // mano apoyada en el marco
      if (w > 0.5 && !moving && mode === 'idle') { uax = 0.02; fax = -0.05; curl = 0.2; } // brazos rectos al costado, demasiado quietos
      const r = holdPose ? 0 : run ? 20 : 8;
      A.ua.rotation.x = C('uax' + k, uax, r, dt) + trem * 0.5;
      A.ua.rotation.z = C('uaz' + k, uaz + (A.side < 0 ? -0.06 * w : 0), r, dt);
      A.ua.rotation.y = C('uay' + k, uay, r, dt);
      A.fa.rotation.x = C('fax' + k, fax, r, dt);
      A.shoulder.position.y = 0.165 + br * 0.006 - (A.side < 0 ? 0.025 * w : 0); // un hombro más caído
      A.hand.rotation.x = C('hx' + k, 0.1, r, dt);
      const cc = C('curl' + k, curl, 6, dt);
      A.fingers.forEach((f, i) => {
        const fz = w * 0.03 * Math.sin(t * (37 + i * 11) + i); // dedos que tiemblan / se mueven solos
        f.f1.rotation.x = -(f.base * cc) - fz; f.f2.rotation.x = -(0.55 + i * 0.08) * cc;
        f.f1.rotation.z = -A.side * (i - 1.5) * 0.03 * (mode === 'reach' ? 4 : 1);
      });
    }

    // --- falda: sigue a las rodillas y se balancea con retraso
    tmpV.copy(root.position);
    if (S.first) { S.lastRootPos.copy(tmpV); S.first = false; }
    const vel = tmpV.distanceTo(S.lastRootPos) / Math.max(dt, 1e-4);
    S.lastRootPos.copy(tmpV);
    const accel = clamp(vel - (S.prevVel ?? vel), -3, 3); S.prevVel = vel;
    S.swayV += (-S.sway * 60 - S.swayV * 7 - accel * 2.5) * dt; S.sway += S.swayV * dt;
    deformSkirt();
  }

  const skPos = skirtGeo.attributes.position;
  function deformSkirt() {
    const a = skPos.array, b = skirtBase;
    // polilínea de cada pierna (cadera -> rodilla -> tobillo) en espacio de cadera, en el plano y-z
    const poly = legs.map((L) => {
      const ta = L.th.rotation.x, ka = ta + L.sh.rotation.x, y0 = -0.02;
      const ky = y0 - THIGH * Math.cos(ta), kz = -THIGH * Math.sin(ta);
      return [y0, 0, ky, kz, ky - SHIN * Math.cos(ka), kz - SHIN * Math.sin(ka), L.side * 0.085 + L.th.rotation.z * 0.3];
    });
    const legZ = (P, y) => {
      const [y0, z0, y1, z1, y2, z2] = P;
      if (y >= y0) return z0;
      if (y >= y1 || y1 >= y0 - 1e-4 && y > y2) { const u = (y0 - y) / Math.max(1e-4, y0 - y1); return u > 1 ? z1 : lerp(z0, z1, u); }
      if (y >= y2) return lerp(z1, z2, (y1 - y) / Math.max(1e-4, y1 - y2));
      return z2;
    };
    for (let i = 0; i < a.length; i += 3) {
      const x = b[i], y = b[i + 1], z = b[i + 2];
      const t = clamp((SK_TOP - y) / (SK_TOP - SK_BOT), 0, 1);
      let dz = 0, dy = 0;
      for (const P of poly) {
        const wx = Math.exp(-((x - P[6]) ** 2) / 0.012);
        const lz = legZ(P, y);
        if (z > 0) dz = Math.max(dz, (lz + 0.075 - z) * wx);     // la tela se apoya en muslo/rodilla
        else dz = Math.min(dz, (lz - 0.07 - z) * wx);           // y atrás en la pantorrilla
      }
      dz = z > 0 ? Math.max(0, dz) : Math.min(0, dz);
      dy = Math.abs(dz) * 0.25 * t; // al estirarse sobre la rodilla, el ruedo sube
      a[i] = x; a[i + 1] = y + dy; a[i + 2] = z + dz + S.sway * 0.04 * t * t;
    }
    skPos.needsUpdate = true;
    skirtGeo.computeVertexNormals();
  }

  return {
    root, joints: J, head, setWrongness, setLayer, update,
    get wrongness() { return S.w; },
    dispose() { root.traverse((o) => { if (o.isMesh) o.geometry.dispose(); }); Object.values(M).forEach((m) => { m.map?.dispose(); m.dispose(); }); },
  };
}
