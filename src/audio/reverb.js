// Respuestas al impulso generadas (sin archivos). Ruido con decaimiento por banda
// (los agudos mueren antes), reflexiones tempranas según tamaño, y rasgos propios:
// flutter echo entre paredes paralelas del pasillo de calcáreo, caja seca del placard,
// slaps discretos de las paredes del patio.
import { SR, len, white, biquad, rnd } from './dsp.js';

const TYPES = {
  //        rt60 s, lpf del tail, pre-delay, ER taps, nota
  hall:    { rt: 2.3, hiRt: 0.9, damp: 6500, pre: 0.012, er: 9, erSpread: 0.06, flutter: 0.0135, wet: 0.36 },
  tile:    { rt: 1.15, hiRt: 0.75, damp: 9000, pre: 0.004, er: 12, erSpread: 0.022, flutter: 0.0062, wet: 0.32 },
  closet:  { rt: 0.2, hiRt: 0.08, damp: 2600, pre: 0.001, er: 6, erSpread: 0.006, box: 420, wet: 0.22 },
  small:   { rt: 0.45, hiRt: 0.25, damp: 5200, pre: 0.003, er: 8, erSpread: 0.014, wet: 0.2 },
  room:    { rt: 0.6, hiRt: 0.3, damp: 4800, pre: 0.005, er: 10, erSpread: 0.025, wet: 0.2 },
  outdoor: { rt: 0.9, hiRt: 0.35, damp: 4200, pre: 0.02, er: 4, erSpread: 0.09, slaps: true, wet: 0.17 },
};

export function reverbParams(type) { return TYPES[type] ?? TYPES.room; }

export function makeIR(type) {
  const p = reverbParams(type);
  const n = len(Math.min(3.2, p.rt * 1.25 + p.pre + 0.05));
  const ch = [];
  for (let c = 0; c < 2; c++) {
    // Tres bandas con distinto RT: grave lento, medio, agudo rápido.
    const lo = biquad(white(n), 'lp', 350);
    const mid = biquad(biquad(white(n), 'hp', 350), 'lp', 3000);
    const hi = biquad(white(n), 'hp', 3000);
    const out = new Float32Array(n);
    const pre = Math.round(p.pre * SR);
    const kLo = Math.exp(-6.9078 / (p.rt * 1.15 * SR));
    const kMid = Math.exp(-6.9078 / (p.rt * SR));
    const kHi = Math.exp(-6.9078 / (p.hiRt * SR));
    let aLo = 1, aMid = 1, aHi = 1;
    const fadeIn = Math.round(0.006 * SR + p.erSpread * SR * 0.5);
    for (let i = pre; i < n; i++) {
      const j = i - pre;
      const fi = j < fadeIn ? j / fadeIn : 1;
      out[i] = (lo[j] * aLo * 1.1 + mid[j] * aMid + hi[j] * aHi * 0.6) * fi * 0.5;
      aLo *= kLo; aMid *= kMid; aHi *= kHi;
    }
    // Reflexiones tempranas
    for (let k = 0; k < p.er; k++) {
      const t = p.pre + rnd(0.001, p.erSpread) * (1 + k * 0.15);
      const i = Math.round(t * SR);
      if (i < n) out[i] += (Math.random() < 0.5 ? -1 : 1) * rnd(0.3, 0.8) * Math.exp(-t * 6 / p.rt);
    }
    // Flutter: pasillo largo con paredes paralelas duras -> "ttttt" metálico corto
    if (p.flutter) {
      const per = p.flutter * (c ? 1.03 : 1);
      for (let t = p.pre + per, a = 0.5; t < Math.min(0.5, p.rt * 0.4); t += per, a *= 0.86) {
        const i = Math.round(t * SR);
        if (i < n) out[i] += a * (c ? -1 : 1) * 0.6;
      }
    }
    // Patio/calle: paredes lejanas devuelven golpes discretos
    if (p.slaps) {
      for (const t of [0.045 + c * 0.007, 0.083 + c * 0.004, 0.13 - c * 0.01, 0.21]) {
        const i = Math.round(t * SR);
        if (i < n) out[i] += rnd(0.35, 0.55) * (Math.random() < 0.5 ? -1 : 1);
      }
    }
    biquad(out, 'lp', p.damp, 0.6);
    if (p.box) biquad(out, 'peak', p.box, 2.5, 5); // resonancia de caja de madera
    biquad(out, 'hp', 90);
    ch.push(out);
  }
  // Normaliza energía para que todos los cuartos tengan nivel parecido de wet.
  let e = 0;
  for (const c of ch) for (let i = 0; i < c.length; i++) e += c[i] * c[i];
  const g = 1 / Math.sqrt(e / 2 + 1e-9) * 0.9;
  for (const c of ch) for (let i = 0; i < c.length; i++) c[i] *= g;
  return ch;
}
