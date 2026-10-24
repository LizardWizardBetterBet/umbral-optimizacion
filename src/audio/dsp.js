// DSP mínimo en Float32Array para generar buffers una sola vez (sin WebAudio).
// Todo lo de acá es offline: se calcula al primer uso y se cachea como AudioBuffer.

export let SR = 48000;
export function setSR(v) { SR = v; }

export const rnd = (a = 0, b = 1) => a + Math.random() * (b - a);
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const len = (sec) => Math.max(1, Math.round(sec * SR));
export const buf = (sec) => new Float32Array(len(sec));
export const dbToGain = (db) => Math.pow(10, db / 20);

export function white(n, g = 1) {
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = (Math.random() * 2 - 1) * g;
  return x;
}

export function pink(n, g = 1) {
  const x = new Float32Array(n);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
    x[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11 * g;
    b6 = w * 0.115926;
  }
  return x;
}

export function brown(n, g = 1) {
  const x = new Float32Array(n);
  let v = 0;
  for (let i = 0; i < n; i++) { v = (v + 0.02 * (Math.random() * 2 - 1)) / 1.02; x[i] = v * 3.5 * g; }
  return x;
}

// Biquad RBJ in-place. type: lp hp bp peak notch lowshelf highshelf
export function biquad(x, type, f, q = 0.707, gainDb = 0) {
  f = clamp(f, 10, SR * 0.45);
  const w = (2 * Math.PI * f) / SR, cw = Math.cos(w), sw = Math.sin(w);
  const alpha = sw / (2 * q), A = Math.pow(10, gainDb / 40);
  let b0, b1, b2, a0, a1, a2;
  switch (type) {
    case 'lp': b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
    case 'hp': b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
    case 'bp': b0 = alpha; b1 = 0; b2 = -alpha; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
    case 'notch': b0 = 1; b1 = -2 * cw; b2 = 1; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
    case 'peak': b0 = 1 + alpha * A; b1 = -2 * cw; b2 = 1 - alpha * A; a0 = 1 + alpha / A; a1 = -2 * cw; a2 = 1 - alpha / A; break;
    case 'lowshelf': {
      const s = 2 * Math.sqrt(A) * alpha;
      b0 = A * ((A + 1) - (A - 1) * cw + s); b1 = 2 * A * ((A - 1) - (A + 1) * cw); b2 = A * ((A + 1) - (A - 1) * cw - s);
      a0 = (A + 1) + (A - 1) * cw + s; a1 = -2 * ((A - 1) + (A + 1) * cw); a2 = (A + 1) + (A - 1) * cw - s; break;
    }
    case 'highshelf': {
      const s = 2 * Math.sqrt(A) * alpha;
      b0 = A * ((A + 1) + (A - 1) * cw + s); b1 = -2 * A * ((A - 1) + (A + 1) * cw); b2 = A * ((A + 1) + (A - 1) * cw - s);
      a0 = (A + 1) - (A - 1) * cw + s; a1 = 2 * ((A - 1) - (A + 1) * cw); a2 = (A + 1) - (A - 1) * cw - s; break;
    }
    default: return x;
  }
  b0 /= a0; b1 /= a0; b2 /= a0; a1 /= a0; a2 /= a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const xi = x[i];
    const y = b0 * xi + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = xi; y2 = y1; y1 = y; x[i] = y;
  }
  return x;
}

export function lp(x, f, q) { return biquad(x, 'lp', f, q); }
export function hp(x, f, q) { return biquad(x, 'hp', f, q); }
export function bp(x, f, q) { return biquad(x, 'bp', f, q); }

// Banco de resonadores de 2 polos excitado por x. modes: [{f, t60, g}]
export function resonate(x, modes) {
  const out = new Float32Array(x.length);
  for (const m of modes) {
    if (m.f >= SR * 0.47) continue;
    const r = Math.exp(-6.9078 / (m.t60 * SR));
    const w = (2 * Math.PI * m.f) / SR;
    const c1 = 2 * r * Math.cos(w), c2 = -r * r;
    const b = (1 - r) * 2 * Math.sin(w) * (m.g ?? 1);
    let y1 = 0, y2 = 0;
    for (let i = 0; i < x.length; i++) {
      const y = b * x[i] + c1 * y1 + c2 * y2;
      y2 = y1; y1 = y; out[i] += y;
    }
  }
  return out;
}

// Modos sinusoidales con decaimiento (vidrio, metal) sumados en out desde `at` (s).
export function addModes(out, at, modes, amp = 1) {
  const s0 = Math.round(at * SR);
  for (const m of modes) {
    const k = Math.exp(-6.9078 / (m.t60 * SR));
    const w = (2 * Math.PI * m.f) / SR;
    let a = amp * (m.g ?? 1), ph = Math.random() * 6.283;
    const n = Math.min(out.length - s0, Math.round(m.t60 * SR));
    for (let i = 0; i < n; i++) { out[s0 + i] += a * Math.sin(ph); ph += w; a *= k; }
  }
  return out;
}

// Excitación corta (impacto): ruido con envolvente exponencial muy rápida.
export function impulse(sec, decay = 0.004, g = 1) {
  const n = len(sec), x = new Float32Array(n);
  const k = Math.exp(-1 / (decay * SR));
  let a = g;
  for (let i = 0; i < n; i++) { x[i] = (Math.random() * 2 - 1) * a; a *= k; }
  return x;
}

export function mix(dst, src, at = 0, g = 1) {
  const s0 = Math.round(at * SR);
  const n = Math.min(src.length, dst.length - s0);
  for (let i = Math.max(0, -s0); i < n; i++) dst[s0 + i] += src[i] * g;
  return dst;
}

export function envExp(x, attack, decay) {
  const a = Math.max(1, attack * SR), k = Math.exp(-1 / (decay * SR));
  let e = 1;
  for (let i = 0; i < x.length; i++) {
    const att = i < a ? i / a : 1;
    if (i >= a) e *= k;
    x[i] *= att * e;
  }
  return x;
}

// Envolvente por puntos [[t, v], ...] interpolada linealmente.
export function envPts(x, pts) {
  let j = 0;
  for (let i = 0; i < x.length; i++) {
    const t = i / SR;
    while (j < pts.length - 2 && t > pts[j + 1][0]) j++;
    const [t0, v0] = pts[j], [t1, v1] = pts[Math.min(j + 1, pts.length - 1)];
    const u = t1 > t0 ? clamp((t - t0) / (t1 - t0), 0, 1) : 1;
    x[i] *= v0 + (v1 - v0) * u;
  }
  return x;
}

export function fade(x, inSec = 0.002, outSec = 0.01) {
  const a = Math.min(x.length, len(inSec)), b = Math.min(x.length, len(outSec));
  for (let i = 0; i < a; i++) x[i] *= i / a;
  for (let i = 0; i < b; i++) x[x.length - 1 - i] *= i / b;
  return x;
}

export function peak(x) { let p = 0; for (let i = 0; i < x.length; i++) { const v = Math.abs(x[i]); if (v > p) p = v; } return p; }
export function rms(x) { let s = 0; for (let i = 0; i < x.length; i++) s += x[i] * x[i]; return Math.sqrt(s / x.length); }
export function normalize(x, target = 0.5) {
  const p = peak(x);
  if (p > 1e-9) { const g = target / p; for (let i = 0; i < x.length; i++) x[i] *= g; }
  return x;
}
export function scale(x, g) { for (let i = 0; i < x.length; i++) x[i] *= g; return x; }
export function softclip(x, drive = 1.5) {
  const n = Math.tanh(drive);
  for (let i = 0; i < x.length; i++) x[i] = Math.tanh(x[i] * drive) / n;
  return x;
}

// Hace un loop sin costura: cruza el final sobre el principio (equal power).
export function loopable(x, xf = 0.5) {
  const n = len(xf);
  if (x.length < n * 3) return x;
  const out = x.slice(0, x.length - n);
  for (let i = 0; i < n; i++) {
    const u = i / n;
    out[i] = x[i] * Math.sin(u * Math.PI / 2) + x[x.length - n + i] * Math.cos(u * Math.PI / 2);
  }
  return out;
}

// Fricción stick-slip: tren de impulsos irregulares cuya tasa sigue vel(t) (0..1).
// Es la base de crujidos de bisagra, madera y arrastres. rate=[Hz min, Hz max].
export function stickSlip(sec, vel, { rate = [8, 90], jitter = 0.25, amp = [0.4, 1], width = 0.0006 } = {}) {
  const n = len(sec), x = new Float32Array(n);
  let i = 0;
  const w = Math.max(2, Math.round(width * SR));
  while (i < n) {
    const t = i / SR, v = clamp(vel(t), 0, 1);
    if (v < 0.02) { i += Math.round(0.004 * SR); continue; }
    const hz = rate[0] + (rate[1] - rate[0]) * v;
    const period = (1 / hz) * (1 + (Math.random() * 2 - 1) * jitter);
    const a = (amp[0] + (amp[1] - amp[0]) * Math.random()) * Math.sqrt(v);
    for (let k = 0; k < w && i + k < n; k++) x[i + k] += a * (1 - k / w) * (k === 0 ? 1 : (Math.random() * 2 - 1));
    i += Math.max(1, Math.round(period * SR));
  }
  return x;
}

// Lectura con velocidad variable (wow/flutter, arranques de motor). rate(t)->factor.
export function varispeed(x, rateFn, outSec) {
  const n = outSec ? len(outSec) : x.length;
  const out = new Float32Array(n);
  let p = 0;
  for (let i = 0; i < n; i++) {
    const i0 = p | 0;
    if (i0 >= x.length - 1) break;
    const f = p - i0;
    out[i] = x[i0] * (1 - f) + x[i0 + 1] * f;
    p += rateFn(i / SR);
  }
  return out;
}

// Ruido suavizado (control lento) muestreado cada `step` s, interpolado.
export function slowNoise(sec, step = 0.5, seedAmp = 1) {
  const pts = Math.ceil(sec / step) + 2, v = [];
  for (let i = 0; i < pts; i++) v.push((Math.random() * 2 - 1) * seedAmp);
  return (t) => {
    const u = t / step, i = Math.floor(u), f = u - i, s = f * f * (3 - 2 * f);
    return v[Math.min(i, pts - 1)] * (1 - s) + v[Math.min(i + 1, pts - 1)] * s;
  };
}
