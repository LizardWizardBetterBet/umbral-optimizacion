// Procedural material library for the building. Canvas-generated once at boot, mapped in world metres.
import * as THREE from 'three';

let seed = 1337;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const R = (a, b) => a + (b - a) * rnd();

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }

function tex(c, repeatMetres, { srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.userData.metres = repeatMetres; // [w,h] metres covered by one tile
  return t;
}

function noise(ctx, w, h, amount, alpha = 0.06, size = 1) {
  for (let i = 0; i < amount; i++) {
    const v = rnd() < 0.5 ? 0 : 255;
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha * rnd()})`;
    ctx.fillRect(rnd() * w, rnd() * h, size * R(1, 3), size * R(1, 3));
  }
}

function blot(ctx, x, y, r, color, alpha) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color.replace('A', alpha)); g.addColorStop(1, color.replace('A', 0));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
}

// Bump from luminance of a canvas (cheap relief for peeling paint / grout).
function bumpFrom(c, invert = false) {
  const [b, bx] = canvas(c.width, c.height);
  bx.filter = 'grayscale(1) contrast(1.4)' + (invert ? ' invert(1)' : '');
  bx.drawImage(c, 0, 0);
  return tex(b, null, { srgb: false });
}

// ---------- Calcáreo: 20cm encaustic tiles, worn, border field ----------
function mosaic() {
  const S = 1024, tiles = 10; const [c, x] = canvas(S, S); const t = S / tiles;
  const ink = ['#3a312a', '#6a4a32', '#9d8f74', '#6e3a2c'];
  for (let i = 0; i < tiles; i++) for (let j = 0; j < tiles; j++) {
    const px = i * t, py = j * t;
    x.fillStyle = '#9e927a'; x.fillRect(px, py, t, t);
    x.save(); x.translate(px + t / 2, py + t / 2);
    // star/rosette pattern typical of porteño calcáreo
    x.fillStyle = ink[0];
    for (let k = 0; k < 4; k++) { x.rotate(Math.PI / 2); x.beginPath(); x.moveTo(0, -t * .5); x.lineTo(t * .14, -t * .14); x.lineTo(0, 0); x.lineTo(-t * .14, -t * .14); x.closePath(); x.fill(); }
    x.fillStyle = ink[1]; x.beginPath(); x.arc(0, 0, t * .12, 0, Math.PI * 2); x.fill();
    x.fillStyle = ink[3];
    for (let k = 0; k < 4; k++) { x.rotate(Math.PI / 2); x.beginPath(); x.arc(t * .5, t * .5, t * .2, Math.PI, Math.PI * 1.5); x.lineTo(t * .5, t * .5); x.fill(); }
    x.restore();
    // wear per tile
    x.fillStyle = `rgba(190,175,145,${R(0, .35)})`; x.fillRect(px, py, t, t);
    x.strokeStyle = 'rgba(30,25,20,.55)'; x.lineWidth = 2; x.strokeRect(px + 1, py + 1, t - 2, t - 2);
    if (rnd() < .08) { x.strokeStyle = 'rgba(20,15,10,.5)'; x.lineWidth = 1; x.beginPath(); x.moveTo(px + R(0, t), py); x.lineTo(px + R(0, t), py + t); x.stroke(); }
  }
  // traffic path wear down the middle + grime at edges
  for (let i = 0; i < 40; i++) blot(x, R(S * .3, S * .7), R(0, S), R(60, 160), 'rgba(205,195,170,A)', .10);
  for (let i = 0; i < 30; i++) blot(x, rnd() < .5 ? R(0, 80) : R(S - 80, S), R(0, S), R(40, 120), 'rgba(25,20,15,A)', .25);
  noise(x, S, S, 9000, .08);
  const map = tex(c, [2, 2]);
  return { map, bump: bumpFrom(c), roughness: .42 };
}

// ---------- Two-tone painted wall: green enamel wainscot, ivory upper, damp and peel ----------
function paintedWall(lower = '#4f6760', upper = '#b4ad9c', dado = 1.25, H = 3.1) {
  const W = 1024, Hp = Math.round(1024 * H / 4); const [c, x] = canvas(W, Hp);
  const yd = Hp - (dado / H) * Hp;
  x.fillStyle = upper; x.fillRect(0, 0, W, yd);
  x.fillStyle = lower; x.fillRect(0, yd, W, Hp - yd);
  // brush texture
  for (let i = 0; i < 2500; i++) { x.fillStyle = `rgba(255,255,255,${R(0, .025)})`; x.fillRect(R(0, W), R(0, Hp), R(1, 3), R(10, 50)); }
  // dado line
  x.fillStyle = '#2f3b36'; x.fillRect(0, yd - 6, W, 6); x.fillStyle = 'rgba(255,255,255,.08)'; x.fillRect(0, yd - 6, W, 1);
  // water damage streaks from ceiling
  for (let i = 0; i < 5; i++) {
    const sx = R(0, W), len = R(.2, .6) * Hp;
    const g = x.createLinearGradient(0, 0, 0, len);
    g.addColorStop(0, 'rgba(95,75,45,.35)'); g.addColorStop(1, 'rgba(95,75,45,0)');
    x.fillStyle = g; x.fillRect(sx, 0, R(20, 90), len);
  }
  // flaking paint: small irregular chips, mostly near the dado and corners, with a soft lit edge
  for (let i = 0; i < 70; i++) {
    const px = R(0, W), py = rnd() < .6 ? yd + R(-60, 40) : R(0, Hp), r = R(2, 9);
    x.fillStyle = `rgba(185,176,152,${R(.35, .7)})`; x.beginPath();
    for (let a = 0; a < Math.PI * 2; a += .7) x.lineTo(px + Math.cos(a) * r * R(.4, 1.4), py + Math.sin(a) * r * R(.4, 1.2));
    x.fill(); x.strokeStyle = 'rgba(30,25,18,.18)'; x.lineWidth = 1; x.stroke();
  }
  for (let i = 0; i < 4; i++) blot(x, R(0, W), R(0, Hp * .5), R(50, 140), 'rgba(120,100,60,A)', .12);
  // grime: hand-height rubbing, floor dirt
  for (let i = 0; i < 10; i++) blot(x, R(0, W), Hp * R(.55, .7), R(40, 120), 'rgba(40,35,25,A)', .12);
  const g2 = x.createLinearGradient(0, Hp * .82, 0, Hp); g2.addColorStop(0, 'rgba(20,18,12,0)'); g2.addColorStop(1, 'rgba(20,18,12,.55)');
  x.fillStyle = g2; x.fillRect(0, Hp * .82, W, Hp * .18);
  const g3 = x.createLinearGradient(0, 0, 0, Hp * .12); g3.addColorStop(0, 'rgba(30,25,18,.45)'); g3.addColorStop(1, 'rgba(30,25,18,0)');
  x.fillStyle = g3; x.fillRect(0, 0, W, Hp * .12);
  noise(x, W, Hp, 12000, .07);
  return { map: tex(c, [4, H]), bump: bumpFrom(c), roughness: .78 };
}

// ---------- Faded floral wallpaper (1B living / dormitorio) over wood wainscot ----------
function wallpaper(base = '#8c7d63', flower = '#5d3b2f', leaf = '#4c5a43', H = 3.0) {
  const W = 1024, Hp = Math.round(1024 * H / 4); const [c, x] = canvas(W, Hp);
  const yd = Hp - (0.95 / H) * Hp;
  x.fillStyle = base; x.fillRect(0, 0, W, yd);
  // vertical stripes + damask flowers
  for (let sx = 0; sx < W; sx += 64) { x.fillStyle = 'rgba(255,240,210,.05)'; x.fillRect(sx, 0, 18, yd); }
  // small damask medallions on a fine trellis, printed slightly off-register
  x.strokeStyle = 'rgba(70,50,30,.18)'; x.lineWidth = 1;
  for (let i = -20; i < 40; i++) { x.beginPath(); x.moveTo(i * 48, 0); x.lineTo(i * 48 + yd * .6, yd); x.stroke(); x.beginPath(); x.moveTo(i * 48, 0); x.lineTo(i * 48 - yd * .6, yd); x.stroke(); }
  for (let row = 0; row < 24; row++) for (let col = 0; col < 22; col++) {
    const fx = col * 48 + (row % 2) * 24, fy = row * 40 + 20; if (fy > yd - 10) continue;
    x.save(); x.translate(fx, fy);
    x.fillStyle = leaf; x.globalAlpha = .55;
    for (const s2 of [-1, 1]) { x.beginPath(); x.ellipse(s2 * 6, 3, 5, 2, s2 * .6, 0, Math.PI * 2); x.fill(); }
    x.fillStyle = flower; x.globalAlpha = .7;
    for (let k = 0; k < 4; k++) { x.rotate(Math.PI / 2); x.beginPath(); x.ellipse(0, -3.5, 2.2, 3.5, 0, 0, Math.PI * 2); x.fill(); }
    x.globalAlpha = 1; x.restore();
  }
  // sun fading + nicotine
  for (let i = 0; i < 12; i++) blot(x, R(0, W), R(0, yd), R(80, 220), 'rgba(170,150,110,A)', .16);
  for (let i = 0; i < 5; i++) { const sx = R(0, W); x.fillStyle = 'rgba(60,45,30,.12)'; x.fillRect(sx, 0, 2, yd); } // seams
  // wood wainscot
  x.fillStyle = '#3b2618'; x.fillRect(0, yd, W, Hp - yd);
  for (let i = 0; i < 400; i++) { x.strokeStyle = `rgba(${rnd() < .5 ? '20,10,5' : '90,60,35'},${R(.05, .2)})`; x.beginPath(); const y = R(yd, Hp); x.moveTo(0, y); x.bezierCurveTo(W * .3, y + R(-4, 4), W * .6, y + R(-4, 4), W, y + R(-3, 3)); x.stroke(); }
  for (let px = 0; px < W; px += 170) { x.strokeStyle = 'rgba(10,5,2,.6)'; x.lineWidth = 3; x.strokeRect(px + 14, yd + 18, 140, Hp - yd - 50); x.strokeStyle = 'rgba(140,100,60,.15)'; x.lineWidth = 1; x.strokeRect(px + 16, yd + 20, 136, Hp - yd - 54); }
  x.fillStyle = '#24160e'; x.fillRect(0, yd - 8, W, 10);
  const g2 = x.createLinearGradient(0, 0, 0, Hp * .1); g2.addColorStop(0, 'rgba(30,22,12,.5)'); g2.addColorStop(1, 'rgba(30,22,12,0)'); x.fillStyle = g2; x.fillRect(0, 0, W, Hp * .1);
  noise(x, W, Hp, 9000, .06);
  return { map: tex(c, [4, H]), bump: bumpFrom(c), roughness: .85 };
}

function tiles({ size = .15, colors = ['#d8d4c4'], grout = '#8d877a', metres = 1.5, accentRow = null, wear = .2 } = {}) {
  const S = 1024; const [c, x] = canvas(S, S); const n = Math.round(metres / size); const t = S / n;
  x.fillStyle = grout; x.fillRect(0, 0, S, S);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    let col = colors[(i + j) % colors.length];
    if (accentRow !== null && j === accentRow) col = '#2f5245';
    x.fillStyle = col; x.fillRect(i * t + 2, j * t + 2, t - 4, t - 4);
    x.fillStyle = `rgba(255,255,255,${R(0, .08)})`; x.fillRect(i * t + 3, j * t + 3, t - 6, (t - 6) * .3);
    x.fillStyle = `rgba(60,50,30,${R(0, wear)})`; x.fillRect(i * t + 2, j * t + 2, t - 4, t - 4);
    if (rnd() < .04) { x.strokeStyle = 'rgba(40,30,20,.6)'; x.beginPath(); x.moveTo(i * t + R(0, t), j * t); x.lineTo(i * t + R(0, t), j * t + t); x.stroke(); }
  }
  for (let i = 0; i < 14; i++) blot(x, R(0, S), R(0, S), R(60, 220), 'rgba(70,60,35,A)', .22);
  noise(x, S, S, 5000, .05);
  return { map: tex(c, [metres, metres]), bump: bumpFrom(c), roughness: .3 };
}

function parquet() {
  const S = 1024; const [c, x] = canvas(S, S); // 2m x 2m, 7cm x 42cm strips, herringbone-ish blocks
  const bw = S / 2 / 7 * .7 * 2, bl = bw * 6;
  for (let j = 0; j < S / bw + 1; j++) for (let i = -1; i < S / bl + 1; i++) {
    const off = (j % 2) * bl / 2; const px = i * bl + off, py = j * bw;
    const h = R(22, 34), l = R(18, 28);
    x.fillStyle = `hsl(${h},${R(35, 50)}%,${l}%)`; x.fillRect(px, py, bl, bw);
    for (let k = 0; k < 6; k++) { x.strokeStyle = `rgba(20,10,0,${R(.05, .2)})`; x.beginPath(); const yy = py + R(0, bw); x.moveTo(px, yy); x.lineTo(px + bl, yy + R(-2, 2)); x.stroke(); }
    x.strokeStyle = 'rgba(10,5,0,.7)'; x.lineWidth = 1.5; x.strokeRect(px, py, bl, bw);
  }
  for (let i = 0; i < 25; i++) blot(x, R(0, S), R(0, S), R(60, 180), 'rgba(15,8,2,A)', .2);
  for (let i = 0; i < 10; i++) blot(x, R(0, S), R(0, S), R(40, 140), 'rgba(160,120,70,A)', .08);
  noise(x, S, S, 6000, .06);
  return { map: tex(c, [2, 2]), bump: bumpFrom(c), roughness: .5 };
}

function rug() {
  const W = 1024, H = 1400; const [c, x] = canvas(W, H);
  x.fillStyle = '#5b211c'; x.fillRect(0, 0, W, H);
  x.strokeStyle = '#2b1a17'; x.lineWidth = 40; x.strokeRect(40, 40, W - 80, H - 80);
  x.strokeStyle = '#a0784a'; x.lineWidth = 8; x.strokeRect(80, 80, W - 160, H - 160);
  x.fillStyle = '#1e2a33'; x.beginPath(); x.ellipse(W / 2, H / 2, 260, 380, 0, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#8a5d38';
  for (let k = 0; k < 16; k++) { x.save(); x.translate(W / 2, H / 2); x.rotate(k * Math.PI / 8); x.beginPath(); x.ellipse(0, 200, 30, 90, 0, 0, Math.PI * 2); x.fill(); x.restore(); }
  for (let i = 0; i < 300; i++) { x.fillStyle = `rgba(${rnd() < .5 ? '160,110,60' : '20,30,40'},${R(.1, .4)})`; const px = R(120, W - 120), py = R(120, H - 120); x.fillRect(px, py, 18, 18); }
  for (let i = 0; i < 20; i++) blot(x, R(0, W), R(0, H), R(80, 240), 'rgba(190,160,120,A)', .12);
  noise(x, W, H, 30000, .12, 1);
  return { map: tex(c, [2, 2.8]), roughness: 1 };
}

function concrete() {
  const S = 1024; const [c, x] = canvas(S, S);
  x.fillStyle = '#6b6a63'; x.fillRect(0, 0, S, S);
  for (let i = 0; i < 60; i++) blot(x, R(0, S), R(0, S), R(40, 220), rnd() < .5 ? 'rgba(40,40,35,A)' : 'rgba(140,138,125,A)', R(.1, .3));
  for (let i = 0; i < 12; i++) { x.strokeStyle = 'rgba(30,30,28,.5)'; x.lineWidth = R(.5, 2); x.beginPath(); let px = R(0, S), py = R(0, S); x.moveTo(px, py); for (let k = 0; k < 8; k++) { px += R(-40, 40); py += R(-40, 40); x.lineTo(px, py); } x.stroke(); }
  noise(x, S, S, 30000, .1);
  return { map: tex(c, [3, 3]), bump: bumpFrom(c), roughness: .92 };
}

function ceiling() {
  const S = 512; const [c, x] = canvas(S, S);
  x.fillStyle = '#a9a495'; x.fillRect(0, 0, S, S);
  for (let i = 0; i < 18; i++) blot(x, R(0, S), R(0, S), R(30, 140), 'rgba(110,90,55,A)', R(.08, .25));
  for (let i = 0; i < 6; i++) { x.strokeStyle = 'rgba(50,40,30,.4)'; x.beginPath(); let px = R(0, S), py = R(0, S); x.moveTo(px, py); for (let k = 0; k < 10; k++) { px += R(-25, 25); py += R(-25, 25); x.lineTo(px, py); } x.stroke(); }
  noise(x, S, S, 8000, .06);
  return { map: tex(c, [3, 3]), roughness: .95 };
}

function woodGrain(base = [24, 45, 18]) { // varnished dark wood for doors/furniture
  const W = 512, H = 1024; const [c, x] = canvas(W, H);
  x.fillStyle = `hsl(${base[0]},${base[1]}%,${base[2]}%)`; x.fillRect(0, 0, W, H);
  for (let i = 0; i < 600; i++) {
    x.strokeStyle = `rgba(${rnd() < .6 ? '12,6,2' : '120,80,45'},${R(.04, .18)})`; x.lineWidth = R(.5, 2.5);
    const px = R(0, W); x.beginPath(); x.moveTo(px, 0);
    x.bezierCurveTo(px + R(-20, 20), H * .3, px + R(-20, 20), H * .7, px + R(-10, 10), H); x.stroke();
  }
  for (let i = 0; i < 6; i++) { const px = R(0, W), py = R(0, H); x.strokeStyle = 'rgba(10,5,0,.25)'; for (let r = 4; r < 40; r += 5) { x.beginPath(); x.ellipse(px, py, r * .5, r * 1.8, 0, 0, Math.PI * 2); x.stroke(); } }
  for (let i = 0; i < 8; i++) blot(x, R(0, W), R(0, H), R(40, 140), 'rgba(160,120,70,A)', .06);
  noise(x, W, H, 4000, .05);
  return { map: tex(c, [.6, 1.2]), roughness: .38 };
}

function fabric(base, pattern, metres = .6, kind = 'floral') {
  const S = 512; const [c, x] = canvas(S, S); x.fillStyle = base; x.fillRect(0, 0, S, S);
  if (kind === 'floral') for (let i = 0; i < 70; i++) { x.fillStyle = pattern[i % pattern.length]; const px = R(0, S), py = R(0, S); for (let k = 0; k < 5; k++) { x.beginPath(); x.ellipse(px + Math.cos(k * 1.26) * 7, py + Math.sin(k * 1.26) * 7, 6, 4, k * 1.26, 0, Math.PI * 2); x.fill(); } }
  if (kind === 'check') for (let i = 0; i < S; i += 32) { x.fillStyle = pattern[0]; x.fillRect(i, 0, 12, S); x.fillRect(0, i, S, 12); }
  if (kind === 'lace') { x.strokeStyle = pattern[0]; for (let i = 0; i < S; i += 32) for (let j = 0; j < S; j += 32) { x.beginPath(); x.arc(i + 16, j + 16, 10, 0, Math.PI * 2); x.stroke(); x.beginPath(); x.arc(i + 16, j + 16, 3, 0, Math.PI * 2); x.stroke(); } }
  noise(x, S, S, 15000, .08);
  return { map: tex(c, [metres, metres]), roughness: .95 };
}

function facade() { // símil piedra render with buñas (horizontal joints), rain streaks and soot
  const W = 1024, H = 1024; const [c, x] = canvas(W, H);
  x.fillStyle = '#6f6a5f'; x.fillRect(0, 0, W, H);
  for (let i = 0; i < 60; i++) blot(x, R(0, W), R(0, H), R(30, 160), rnd() < .5 ? 'rgba(50,48,42,A)' : 'rgba(140,134,118,A)', R(.08, .22));
  for (let y = 0; y < H; y += 128) { x.fillStyle = 'rgba(25,24,20,.45)'; x.fillRect(0, y, W, 3); x.fillStyle = 'rgba(170,165,150,.14)'; x.fillRect(0, y + 3, W, 2); }
  for (let i = 0; i < 26; i++) { const sx = R(0, W), len = R(.2, .9) * H; const g = x.createLinearGradient(0, 0, 0, len); g.addColorStop(0, 'rgba(20,20,18,.16)'); g.addColorStop(1, 'rgba(20,20,18,0)'); x.fillStyle = g; x.fillRect(sx, R(0, H * .3), R(20, 90), len); }
  const g2 = x.createLinearGradient(0, H * .85, 0, H); g2.addColorStop(0, 'rgba(15,14,12,0)'); g2.addColorStop(1, 'rgba(15,14,12,.6)'); x.fillStyle = g2; x.fillRect(0, H * .85, W, H * .15);
  noise(x, W, H, 40000, .1);
  return { map: tex(c, [4, 4]), bump: bumpFrom(c), roughness: .9 };
}

function street() {
  const S = 1024; const [c, x] = canvas(S, S); // vereda: 40cm vainilla tiles
  x.fillStyle = '#4e4b44'; x.fillRect(0, 0, S, S);
  const n = 5, t = S / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    x.fillStyle = `hsl(40,${R(5, 12)}%,${R(28, 38)}%)`; x.fillRect(i * t + 3, j * t + 3, t - 6, t - 6);
    for (let a = 0; a < 9; a++) for (let b = 0; b < 9; b++) { x.fillStyle = 'rgba(0,0,0,.15)'; x.beginPath(); x.arc(i * t + 14 + a * (t - 28) / 8, j * t + 14 + b * (t - 28) / 8, 3, 0, Math.PI * 2); x.fill(); }
    if (rnd() < .2) { x.fillStyle = 'rgba(10,10,10,.4)'; x.fillRect(i * t + 3, j * t + 3, t - 6, t - 6); }
  }
  noise(x, S, S, 20000, .08);
  return { map: tex(c, [2, 2]), bump: bumpFrom(c), roughness: .25 };
}

export function makeMaterials() {
  const m = {};
  const std = (def, extra = {}) => {
    const mat = new THREE.MeshStandardMaterial({ map: def.map || null, roughness: def.roughness ?? .8, metalness: 0, ...extra });
    if (def.bump) { mat.bumpMap = def.bump; mat.bumpScale = extra.bumpScale ?? 1.2; }
    mat.userData.metres = def.map?.userData.metres;
    return mat;
  };
  m.mosaic = std(mosaic());
  m.wallHall = std(paintedWall());
  m.wallService = std(paintedWall('#5a6157', '#a39d8a', 1.4));
  m.wallKitchen = std(tiles({ size: .15, colors: ['#d6d1bd', '#cfcab3'], metres: 1.5, accentRow: 2 }));
  m.wallBath = std(tiles({ size: .15, colors: ['#9fb5ad', '#a8bdb4'], grout: '#6d7570', metres: 1.5 }));
  m.wallpaperLiving = std(wallpaper());
  m.wallpaperBed = std(wallpaper('#7c7562', '#6b4a52', '#55604a'));
  m.floorKitchen = std(tiles({ size: .25, colors: ['#bdb6a2', '#3c3a35'], grout: '#55524a', metres: 2, wear: .35 }));
  m.floorBath = std(tiles({ size: .1, colors: ['#d0cbbb', '#c6c1b0', '#2c4c45'], grout: '#77736a', metres: 1, wear: .25 }));
  m.parquet = std(parquet());
  m.rug = std(rug());
  m.concrete = std(concrete());
  m.ceiling = std(ceiling());
  m.street = std(street());
  m.wood = std(woodGrain());
  m.woodLight = std(woodGrain([30, 40, 30]));
  m.woodPaint = new THREE.MeshStandardMaterial({ color: 0x5b6a5f, roughness: .55 });
  m.brass = new THREE.MeshStandardMaterial({ color: 0xb08a4a, roughness: .35, metalness: .9 });
  m.iron = new THREE.MeshStandardMaterial({ color: 0x1b1d1c, roughness: .55, metalness: .7 });
  m.chrome = new THREE.MeshStandardMaterial({ color: 0xcfd2d0, roughness: .2, metalness: 1 });
  m.porcelain = new THREE.MeshStandardMaterial({ color: 0xe8e4d8, roughness: .15 });
  m.enamel = new THREE.MeshStandardMaterial({ color: 0xd9d4c1, roughness: .3 });
  m.marble = new THREE.MeshStandardMaterial({ color: 0xb8b2a6, roughness: .25 });
  m.glass = new THREE.MeshStandardMaterial({ color: 0x8fa3a3, roughness: .05, metalness: .1, transparent: true, opacity: .22, depthWrite: false });
  m.glassFrost = new THREE.MeshStandardMaterial({ color: 0xbcc6bf, roughness: .6, transparent: true, opacity: .55 });
  m.black = new THREE.MeshStandardMaterial({ color: 0x0b0b0b, roughness: .9 });
  m.cloth = std(fabric('#c9bfa7', ['#8a6b5a', '#6b7a62', '#9a5a50']), {});
  m.lace = std(fabric('#a9a08a', ['rgba(120,110,90,.6)'], .3, 'lace'));
  m.quilt = std(fabric('#6e4c46', ['#a38a6a', '#3f4c3a', '#c7b48c'], .5));
  m.sofa = std(fabric('#5c4a3a', ['#7a5a40', '#3b2e24'], .4, 'check'));
  m.curtain = std(fabric('#8f7f5f', ['#6e5a3c', '#9a8c6a'], .8));
  m.sheet = new THREE.MeshStandardMaterial({ color: 0xb3ae9f, roughness: .95, side: THREE.DoubleSide, transparent: true, opacity: .9 });
  m.plant = new THREE.MeshStandardMaterial({ color: 0x2f4a2c, roughness: .8, side: THREE.DoubleSide });
  m.terracotta = new THREE.MeshStandardMaterial({ color: 0x8a4e32, roughness: .9 });
  m.paper = new THREE.MeshStandardMaterial({ color: 0xd9d0b8, roughness: .95 });
  m.plastic = new THREE.MeshStandardMaterial({ color: 0x2a2826, roughness: .5 });
  m.fridge = new THREE.MeshStandardMaterial({ color: 0xd8d0b8, roughness: .35 });
  m.facade = std(facade());
  return m;
}

// Apply world-metre UVs to a box-like geometry after scaling: helper for planes
export function planeUV(geo, w, h, mat, u0 = 0, v0 = 0) {
  const metres = mat.userData.metres || [1, 1];
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (u0 + uv.getX(i) * w) / metres[0], (v0 + uv.getY(i) * h) / metres[1]);
  uv.needsUpdate = true;
  return geo;
}
