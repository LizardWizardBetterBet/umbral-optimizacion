// Generación de datos de audio por clave. Compartido por el worker (fondo) y el hilo principal (fallback).
//   os:<name>:<v>            one-shot
//   fs:<surface>:<by>:<h>:<v> paso
//   lp:<name>                 loop
//   tape:<id>                 casete -> { data, duration, phrases }
//   ir:<type>                 respuesta al impulso estéreo
//   mus:<cue>                 música
import { setSR, SR, len, buf, rnd, pink, brown, biquad, loopable, slowNoise, normalize, mix, fade } from './dsp.js';
import { ONESHOTS, LOOPS, footstepSound } from './sounds.js';
import { renderTape, setTapeScript } from './voice.js';
import { makeIR } from './reverb.js';

export { setSR, setTapeScript };

export function generate(key) {
  const [kind, a, b, c] = key.split(':');
  switch (kind) {
    case 'os': return { ch: wrap(ONESHOTS[a][0]()) };
    case 'fs': return { ch: wrap(footstepSound(a, b, +c)) };
    case 'lp': return { ch: wrap(a === '_hiss' ? hiss() : LOOPS[a]()) };
    case 'tape': { const t = renderTape(a); return { ch: [t.data], duration: t.duration, phrases: t.phrases }; }
    case 'ir': return { ch: makeIR(a) };
    case 'mus': return { ch: wrap(music(a)) };
  }
  throw new Error('clave de audio desconocida: ' + key);
}
const wrap = (x) => (Array.isArray(x) ? x : [x]);

function hiss() {
  const x = pink(len(4.3), 0.06); biquad(x, 'hp', 1500); biquad(x, 'highshelf', 6000, 0.7, 3);
  return loopable(x, 0.3);
}

// Música: drones mínimos, apenas perceptibles. Nada de orquesta.
function music(cue) {
  if (cue === 'chase') {
    // pulso grave tenso a 104 bpm: latido doble + sub sostenido con trémolo
    const beat = 60 / 104, bars = 4, sec = beat * 4 * bars, n = len(sec), x = new Float32Array(n);
    for (let k = 0; k < 4 * bars; k++) {
      for (const [off, g] of [[0, 1], [0.21, 0.55]]) {
        const s0 = Math.round((k * beat + off) * SR);
        let ph = 0;
        for (let i = 0; i < len(0.35) && s0 + i < n; i++) {
          const t = i / SR, f = 62 * Math.exp(-t * 7) + 38;
          ph += 2 * Math.PI * f / SR;
          x[s0 + i] += Math.sin(ph) * g * Math.exp(-t * 9) * Math.min(1, i / 60) * 0.5;
        }
      }
    }
    for (let i = 0; i < n; i++) { const t = i / SR; x[i] += 0.12 * Math.sin(2 * Math.PI * 36.7 * t) * (0.7 + 0.3 * Math.sin(2 * Math.PI * t / beat)); }
    const air = pink(n, 0.05); biquad(air, 'bp', 180, 2); mix(x, air);
    return normalize(x, 0.5);
  }
  if (cue === 'end') {
    const sec = 22, n = len(sec), x = new Float32Array(n);
    const fr = [65.4, 98, 103.8, 130.8]; // quinta con una segunda menor encima: algo no cierra
    for (let i = 0; i < n; i++) {
      const t = i / SR, e = Math.min(1, t / 6) * Math.min(1, (sec - t) / 8);
      let v = 0;
      fr.forEach((f, k) => { v += Math.sin(2 * Math.PI * f * t * (1 + 0.0008 * Math.sin(t * 0.3 + k))) * (k === 2 ? 0.25 : 0.5); });
      x[i] = v * e * 0.25;
    }
    biquad(x, 'lp', 900);
    return normalize(fade(x, 0.5, 2), 0.35);
  }
  // dread: sub con batido lento + soplo filtrado que respira
  const sec = 24, n = len(sec + 2), x = new Float32Array(n);
  const sw = slowNoise(sec + 2, 4, 0.5);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    x[i] = (0.5 * Math.sin(2 * Math.PI * 43.65 * t) + 0.5 * Math.sin(2 * Math.PI * 43.95 * t) + 0.2 * Math.sin(2 * Math.PI * 87.6 * t)) * 0.4 * (0.75 + 0.25 * sw(t));
  }
  const air = brown(n, 0.25); biquad(air, 'lp', 260);
  for (let i = 0; i < n; i++) air[i] *= 0.5 + sw(i / SR);
  mix(x, air);
  return normalize(loopable(x, 2), 0.4);
}
