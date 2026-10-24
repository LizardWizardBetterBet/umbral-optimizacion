// Recetas de síntesis: cada sonido es una función (variante) -> Float32Array mono o [L, R].
// Se evalúan una vez por variante y el motor las cachea como AudioBuffer.
import {
  SR, len, buf, rnd, pick, clamp, white, pink, brown, biquad, resonate, addModes, impulse, mix,
  envExp, envPts, fade, normalize, scale, softclip, loopable, stickSlip, slowNoise, varispeed,
} from './dsp.js';
import { speak, breathSound, mechClick, pseudoText } from './voice.js';

// ---------- piezas ----------
const woodModes = (base = 1, t = 1) => [
  { f: 95 * base, t60: 0.16 * t, g: 0.9 }, { f: 180 * base * rnd(0.95, 1.05), t60: 0.12 * t },
  { f: 340 * base * rnd(0.95, 1.05), t60: 0.08 * t, g: 0.8 }, { f: 610 * base, t60: 0.05 * t, g: 0.5 },
  { f: 1150 * base, t60: 0.03 * t, g: 0.3 },
];
const metalModes = (base = 1, t = 1) => [
  { f: 523 * base, t60: 0.5 * t }, { f: 1290 * base, t60: 0.35 * t, g: 0.7 }, { f: 2220 * base, t60: 0.25 * t, g: 0.5 },
  { f: 3410 * base, t60: 0.18 * t, g: 0.4 }, { f: 4870 * base, t60: 0.12 * t, g: 0.3 },
];

function knockOn(modes, g = 1, decay = 0.0015, sec = 0.5, lpF = 0) {
  const x = impulse(sec, decay, g);
  if (lpF) biquad(x, 'lp', lpF);
  return resonate(x, modes);
}

// Crujido de bisagra/madera por fricción stick-slip excitando resonancias (metal de bisagra + panel de madera)
function creak(sec, velFn, { rate = [12, 160], pitch = 1, metal = 0.6, wood = 1, jitter = 0.2 } = {}) {
  const ex = stickSlip(sec, velFn, { rate, jitter, width: 0.0004 });
  const m = resonate(ex, [
    { f: 1250 * pitch, t60: 0.06, g: metal }, { f: 2140 * pitch, t60: 0.05, g: metal * 0.7 },
    { f: 3300 * pitch, t60: 0.03, g: metal * 0.4 }, { f: 760 * pitch, t60: 0.05, g: metal * 0.5 },
  ]);
  const w = resonate(ex, woodModes(1.3 * pitch, 0.7).map((q) => ({ ...q, g: (q.g ?? 1) * wood })));
  const out = new Float32Array(m.length);
  for (let i = 0; i < out.length; i++) out[i] = m[i] * 0.6 + w[i] * 0.5;
  biquad(out, 'hp', 140);
  return out;
}

function noiseBand(sec, f, q, g, env) {
  const x = pink(len(sec), g);
  biquad(x, 'bp', f, q);
  if (env) envPts(x, env);
  return x;
}

function crackle(sec, count, g = 0.3, f = 4000) {
  const x = buf(sec);
  for (let k = 0; k < count; k++) {
    const c = impulse(0.004, 0.0004, g * rnd(0.3, 1));
    mix(x, c, rnd(0, sec - 0.005));
  }
  return biquad(x, 'hp', f);
}

function bubble(f0 = 900, sec = 0.08, g = 0.3) {
  // burbuja de Minnaert: seno que sube de tono y muere
  const n = len(sec), x = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, f = f0 * (1 + t * 9);
    ph += 2 * Math.PI * f / SR;
    x[i] = Math.sin(ph) * g * Math.exp(-t * 55) * Math.min(1, i / 40);
  }
  return x;
}

const stereo = (fn) => [fn(0), fn(1)];

// ---------- pasos ----------
const SURF = {
  mosaic: { modes: () => [{ f: rnd(1050, 1350), t60: 0.035 }, { f: rnd(2100, 2500), t60: 0.025, g: 0.7 }, { f: rnd(3400, 3900), t60: 0.018, g: 0.4 }, { f: rnd(160, 200), t60: 0.05, g: 0.9 }], decay: 0.0011, grit: 0.7, lp: 9000, creak: 0 },
  ceramic: { modes: () => [{ f: rnd(1500, 1800), t60: 0.05 }, { f: rnd(2800, 3200), t60: 0.035, g: 0.7 }, { f: rnd(4500, 5100), t60: 0.025, g: 0.5 }, { f: rnd(220, 280), t60: 0.04, g: 0.7 }], decay: 0.0009, grit: 0.25, lp: 11000, creak: 0 },
  parquet: { modes: () => [{ f: rnd(260, 360), t60: 0.07 }, { f: rnd(560, 680), t60: 0.05, g: 0.7 }, { f: rnd(1050, 1250), t60: 0.03, g: 0.4 }, { f: rnd(100, 125), t60: 0.08, g: 0.9 }], decay: 0.0018, grit: 0.05, lp: 6000, creak: 0.12 },
  carpet: { modes: () => [{ f: rnd(80, 100), t60: 0.06 }, { f: rnd(190, 240), t60: 0.04, g: 0.6 }], decay: 0.006, grit: 0, lp: 900, creak: 0.03, rustle: 1 },
  wood: { modes: () => [{ f: rnd(125, 155), t60: 0.13 }, { f: rnd(240, 280), t60: 0.09, g: 0.8 }, { f: rnd(480, 560), t60: 0.05, g: 0.5 }, { f: rnd(850, 950), t60: 0.03, g: 0.3 }], decay: 0.0022, grit: 0.15, lp: 5000, creak: 0.35 },
  concrete: { modes: () => [{ f: rnd(380, 450), t60: 0.03 }, { f: rnd(850, 1000), t60: 0.02, g: 0.6 }, { f: rnd(140, 170), t60: 0.04, g: 0.9 }], decay: 0.0013, grit: 1, lp: 7000, creak: 0 },
  wet: { modes: () => [{ f: rnd(600, 800), t60: 0.03 }, { f: rnd(160, 200), t60: 0.04, g: 0.8 }], decay: 0.0016, grit: 0, lp: 6000, creak: 0, splash: 1 },
};

export function footstepSound(surface, by, hardness) {
  const S = SURF[surface] ?? SURF.mosaic;
  const sec = by === 'elena' ? 0.55 : 0.4;
  const out = buf(sec);
  const h = hardness; // 0 suave, 1 normal, 2 fuerte
  const hg = [0.45, 0.8, 1][h];

  if (by === 'player') {
    // talón + punta de zapato
    const gap = [0.095, 0.075, 0.045][h] * rnd(0.85, 1.2);
    const heel = knockOn(S.modes(), hg, S.decay * (h === 0 ? 1.8 : 1), 0.25, S.lp);
    mix(out, heel, 0.004, 1);
    const toe = knockOn(S.modes().map((m) => ({ ...m, f: m.f * 1.08 })), hg * rnd(0.35, 0.6), S.decay * 1.4, 0.2, S.lp * 0.8);
    mix(out, toe, gap, 1);
    if (S.grit) mix(out, crackle(0.12, 6 + h * 6, 0.25 * S.grit * hg, 3500), rnd(0.005, gap), 1);
    // roce de la suela
    mix(out, noiseBand(0.08 + h * 0.03, rnd(1800, 3200), 0.7, 0.05 * hg, [[0, 0], [0.01, 1], [0.08, 0]]), gap * 0.6);
  } else if (by === 'elena') {
    // pantufla: golpe blando de fieltro y arrastre largo
    const heel = knockOn(S.modes(), 0.35, 0.009, 0.25, 600);
    mix(out, heel, 0.12, 1);
    const drag = pink(len(0.38), 0.11);
    biquad(drag, 'bp', surface === 'carpet' ? 900 : 1700, 0.6);
    const tex = stickSlip(0.38, (t) => Math.sin(Math.PI * t / 0.38), { rate: [30, 120], jitter: 0.5 });
    biquad(tex, 'bp', 2200, 1);
    mix(drag, tex, 0, 0.15);
    envPts(drag, [[0, 0], [0.05, 1], [0.2, 0.7], [0.38, 0]]);
    mix(out, drag, 0, surface === 'carpet' ? 0.6 : 1);
  } else {
    // entidad: descalza, peso raro. Carne contra piso + tirón pegajoso al despegar.
    const order = Math.random() < 0.35; // a veces apoya la punta primero
    const flesh = impulse(0.2, 0.0035, hg); biquad(flesh, 'lp', 1600);
    const slap = resonate(flesh, [...S.modes().map((m) => ({ ...m, g: (m.g ?? 1) * 0.4 })), { f: rnd(650, 800), t60: 0.012, g: 0.8 }]);
    mix(out, slap, order ? 0.045 : 0.004);
    const thump = resonate(impulse(0.3, 0.006, hg * 1.3), [{ f: rnd(60, 75), t60: 0.1 }, { f: 130, t60: 0.06, g: 0.5 }]);
    mix(out, thump, order ? 0.05 : 0.006);
    // segundo apoyo demasiado cerca: algo que no es un pie
    if (Math.random() < 0.4) mix(out, slap, rnd(0.02, 0.03), 0.45);
    if (['mosaic', 'ceramic', 'parquet', 'wet'].includes(surface)) mix(out, crackle(0.08, 5, 0.12, 2800), rnd(0.1, 0.16), 1);
  }
  if (S.creak && Math.random() < S.creak * (by === 'entity' ? 1.6 : 1)) {
    const d = rnd(0.15, 0.3);
    mix(out, creak(d, (t) => Math.sin(Math.PI * t / d), { rate: [25, 140], pitch: rnd(0.4, 0.6), metal: 0.1 }), 0.03, 0.25);
  }
  if (S.rustle) mix(out, noiseBand(0.15, 2500, 0.5, 0.025, [[0, 0], [0.02, 1], [0.15, 0]]), 0.01);
  if (S.splash) {
    mix(out, noiseBand(0.2, 1300, 0.8, 0.12 * hg, [[0, 0], [0.01, 1], [0.2, 0]]), 0.006);
    for (let k = 0; k < 4 + h * 4; k++) mix(out, bubble(rnd(700, 2500), rnd(0.03, 0.07), rnd(0.03, 0.09) * hg), rnd(0.01, 0.2));
  }
  return fade(normalize(out, 0.5 * hg + 0.1), 0.001, 0.03);
}

// ---------- one-shots ----------
function doorOpen() {
  const out = buf(1.6);
  mix(out, latch(0.8), 0);
  const d = rnd(0.6, 1.1);
  const shape = rnd(0.3, 0.7);
  mix(out, creak(d, (t) => clamp(Math.sin(Math.PI * Math.pow(t / d, shape)), 0, 1) * rnd(0.6, 1), { rate: [10, rnd(120, 220)], pitch: rnd(0.85, 1.15) }), 0.18, Math.random() < 0.2 ? 0.15 : 0.5);
  // aire desplazado por la hoja
  mix(out, noiseBand(0.9, 160, 0.6, 0.35, [[0, 0], [0.3, 1], [0.9, 0]]), 0.2);
  return normalize(out, 0.55);
}
function latch(g = 1) {
  const x = buf(0.3);
  mix(x, knockOn(metalModes(rnd(2.2, 2.6), 0.15), g, 0.0006, 0.2), 0);
  mix(x, knockOn(metalModes(rnd(2.8, 3.2), 0.1), g * 0.6, 0.0006, 0.2), rnd(0.05, 0.09));
  mix(x, knockOn(woodModes(1.6, 0.5), g * 0.5, 0.001, 0.25), 0.06);
  return x;
}
function doorOpenSlow() {
  // silenciosa y larga: casi sólo la bisagra cediendo de a poco, con tramos detenidos
  const d = rnd(3.2, 4.2), out = buf(d + 0.4);
  const stops = [rnd(0.25, 0.4), rnd(0.55, 0.7)];
  const c = creak(d, (t) => {
    const u = t / d;
    let v = 0.25 + 0.35 * Math.sin(Math.PI * u);
    for (const s of stops) if (Math.abs(u - s) < 0.04) v *= 0.1;
    return v;
  }, { rate: [3, 45], pitch: rnd(0.75, 0.9), jitter: 0.45 });
  mix(out, c, 0.1, 1);
  mix(out, noiseBand(d, 140, 0.5, 0.12, [[0, 0], [d * 0.5, 1], [d, 0]]), 0.1);
  return normalize(out, 0.18);
}
function doorClose(slam = false) {
  const out = buf(slam ? 2.2 : 1.2);
  if (!slam) mix(out, creak(0.35, (t) => Math.sin(Math.PI * t / 0.35) * 0.6, { rate: [20, 120], pitch: rnd(0.9, 1.1) }), 0, 0.35);
  const at = slam ? 0.02 : 0.32;
  const g = slam ? 1 : 0.6;
  mix(out, knockOn(woodModes(rnd(0.75, 0.9), slam ? 1.6 : 1), g, slam ? 0.002 : 0.003, 1, slam ? 3500 : 2000), at);
  mix(out, latch(slam ? 1 : 0.7), at + 0.005);
  if (slam) {
    mix(out, resonate(impulse(1.5, 0.01, 0.9), [{ f: 52, t60: 0.5 }, { f: 71, t60: 0.4, g: 0.7 }]), at); // el piso tiembla
    for (let k = 0; k < 6; k++) mix(out, knockOn(woodModes(2.2, 0.3), 0.15, 0.0008, 0.2), at + 0.08 + k * rnd(0.03, 0.06)); // marco que vibra
    mix(out, knockOn([{ f: 2900, t60: 0.3 }, { f: 4100, t60: 0.25 }, { f: 5300, t60: 0.2 }], 0.06, 0.0005, 0.6), at + 0.04); // vidrio de la banderola
  }
  return normalize(out, slam ? 0.85 : 0.5);
}
function doorLocked() {
  const out = buf(0.9);
  const n = 2 + ((Math.random() * 2) | 0);
  for (let k = 0; k < n; k++) {
    const t = 0.02 + k * rnd(0.17, 0.24);
    mix(out, knockOn(metalModes(rnd(1.8, 2.3), 0.12), 0.5, 0.0007, 0.3), t);
    mix(out, knockOn(woodModes(1.1, 0.6), 0.6, 0.002, 0.3, 2500), t + 0.01);
  }
  return normalize(out, 0.5);
}
function knock(soft = false) {
  const n = soft ? 2 : 3 + ((Math.random() * 2) | 0);
  const out = buf(n * 0.32 + 0.6);
  let t = 0.01;
  const base = rnd(0.9, 1.1);
  for (let k = 0; k < n; k++) {
    const g = (soft ? 0.35 : 0.9) * rnd(0.8, 1) * (k === n - 1 && !soft ? 1.1 : 1);
    mix(out, knockOn(woodModes(base * rnd(0.97, 1.03), 0.9), g, soft ? 0.0035 : 0.0014, 0.5, soft ? 1400 : 4000), t);
    t += soft ? rnd(0.5, 0.7) : rnd(0.17, 0.24);
  }
  return normalize(out, soft ? 0.3 : 0.65);
}
function switchClick() {
  const out = buf(0.2);
  mix(out, knockOn([{ f: 3200, t60: 0.015 }, { f: 5200, t60: 0.01 }, { f: 1400, t60: 0.02 }], 0.8, 0.0003, 0.1), 0);
  mix(out, knockOn([{ f: 2500, t60: 0.012 }, { f: 900, t60: 0.03 }, { f: 250, t60: 0.04 }], 0.6, 0.0004, 0.1), rnd(0.006, 0.01));
  return normalize(out, 0.4);
}
function breaker(main = false) {
  const out = buf(main ? 1.4 : 0.6);
  mix(out, knockOn([{ f: 1800, t60: 0.03 }, { f: 3600, t60: 0.02 }, { f: 700, t60: 0.05 }], 0.8, 0.0004, 0.2), 0);
  mix(out, knockOn(metalModes(main ? 0.7 : 1.1, main ? 0.9 : 0.4), 0.7, 0.001, 0.8), 0.012); // caja de chapa
  if (main) {
    mix(out, knockOn(woodModes(0.6, 1), 0.7, 0.003, 0.5, 1500), 0.01);
    const arc = white(len(0.06), 0.4); biquad(arc, 'hp', 2500);
    for (let i = 0; i < arc.length; i++) arc[i] *= (Math.random() < 0.3 ? 1 : 0.1) * (1 - i / arc.length);
    mix(out, arc, 0.004);
  }
  return normalize(out, main ? 0.7 : 0.5);
}
function tubeHumData(sec, g = 1) {
  // tubo fluorescente: 100 Hz (red rectificada) rico en armónicos + balasto + chicharreo
  const n = len(sec), x = new Float32Array(n);
  const buzzN = slowNoise(sec, 0.15, 1);
  for (let i = 0; i < n; i++) {
    const t = i / SR, w = 2 * Math.PI * 100 * t;
    let v = 0.5 * Math.sin(w) + 0.3 * Math.sin(2 * w + 0.3) + 0.18 * Math.sin(3 * w + 1) + 0.1 * Math.sin(5 * w + 2) + 0.06 * Math.sin(7 * w);
    const s = Math.sin(w); v += 0.25 * Math.sign(s) * Math.pow(Math.abs(s), 8) * (0.6 + 0.4 * buzzN(t)); // chicharreo
    x[i] = v * g * 0.25;
  }
  biquad(x, 'hp', 80);
  const hiss = pink(n, 0.02); biquad(hiss, 'bp', 6000, 1); mix(x, hiss);
  return x;
}
function tubeStart() {
  const out = buf(2.6);
  // cebador: tics, destellos de zumbido, luego estable
  let t = 0.03;
  for (let k = 0; k < 3 + ((Math.random() * 3) | 0); k++) {
    mix(out, knockOn([{ f: 4200, t60: 0.02 }, { f: 2600, t60: 0.03 }, { f: 6800, t60: 0.01 }], 0.4, 0.0003, 0.08), t);
    const fl = tubeHumData(rnd(0.05, 0.15), 0.8); fade(fl, 0.002, 0.01);
    mix(out, fl, t + 0.01);
    t += rnd(0.18, 0.42);
  }
  mix(out, knockOn([{ f: 900, t60: 0.05 }, { f: 3100, t60: 0.02 }], 0.5, 0.0005, 0.1), t); // "pling" de encendido
  const steady = tubeHumData(2.6 - t, 0.7); envPts(steady, [[0, 0.3], [0.3, 1], [2.6 - t - 0.3, 1], [2.6 - t, 0]]);
  mix(out, steady, t);
  return normalize(out, 0.35);
}
function drawer(open) {
  const d = rnd(0.35, 0.55), out = buf(d + 0.5);
  const fr = stickSlip(d, (t) => (open ? Math.sin(Math.PI * t / d) : Math.min(1, t / d * 2)), { rate: [60, 260], jitter: 0.5 });
  mix(out, resonate(fr, woodModes(1.7, 0.6)), 0, 0.5);
  mix(out, noiseBand(d, 900, 0.6, 0.2, [[0, 0], [d * 0.3, 1], [d, 0]]), 0);
  // contenido (cubiertos, bisutería) que tintinea
  for (let k = 0; k < 5; k++) mix(out, knockOn(metalModes(rnd(3, 5), 0.15), rnd(0.05, 0.12), 0.0003, 0.2), rnd(0.02, d));
  if (!open) mix(out, knockOn(woodModes(1.2, 0.9), 0.6, 0.002, 0.4, 2500), d);
  else mix(out, knockOn(woodModes(1.4, 0.5), 0.25, 0.002, 0.3, 2000), d);
  return normalize(out, 0.4);
}
function paper() {
  const d = rnd(0.4, 0.7), out = buf(d + 0.1);
  const n = pink(len(d), 0.3); biquad(n, 'hp', 1800); biquad(n, 'peak', 4500, 1, 4);
  const env = slowNoise(d, 0.03, 1);
  for (let i = 0; i < n.length; i++) n[i] *= Math.max(0, env(i / SR)) * Math.sin(Math.PI * i / n.length);
  mix(out, n);
  mix(out, crackle(d, 25, 0.35, 2500));
  return normalize(out, 0.3);
}
function pickupSmall() {
  const out = buf(0.4);
  mix(out, knockOn(woodModes(2.5, 0.4), 0.3, 0.001, 0.2, 5000), 0);
  mix(out, noiseBand(0.15, 3000, 0.8, 0.08, [[0, 0], [0.02, 1], [0.15, 0]]), 0.03);
  mix(out, knockOn(metalModes(rnd(2.5, 4), 0.2), 0.1, 0.0004, 0.3), rnd(0.02, 0.06));
  return normalize(out, 0.3);
}
function keys() {
  const out = buf(0.9);
  const ks = [rnd(2.6, 3), rnd(3.3, 3.8), rnd(4.2, 4.8), rnd(2, 2.3)];
  for (let k = 0; k < 14; k++) {
    const t = Math.pow(Math.random(), 1.6) * 0.6;
    mix(out, knockOn(metalModes(pick(ks), 0.35), rnd(0.1, 0.4) * (1 - t), 0.0003, 0.4), t);
  }
  return normalize(out, 0.4);
}
function keyTurn() {
  const out = buf(1.1);
  const ins = stickSlip(0.25, (t) => 0.7, { rate: [200, 400], jitter: 0.6 }); biquad(ins, 'hp', 2500);
  mix(out, ins, 0, 0.3);
  for (let k = 0; k < 4; k++) mix(out, knockOn(metalModes(rnd(3, 4), 0.05), 0.2, 0.0003, 0.1), 0.05 + k * 0.045); // pernos
  mix(out, knockOn(metalModes(1.6, 0.2), 0.8, 0.0006, 0.3), 0.55); // giro
  mix(out, knockOn(woodModes(1.2, 0.6), 0.6, 0.0015, 0.4), 0.57); // pestillo
  mix(out, knockOn(metalModes(1.2, 0.25), 0.5, 0.0006, 0.3), rnd(0.75, 0.85));
  return normalize(out, 0.5);
}
function cassetteInsert() {
  const out = buf(1.5);
  mix(out, knockOn([{ f: 1500, t60: 0.03 }, { f: 2700, t60: 0.02 }, { f: 600, t60: 0.04 }], 0.5, 0.0005, 0.2), 0.0); // caja plástica
  mix(out, noiseBand(0.15, 2500, 1, 0.1, [[0, 0], [0.05, 1], [0.15, 0]]), 0.12); // desliza
  mix(out, knockOn([{ f: 1100, t60: 0.04 }, { f: 2300, t60: 0.03 }, { f: 380, t60: 0.06 }], 0.7, 0.0005, 0.2), 0.3);
  mix(out, mechClick(0.9), 0.62); // tapa
  const motor = new Float32Array(len(0.7));
  for (let i = 0; i < motor.length; i++) { const t = i / SR, f = 70 + 40 * Math.min(1, t * 5); motor[i] = 0.05 * Math.sin(2 * Math.PI * f * t) * Math.min(1, t * 8) * (1 - t / 0.7); }
  mix(out, motor, 0.75);
  return normalize(out, 0.45);
}
function tvOn() {
  const out = buf(2.2);
  // degauss: "bwomm" de 50 Hz que decae
  const dg = new Float32Array(len(1.4));
  for (let i = 0; i < dg.length; i++) { const t = i / SR, w = 2 * Math.PI * 50 * t; dg[i] = (Math.sin(w) + 0.4 * Math.sin(2 * w) + 0.2 * Math.sin(3 * w)) * Math.exp(-t * 2.6) * Math.min(1, t * 60) * 0.5; }
  mix(out, dg, 0.05);
  mix(out, knockOn([{ f: 600, t60: 0.08 }, { f: 1500, t60: 0.04 }], 0.4, 0.0005, 0.2), 0.0);
  mix(out, crackle(1.2, 30, 0.12, 3000), 0.1);
  // silbido de flyback 15625 Hz (PAL) apenas
  const wh = new Float32Array(len(2));
  for (let i = 0; i < wh.length; i++) { const t = i / SR; wh[i] = 0.012 * Math.sin(2 * Math.PI * 15625 * t) * Math.min(1, t * 2); }
  mix(out, wh, 0.2);
  return normalize(out, 0.45);
}
function tvOff() {
  const out = buf(1.2);
  mix(out, knockOn([{ f: 500, t60: 0.06 }, { f: 1700, t60: 0.03 }], 0.5, 0.0005, 0.2), 0);
  const zap = new Float32Array(len(0.15));
  for (let i = 0; i < zap.length; i++) { const t = i / SR; zap[i] = 0.3 * Math.sin(2 * Math.PI * (300 - t * 1500) * t) * (1 - t / 0.15); }
  mix(out, zap, 0.005);
  mix(out, crackle(1.0, 12, 0.15, 3500), 0.15); // estática que descarga
  return normalize(out, 0.4);
}
function floorCreak() {
  const d = rnd(0.4, 1.0), out = buf(d + 0.3);
  const sh = rnd(0.5, 2);
  mix(out, creak(d, (t) => Math.pow(Math.sin(Math.PI * t / d), sh) * rnd(0.5, 1), { rate: [8, rnd(60, 140)], pitch: rnd(0.35, 0.6), metal: 0.15, wood: 1.3 }), 0.02);
  biquad(out, 'lp', 3500);
  return normalize(out, 0.35);
}
function pipeKnock() {
  const out = buf(2.2);
  const n = 1 + ((Math.random() * 3) | 0);
  let t = 0.01;
  const base = rnd(0.35, 0.55);
  for (let k = 0; k < n; k++) {
    mix(out, knockOn(metalModes(base, 2.2), rnd(0.6, 1) / (k + 1), 0.0015, 1.6), t);
    t += rnd(0.12, 0.4);
  }
  biquad(out, 'lp', 2200); // dentro de la pared
  mix(out, noiseBand(1.5, 400, 0.5, 0.04, [[0, 0], [0.2, 1], [1.5, 0]]), 0.05); // agua que corre
  return normalize(out, 0.5);
}
function glassTap() {
  const out = buf(1.4);
  const n = 1 + ((Math.random() * 3) | 0);
  const m = [{ f: rnd(1800, 2200), t60: 0.4 }, { f: rnd(3300, 3700), t60: 0.3, g: 0.6 }, { f: rnd(5100, 5600), t60: 0.2, g: 0.4 }, { f: rnd(800, 950), t60: 0.15, g: 0.4 }];
  for (let k = 0; k < n; k++) mix(out, knockOn(m, 0.35, 0.0004, 0.6), 0.01 + k * rnd(0.25, 0.4));
  return normalize(out, 0.35);
}
function wardrobe(open) {
  const out = buf(open ? 2.2 : 1.6);
  if (open) {
    const d = rnd(1, 1.5);
    mix(out, creak(d, (t) => Math.sin(Math.PI * t / d) * 0.8, { rate: [6, 110], pitch: rnd(0.6, 0.75), wood: 1.4 }), 0.05, 0.6);
  } else {
    mix(out, knockOn(woodModes(0.7, 1.3), 0.8, 0.003, 1, 2000), 0.02);
  }
  // perchas de alambre que chocan
  for (let k = 0; k < 7; k++) mix(out, knockOn(metalModes(rnd(3.5, 5), 0.5), rnd(0.04, 0.12), 0.0003, 0.6), rnd(0.1, open ? 1.2 : 0.6));
  mix(out, noiseBand(0.8, 1200, 0.5, 0.06, [[0, 0], [0.2, 1], [0.8, 0]]), 0.2); // ropa
  return normalize(out, 0.5);
}
function elevatorGate() {
  const out = buf(2.3);
  const d = 1.5;
  // reja plegable: tijeras de hierro que chocan en serie
  for (let t = 0.02; t < d; t += rnd(0.04, 0.11)) mix(out, knockOn(metalModes(rnd(0.9, 1.4), 0.4), rnd(0.15, 0.4), 0.0006, 0.5), t);
  const rl = stickSlip(d, (t) => Math.sin(Math.PI * t / d), { rate: [40, 180], jitter: 0.6 });
  mix(out, resonate(rl, metalModes(0.8, 0.3)), 0, 0.2);
  mix(out, knockOn(metalModes(0.6, 1.5), 1, 0.001, 1), d + 0.02); // traba final
  return normalize(out, 0.6);
}
function elevatorMotor() {
  const sec = 7, out = buf(sec);
  mix(out, knockOn(metalModes(0.8, 0.5), 0.6, 0.0008, 0.4), 0); // relé
  const m = new Float32Array(len(sec - 0.4));
  const wob = slowNoise(sec, 0.6, 0.02);
  for (let i = 0; i < m.length; i++) {
    const t = i / SR, u = t / (sec - 0.4);
    const ramp = Math.min(1, t * 1.4) * Math.min(1, (sec - 0.4 - t) * 1.2);
    const w = 2 * Math.PI * 50 * t;
    m[i] = ramp * (0.4 * Math.sin(w) + 0.3 * Math.sin(2 * w) + 0.08 * Math.sin(2 * Math.PI * (380 + 60 * u) * t) * (1 + wob(t)));
  }
  const cable = pink(m.length, 0.12); biquad(cable, 'bp', 700, 2); mix(m, cable);
  mix(out, m, 0.2);
  mix(out, knockOn(metalModes(0.5, 1.2), 0.8, 0.001, 0.8), sec - 0.4); // freno
  return normalize(out, 0.35);
}
function waterDrip() {
  const out = buf(0.35);
  mix(out, bubble(rnd(600, 1400), rnd(0.05, 0.1), 0.4), 0);
  mix(out, knockOn([{ f: rnd(2500, 3500), t60: 0.02 }], 0.15, 0.0003, 0.05), 0);
  return normalize(out, 0.3);
}
function chairScrape() {
  const d = rnd(0.5, 1.1), out = buf(d + 0.3);
  const fr = stickSlip(d, (t) => Math.sin(Math.PI * t / d) * rnd(0.6, 1), { rate: [30, 200], jitter: 0.4 });
  mix(out, resonate(fr, woodModes(rnd(1.4, 2), 0.6)), 0, 0.6);
  const n = noiseBand(d, 1800, 0.6, 0.15, [[0, 0], [0.05, 1], [d - 0.05, 0.8], [d, 0]]);
  mix(out, n);
  return normalize(out, 0.45);
}
function objectFall() {
  const out = buf(2.0);
  const m = woodModes(rnd(1.2, 2), 0.7);
  let t = 0.01, g = 1, gap = rnd(0.18, 0.3);
  for (let k = 0; k < 6 && g > 0.05; k++) { mix(out, knockOn(m, g, 0.001, 0.4, 5000), t); t += gap; gap *= 0.62; g *= 0.5; }
  const roll = pink(len(0.6), 0.05); biquad(roll, 'bp', 1200, 1); envPts(roll, [[0, 0], [0.1, 1], [0.6, 0]]);
  mix(out, roll, t);
  return normalize(out, 0.6);
}
function whisper() {
  const x = speak(pseudoText(3 + ((Math.random() * 3) | 0)), { whisper: true, f0: 180, rate: 0.8, breath: 1 });
  biquad(x, 'hp', 400);
  return normalize(fade(x, 0.02, 0.1), 0.35);
}
function death() {
  const out = buf(5.5);
  // inhalación brusca y cercana, golpe sordo del cuerpo, y el oído que queda zumbando
  mix(out, breathSound(0.5, 0.6, 1), 0);
  mix(out, resonate(impulse(1, 0.012, 1), [{ f: 55, t60: 0.6 }, { f: 90, t60: 0.4, g: 0.6 }, { f: 180, t60: 0.2, g: 0.3 }]), 0.45);
  const tin = new Float32Array(len(4.8));
  for (let i = 0; i < tin.length; i++) { const t = i / SR; tin[i] = 0.05 * Math.sin(2 * Math.PI * 6800 * t) * Math.min(1, t * 3) * Math.exp(-t * 0.6); }
  mix(out, tin, 0.6);
  const low = brown(len(4), 0.3); biquad(low, 'lp', 120); envPts(low, [[0, 0], [0.5, 1], [4, 0]]);
  mix(out, low, 0.5);
  return normalize(out, 0.6);
}

// ---------- loops (buffers) ----------
function rainLoop() {
  const sec = 9;
  return stereo(() => {
    const n = len(sec + 0.6);
    const x = pink(n, 0.25); biquad(x, 'hp', 500); biquad(x, 'lp', 9000);
    const body = brown(n, 0.25); biquad(body, 'lp', 400); mix(x, body);
    // gotas individuales sobre baldosa, charcos y chapa
    for (let k = 0; k < sec * 220; k++) {
      const t = rnd(0, sec + 0.5);
      if (Math.random() < 0.7) mix(x, impulse(0.006, 0.0005, rnd(0.02, 0.1)), t);
      else mix(x, bubble(rnd(900, 3200), 0.04, rnd(0.01, 0.04)), t);
    }
    return loopable(x, 0.6);
  });
}
function cityLoop() {
  const sec = 12;
  return stereo(() => {
    const n = len(sec + 1);
    const x = brown(n, 0.5); biquad(x, 'lp', 300);
    const env = slowNoise(sec + 1, 2.2, 0.5);
    for (let i = 0; i < n; i++) x[i] *= 0.6 + env(i / SR);
    const hi = pink(n, 0.03); biquad(hi, 'bp', 1200, 0.5); mix(x, hi);
    return loopable(x, 1);
  });
}
function buildingHum() {
  const sec = 8, n = len(sec + 1), x = new Float32Array(n);
  const b = slowNoise(sec + 1, 1.3, 0.25);
  for (let i = 0; i < n; i++) {
    const t = i / SR, w = 2 * Math.PI * 50 * t;
    x[i] = (0.3 * Math.sin(w) + 0.22 * Math.sin(2 * w + 0.5) * (1 + b(t)) + 0.06 * Math.sin(3 * w) + 0.03 * Math.sin(2 * Math.PI * 100.4 * t)) * 0.4;
  }
  const air = pink(n, 0.15); biquad(air, 'lp', 500); biquad(air, 'hp', 60); mix(x, air);
  return loopable(x, 1);
}
function fridgeRun() {
  const sec = 6, n = len(sec + 0.6), x = new Float32Array(n);
  const w1 = slowNoise(sec + 1, 0.7, 0.15);
  for (let i = 0; i < n; i++) {
    const t = i / SR, w = 2 * Math.PI * 49.6 * t;
    x[i] = (0.35 * Math.sin(w) + 0.4 * Math.sin(2 * w) * (1 + w1(t)) + 0.15 * Math.sin(3 * w) + 0.08 * Math.sin(4 * w + 1) + 0.05 * Math.sin(6 * w)) * 0.5;
  }
  // traqueteo de una rejilla suelta atrás
  const rat = stickSlip(sec + 0.6, (t) => 0.4 + w1(t), { rate: [90, 100], jitter: 0.05 });
  mix(x, resonate(rat, metalModes(2.2, 0.05)), 0, 0.03);
  const n2 = pink(n, 0.05); biquad(n2, 'bp', 300, 1); mix(x, n2);
  return loopable(x, 0.6);
}
function fridgeStart() {
  const out = buf(1.2);
  mix(out, knockOn(metalModes(0.9, 0.3), 0.6, 0.0008, 0.3), 0); // relé del termostato
  mix(out, resonate(impulse(0.8, 0.006, 1), [{ f: 49, t60: 0.4 }, { f: 98, t60: 0.3, g: 0.7 }, { f: 300, t60: 0.1, g: 0.3 }]), 0.04); // el motor patea
  for (let k = 0; k < 5; k++) mix(out, knockOn(woodModes(2, 0.3), 0.08, 0.0008, 0.15), 0.05 + k * 0.05); // botellas/estantes
  return normalize(out, 0.5);
}
function fridgeStop() {
  const out = buf(3);
  mix(out, resonate(impulse(0.8, 0.01, 1), [{ f: 45, t60: 0.5 }, { f: 90, t60: 0.3, g: 0.6 }]), 0); // sacudón
  mix(out, knockOn(metalModes(1.2, 0.2), 0.3, 0.0008, 0.3), 0.15);
  for (let k = 0; k < 9; k++) mix(out, bubble(rnd(300, 900), rnd(0.05, 0.12), 0.05), rnd(0.8, 2.6)); // gas que gorgotea
  return normalize(out, 0.4);
}
function clockLoop() {
  const out = buf(2);
  const tk = (f, g) => resonate(impulse(0.08, 0.0012, g), [{ f, t60: 0.035 }, { f: f * 1.62, t60: 0.025, g: 0.6 }, { f: f * 0.47, t60: 0.06, g: 0.4 }, { f: 260, t60: 0.08, g: 0.3 }]);
  mix(out, tk(2300, 0.5), 0.02);
  mix(out, tk(2050, 0.42), 1.02);
  biquad(out, 'lp', 5000);
  return normalize(out, 0.3);
}
function tubeHum() { return loopable(tubeHumData(4.5, 1), 0.5); }
function tubeFlicker() {
  const out = buf(0.8);
  for (let k = 0; k < 3; k++) {
    mix(out, knockOn([{ f: 4200, t60: 0.015 }, { f: 2500, t60: 0.02 }], 0.2, 0.0003, 0.05), k * rnd(0.06, 0.15));
  }
  return normalize(out, 0.25);
}
function tvStatic() {
  const sec = 3, n = len(sec + 0.3), x = white(n, 0.25);
  biquad(x, 'bp', 3000, 0.4);
  for (let i = 0; i < n; i++) { const t = i / SR; x[i] += 0.004 * Math.sin(2 * Math.PI * 15625 * t) + 0.04 * Math.sin(2 * Math.PI * 50 * t); }
  biquad(x, 'lp', 7000);
  return loopable(x, 0.3);
}
function tvProgram() {
  // programa nocturno: locutor, una mujer, risas grabadas, cortina musical; parlante chico
  const sec = 26, x = buf(sec + 1);
  let t = 0.3;
  while (t < sec - 2) {
    const r = Math.random();
    if (r < 0.72) {
      const male = Math.random() < 0.55;
      const a = speak(pseudoText(5 + ((Math.random() * 6) | 0)), { f0: male ? 112 : 205, rate: rnd(1.05, 1.25), breath: 0.05, formantScale: male ? 0.86 : 1 });
      normalize(a, 0.4); mix(x, a, t); t += a.length / SR + rnd(0.15, 0.5);
    } else if (r < 0.85) {
      const d = rnd(1.2, 2.2); // risas
      for (let k = 0; k < 40; k++) { const b = speak('ja', { f0: rnd(150, 300), rate: 1.8, breath: 0.4 }); normalize(b, rnd(0.05, 0.12)); mix(x, b, t + rnd(0, d)); }
      t += d + 0.3;
    } else {
      const d = rnd(1.5, 2.5); // cortina: acordes simples de órgano
      const notes = [pick([196, 220, 247]), pick([294, 330]), pick([392, 440])];
      for (let i = 0; i < len(d); i++) {
        const tt = i / SR; let v = 0;
        for (const f of notes) v += Math.sin(2 * Math.PI * f * tt) + 0.3 * Math.sin(4 * Math.PI * f * tt);
        x[Math.round(t * SR) + i] += v * 0.04 * Math.min(1, tt * 4, (d - tt) * 4);
      }
      t += d + 0.2;
    }
  }
  biquad(x, 'hp', 300); biquad(x, 'lp', 4200); biquad(x, 'peak', 1800, 1.5, 4);
  softclip(x, 1.4);
  return loopable(x, 0.8);
}
function entityBreath() {
  // respiración lenta y equivocada: inhalaciones demasiado largas, pausas largas, chasquidos húmedos
  const sec = 15, x = buf(sec + 0.6);
  let t = 0.3;
  while (t < sec - 1) {
    const inh = rnd(1.4, 2.6);
    const a = breathSound(inh, 0.22, 1); biquad(a, 'lp', 2500);
    mix(x, a, t); t += inh + rnd(0.0, 0.25);
    if (Math.random() < 0.7) { const e = breathSound(rnd(0.6, 1), 0.16, 0.5); biquad(e, 'lp', 1600); mix(x, e, t); t += 1; }
    t += rnd(0.8, 2.6);
  }
  return loopable(x, 0.5);
}
function busPass() {
  // colectivo que pasa por la calle mojada: motor diésel, neumáticos sobre agua, a veces frenos de aire
  const sec = 9, n = len(sec), x = new Float32Array(n);
  const rpm = slowNoise(sec, 1.2, 0.08);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, u = t / sec;
    const dop = 1 + 0.03 * Math.tanh((0.5 - u) * 6);
    const f = 34 * (1 + rpm(t)) * dop;
    ph += 2 * Math.PI * f / SR;
    const s = Math.sin(ph);
    x[i] = (0.5 * s + 0.3 * Math.sin(2 * ph) + 0.2 * Math.sign(s) * 0.4 + 0.12 * Math.sin(3 * ph)) * Math.pow(Math.sin(Math.PI * u), 2);
  }
  biquad(x, 'lp', 400);
  const tires = pink(n, 0.6); biquad(tires, 'bp', 1800, 0.5);
  for (let i = 0; i < n; i++) tires[i] *= Math.pow(Math.sin(Math.PI * i / n), 3);
  mix(x, tires);
  if (Math.random() < 0.4) { const air = noiseBand(0.6, 3500, 0.8, 0.4, [[0, 0], [0.02, 1], [0.6, 0]]); mix(x, air, sec * 0.55); }
  return normalize(fade(x, 0.5, 0.5), 0.5);
}
function dogFar() {
  const out = buf(3);
  const nb = 2 + ((Math.random() * 3) | 0);
  for (let k = 0; k < nb; k++) {
    const b = speak('guau', { f0: rnd(330, 420), rate: 2.2, breath: 0.3, formantScale: 0.8 });
    normalize(b, 0.5); mix(out, b, 0.05 + k * rnd(0.35, 0.6));
  }
  biquad(out, 'lp', 1500); // muy lejos
  const echo = out.slice(); mix(out, echo, 0.21, 0.3); mix(out, echo, 0.38, 0.15);
  return normalize(out, 0.4);
}
function gutter() {
  // canaleta / caño de bajada: chorro con gorgoteo
  const d = rnd(2.5, 5), out = buf(d + 0.3);
  const st = pink(len(d), 0.2); biquad(st, 'bp', 700, 0.7);
  const e = slowNoise(d, 0.25, 0.5);
  for (let i = 0; i < st.length; i++) st[i] *= (0.6 + e(i / SR)) * Math.min(1, i / SR * 2, (d - i / SR) * 2);
  mix(out, st);
  for (let k = 0; k < d * 14; k++) mix(out, bubble(rnd(250, 900), rnd(0.04, 0.1), rnd(0.02, 0.07)), rnd(0, d));
  return normalize(out, 0.35);
}
function tinDrop() {
  const out = buf(0.4);
  mix(out, knockOn(metalModes(rnd(1.6, 2.4), 0.3), 0.3, 0.0003, 0.4), 0);
  return normalize(out, 0.25);
}
function upstairs() {
  // vecino de arriba: algo pesado arrastrado o un golpe sordo, filtrado por la losa
  const out = buf(2);
  if (Math.random() < 0.5) mix(out, chairScrape(), 0.0, 0.6);
  else mix(out, knockOn(woodModes(0.6, 1.2), 0.8, 0.004, 1), 0.02);
  biquad(out, 'lp', 350); biquad(out, 'lowshelf', 120, 0.7, 4);
  return normalize(out, 0.4);
}
function breathOne() { const b = breathSound(rnd(0.9, 1.3), 0.4); biquad(b, 'lp', 3500); return normalize(b, 0.25); }

export const ONESHOTS = {
  door_open: [doorOpen, 4], door_open_slow: [doorOpenSlow, 3], door_close: [() => doorClose(false), 4],
  door_slam: [() => doorClose(true), 2], door_locked: [doorLocked, 3], knock: [() => knock(false), 3],
  knock_soft: [() => knock(true), 3], switch: [switchClick, 3], breaker: [() => breaker(false), 2],
  breaker_main: [() => breaker(true), 2], tube_start: [tubeStart, 2], drawer_open: [() => drawer(true), 3],
  drawer_close: [() => drawer(false), 3], pickup_paper: [paper, 4], pickup_small: [pickupSmall, 3],
  keys: [keys, 3], key_turn: [keyTurn, 2], cassette_insert: [cassetteInsert, 1], tv_on: [tvOn, 1],
  tv_off: [tvOff, 2], floor_creak: [floorCreak, 6], pipe_knock: [pipeKnock, 5], glass_tap: [glassTap, 3],
  breath: [breathOne, 3], wardrobe_open: [() => wardrobe(true), 2], wardrobe_close: [() => wardrobe(false), 2],
  elevator_gate: [elevatorGate, 2], elevator_motor: [elevatorMotor, 1], water_drip: [waterDrip, 6],
  chair_scrape: [chairScrape, 3], object_fall: [objectFall, 3], whisper: [whisper, 4], death: [death, 1],
  // internos (eventos de capas ambientales)
  _fridge_start: [fridgeStart, 2], _fridge_stop: [fridgeStop, 2], _bus: [busPass, 3], _dog: [dogFar, 3],
  _gutter: [gutter, 3], _tin: [tinDrop, 4], _tube_flicker: [tubeFlicker, 3], _upstairs: [upstairs, 3],
};

export const LOOPS = {
  rain: rainLoop, city: cityLoop, building_hum: buildingHum, fridge: fridgeRun, clock: clockLoop,
  tube_hum: tubeHum, tv_static: tvStatic, tv_program: tvProgram, entity_breath: entityBreath,
};

// nivel relativo de cada loop (para que el mismo gain=1 sea razonable en todos)
export const LOOP_LEVEL = {
  rain: 0.5, city: 0.35, building_hum: 0.12, fridge: 0.22, clock: 0.35, tube_hum: 0.1,
  tv_static: 0.25, tv_program: 0.4, entity_breath: 0.35, drip: 1,
};
export const ONESHOT_LEVEL = { door_open_slow: 0.7, knock_soft: 0.7, breath: 0.6, whisper: 0.7, death: 0.9, _bus: 0.5, _dog: 0.4, _upstairs: 0.6 };
export { scale };
