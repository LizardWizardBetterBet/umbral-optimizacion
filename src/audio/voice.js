// "Voz" sintética: síntesis formántica en cascada (estilo Klatt) a partir de texto español
// aproximado (rioplatense: ll/y -> sh). No es TTS inteligible: es balbuceo con la prosodia,
// el ritmo silábico y el timbre de una voz real, para que con subtítulos se perciba como voz.
// Más el procesamiento de casete (wow/flutter, hiss, saturación, dropouts, print-through).
import { SR, len, rnd, clamp, biquad, pink, white, mix, softclip, varispeed, normalize, slowNoise, fade, resonate, impulse } from './dsp.js';

const VOW = {
  a: [800, 1350, 2700, 3800], e: [500, 1980, 2750, 3900], i: [330, 2450, 3100, 4000],
  o: [530, 950, 2650, 3700], u: [360, 800, 2600, 3600],
};
const NAS = { m: [280, 1100, 2600, 3500], n: [280, 1600, 2700, 3600] };

// ---------- texto -> fonemas ----------
function phonemes(text) {
  const out = []; // {p, cls, stress, word}
  const words = text.toLowerCase().replace(/[¿¡]/g, '').split(/\s+/).filter(Boolean);
  words.forEach((raw, wi) => {
    const punct = (raw.match(/[.,;:!?…]+$/) || [''])[0];
    let w = raw.replace(/[^a-záéíóúüñ]/g, '');
    if (!w) return;
    const accented = /[áéíóú]/.test(w);
    const ph = [];
    for (let i = 0; i < w.length; i++) {
      const c = w[i], n = w[i + 1] || '', nn = 'eiéí'.includes(n);
      const base = { á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u' }[c] || c;
      const acc = 'áéíóú'.includes(c);
      if ('aeiou'.includes(base)) { ph.push({ p: base, cls: 'v', acc }); continue; }
      if (c === 'l' && n === 'l') { ph.push({ p: 'sh', cls: 'f' }); i++; continue; }
      if (c === 'y') { if ('aeiouáéíóú'.includes(n)) ph.push({ p: 'sh', cls: 'f' }); else ph.push({ p: 'i', cls: 'v' }); continue; }
      if (c === 'c' && n === 'h') { ph.push({ p: 't', cls: 'p' }, { p: 'sh', cls: 'f' }); i++; continue; }
      if (c === 'q') { ph.push({ p: 'k', cls: 'p' }); if (n === 'u') i++; continue; }
      if (c === 'g' && n === 'u' && 'eiéí'.includes(w[i + 2] || '')) { ph.push({ p: 'g', cls: 'b' }); i++; continue; }
      if (c === 'r' && (n === 'r' || i === 0)) { ph.push({ p: 'R', cls: 'l' }); if (n === 'r') i++; continue; }
      if (c === 'c') { ph.push(nn ? { p: 's', cls: 'f' } : { p: 'k', cls: 'p' }); continue; }
      if (c === 'g') { ph.push(nn ? { p: 'x', cls: 'f' } : { p: 'g', cls: 'b' }); continue; }
      if (c === 'z' || c === 's') { ph.push({ p: 's', cls: 'f' }); continue; }
      if (c === 'j') { ph.push({ p: 'x', cls: 'f' }); continue; }
      if (c === 'f') { ph.push({ p: 'f', cls: 'f' }); continue; }
      if (c === 'h') continue;
      if (c === 'v' || c === 'b') { ph.push({ p: 'b', cls: 'b' }); continue; }
      if (c === 'd') { ph.push({ p: 'd', cls: 'b' }); continue; }
      if (c === 'p' || c === 't' || c === 'k') { ph.push({ p: c, cls: 'p' }); continue; }
      if (c === 'x') { ph.push({ p: 'k', cls: 'p' }, { p: 's', cls: 'f' }); continue; }
      if (c === 'm') { ph.push({ p: 'm', cls: 'n' }); continue; }
      if (c === 'n' || c === 'ñ') { ph.push({ p: 'n', cls: 'n' }); continue; }
      if (c === 'l') { ph.push({ p: 'l', cls: 'l' }); continue; }
      if (c === 'r') { ph.push({ p: 'r', cls: 'l' }); continue; }
    }
    // acento: tilde, o llana (termina en vocal/n/s) o aguda
    const vIdx = ph.map((p, i) => (p.cls === 'v' ? i : -1)).filter((i) => i >= 0);
    let st = -1;
    if (accented) st = ph.findIndex((p) => p.acc);
    else if (vIdx.length) {
      const last = w[w.length - 1];
      st = 'aeiouns'.includes(last) && vIdx.length > 1 ? vIdx[vIdx.length - 2] : vIdx[vIdx.length - 1];
    }
    ph.forEach((p, i) => { p.stress = i === st; p.word = wi; out.push(p); });
    if (punct) out.push({ p: '_', cls: '_', punct, word: wi });
  });
  return out;
}

// ---------- fonemas -> pistas de control -> audio ----------
function klatt(F, bw) {
  const r = Math.exp(-Math.PI * bw / SR);
  const B = 2 * r * Math.cos(2 * Math.PI * F / SR), C = -r * r;
  return [1 - B - C, B, C];
}

/**
 * Sintetiza una frase. opts: { f0, rate, breath, whisper, formantScale, monotone, holdWord, holdSec, gapWord, gapSec, question }
 * Devuelve Float32Array.
 */
export function speak(text, opts = {}) {
  const f0base = opts.f0 ?? 195;
  const rate = opts.rate ?? 0.92;
  const breath = opts.breath ?? 0.1;
  const fs = opts.formantScale ?? 1;
  const ph = phonemes(text);
  const question = opts.question ?? /\?\s*$/.test(text);

  // Segmentos con duración y objetivos
  const seg = [];
  let t = 0.05;
  const words = ph.length ? ph[ph.length - 1].word : 0;
  ph.forEach((p, i) => {
    const finalWord = p.word === words;
    let d, F = null, va = 0, na = 0, nf = 0, nq = 1, f0k = 0, am = 0;
    const nextV = ph.slice(i + 1).find((q) => q.cls === 'v');
    switch (p.cls) {
      case 'v':
        d = rnd(0.07, 0.1) * (p.stress ? 1.4 : 1) * (finalWord && p.stress ? 1.5 : 1);
        if (finalWord && !ph.slice(i + 1).some((q) => q.cls === 'v')) d *= 1.6;
        F = VOW[p.p]; va = p.stress ? 1 : 0.82; f0k = p.stress ? 1 : 0; break;
      case 'n': d = 0.055; F = NAS[p.p]; va = 0.32; break;
      case 'l':
        if (p.p === 'r') { d = 0.028; va = 0.25; }
        else if (p.p === 'R') { d = 0.085; va = 0.6; am = 27; }
        else { d = 0.05; F = [350, 1300, 2800, 3700]; va = 0.55; }
        break;
      case 'b': d = 0.04; va = 0.22; F = nextV ? VOW[nextV.p].map((f, k) => (k === 0 ? 300 : f * 0.9)) : null; break;
      case 'p': d = 0.06; va = 0; break;
      case 'f':
        d = { s: 0.09, sh: 0.095, f: 0.075, x: 0.075 }[p.p];
        na = { s: 0.3, sh: 0.36, f: 0.09, x: 0.17 }[p.p];
        nf = { s: 6800, sh: 3100, f: 4500, x: 1700 }[p.p];
        nq = { s: 2.2, sh: 1.6, f: 0.7, x: 1.4 }[p.p];
        break;
      case '_':
        d = /[.!?…]/.test(p.punct) ? 0.32 : 0.18; break;
    }
    if (opts.holdWord != null && p.word === opts.holdWord && p.stress) d = opts.holdSec ?? 1.1;
    d /= rate;
    seg.push({ t, d, p, F, va, na, nf, nq, f0k, am });
    if (opts.gapWord != null && p.word === opts.gapWord && ph[i + 1]?.word !== p.word) {
      t += d; seg.push({ t, d: opts.gapSec ?? 1.2, p: { cls: '_' }, va: 0, na: 0, F: null }); t += opts.gapSec ?? 1.2; return;
    }
    t += d;
  });
  const total = t + 0.25;
  const n = len(total);
  const out = new Float32Array(n);

  // Estado
  let Fc = (VOW.a).map((f) => f * fs);
  const bws = [95, 115, 175, 260];
  const res = [[0, 0], [0, 0], [0, 0], [0, 0]];
  let coef = Fc.map((f, k) => klatt(f, bws[k]));
  let vaS = 0, naS = 0, nfS = 3000, nqS = 1;
  let ph0 = 0, prevG = 0, periodJ = 1, shim = 1;
  let svLow = 0, svBand = 0;
  let si = 0;
  const tremPh = Math.random() * 6.28;
  const drift = slowNoise(total, 0.35, 0.03);
  const block = 16;
  let curF = Fc.slice(), curNF = 3000;
  let bursts = [];
  seg.forEach((s) => { if (s.p.cls === 'p') bursts.push({ at: s.t + s.d * 0.75, f: { p: 900, t: 3800, k: 2200 }[s.p.p] || 2000 }); });

  for (let i = 0; i < n; i++) {
    const tt = i / SR;
    if (i % block === 0) {
      while (si < seg.length - 1 && tt > seg[si].t + seg[si].d) si++;
      const s = seg[si];
      const inSeg = tt >= s.t && tt <= s.t + s.d;
      const tgtF = s.F ? s.F.map((f) => f * fs) : curF;
      if (s.F) curF = tgtF;
      const kF = 1 - Math.exp(-block / (0.016 * SR));
      for (let k = 0; k < 4; k++) { Fc[k] += (tgtF[k] - Fc[k]) * kF; coef[k] = klatt(Fc[k], bws[k] * (opts.whisper ? 1.6 : 1)); }
      let tva = inSeg ? s.va : 0, tna = inSeg ? s.na : 0;
      if (s.am) tva *= 0.55 + 0.45 * Math.cos(2 * Math.PI * s.am * tt);
      const kA = 1 - Math.exp(-block / (0.007 * SR));
      vaS += (tva - vaS) * kA; naS += (tna - naS) * kA;
      if (s.nf) curNF = s.nf;
      nfS += (curNF - nfS) * 0.3; nqS = s.nq || nqS;
    }
    // f0: declinación, acento, final de frase, pregunta, temblor senil
    const u = tt / total;
    let f0 = f0base * (1.1 - 0.17 * u);
    const s = seg[si];
    if (s.f0k && !opts.monotone) {
      const v = clamp((tt - s.t) / s.d, 0, 1);
      f0 *= 1 + 0.11 * Math.sin(Math.PI * v);
    }
    if (u > 0.82) f0 *= question ? 1 + (u - 0.82) * 1.6 : 1 - (u - 0.82) * 0.7;
    if (!opts.monotone) f0 *= 1 + 0.018 * Math.sin(2 * Math.PI * 5.3 * tt + tremPh) + drift(tt);
    // pulso glotal (Rosenberg) con jitter/shimmer por período
    ph0 += (f0 * periodJ) / SR;
    if (ph0 >= 1) { ph0 -= 1; periodJ = 1 + (Math.random() * 2 - 1) * 0.012; shim = 1 + (Math.random() * 2 - 1) * 0.08; }
    const tp = 0.4, te = 0.62;
    const g = ph0 < tp ? 0.5 * (1 - Math.cos(Math.PI * ph0 / tp)) : ph0 < te ? Math.cos((Math.PI / 2) * (ph0 - tp) / (te - tp)) : 0;
    const dg = (g - prevG) * (SR / f0) * 0.08;
    prevG = g;
    const asp = (Math.random() * 2 - 1) * (0.25 + 0.75 * g);
    let src = opts.whisper ? asp * 0.5 * vaS : (dg * shim + asp * breath) * vaS;
    // cascada de formantes
    for (let k = 0; k < 4; k++) {
      const [A, B, C] = coef[k], r = res[k];
      const y = A * src + B * r[0] + C * r[1];
      r[1] = r[0]; r[0] = y; src = y;
    }
    // fricativas: ruido por SVF pasabanda
    let fr = 0;
    if (naS > 0.002) {
      const f = 2 * Math.sin(Math.PI * Math.min(nfS, SR * 0.2) / SR), q = 1 / nqS;
      const x = Math.random() * 2 - 1;
      svLow += f * svBand; const high = x - svLow - q * svBand; svBand += f * high;
      fr = svBand * naS * 1.2;
    }
    out[i] = src * 0.5 + fr;
  }
  // explosiones de oclusivas
  for (const b of bursts) {
    const x = impulse(0.025, 0.004, 0.35);
    biquad(x, 'bp', b.f, 1.2);
    mix(out, x, b.at);
  }
  biquad(out, 'hp', 75);
  return fade(out, 0.01, 0.05);
}

// ---------- casetes ----------
export const TAPE_SCRIPTS = {
  elena1: [
    'Martes catorce.', 'Son las tres de la mañana.', 'Otra vez los golpes en la cañería.',
    'No son los caños, ya lo sé.', 'Te escucho caminar en el pasillo.',
    'Dejé la luz de la cocina prendida, por si querés.',
  ],
  elena2: [
    'Hoy habló con la voz de Ernesto.', 'Desde el dormitorio.', 'Me dijo nena, como me decía él.',
    'Ernesto murió hace once años.', '¿Por qué hacés eso?', 'No te voy a abrir el placard.',
  ],
  elena3: [
    'Si alguien escucha esto, no le contesten.', 'Aprende.', 'Repite lo que uno dice.',
    'Tapé el espejo del baño.', 'Porque ahí se ve que no está.',
    'Ya no sé si la que graba soy yo.',
  ],
  // suena a Elena pero algo está mal: repeticiones idénticas, pausas imposibles, otra voz debajo
  mimic: [
    { text: 'Martes catorce.' }, { text: 'Son las tres.' }, { text: 'Son las tres.', repeatOf: 1 },
    { text: 'Son las tres de la mañana.', gapWord: 2, gapSec: 1.6 },
    { text: 'Te escucho.' }, { text: 'Te escucho.', repeatOf: 4 },
    { text: 'Vení, abrime nena.', holdWord: 1, holdSec: 1.3, monotone: true },
    { text: 'Estoy en la cocina.' }, { text: 'Estoy en la cocina.', repeatOf: 7 },
  ],
};

const scripts = { ...TAPE_SCRIPTS };
export function setTapeScript(id, lines) { scripts[id] = lines; }

/** Renderiza un casete completo -> { data, duration, phrases:[{start,end,text}] } */
export function renderTape(id) {
  const lines = (scripts[id] ?? scripts.elena1).map((l) => (typeof l === 'string' ? { text: l } : l));
  const wrong = id === 'mimic';
  const lead = 1.1;
  const rendered = [];
  const phrases = [];
  let t = lead;
  lines.forEach((l, i) => {
    let a;
    if (l.repeatOf != null && rendered[l.repeatOf]) a = rendered[l.repeatOf]; // copia EXACTA: lo antinatural
    else a = speak(l.text, { f0: 196 + rnd(-6, 6), rate: rnd(0.86, 0.95), breath: 0.11, ...l });
    rendered[i] = a;
    phrases.push({ start: t, end: t + a.length / SR, text: l.text });
    t += a.length / SR + (wrong ? (l.repeatOf != null ? 0.12 : rnd(0.2, 1.8)) : rnd(0.55, 1.15));
    if (!wrong && Math.random() < 0.3) t += rnd(0.4, 0.9); // Elena piensa
  });
  const total = t + 1.2;
  const n = len(total);
  let v = new Float32Array(n);
  phrases.forEach((p, i) => mix(v, rendered[i], p.start, 1));
  // respiraciones de Elena entre frases (no en la imitadora: no respira)
  if (!wrong) phrases.forEach((p) => {
    const b = breathSound(rnd(0.35, 0.5), 0.07);
    mix(v, b, Math.max(0.2, p.start - 0.45));
  });
  // segunda voz debajo, una octava abajo y susurrada, levemente desfasada
  if (wrong) {
    const under = new Float32Array(n);
    phrases.forEach((p, i) => {
      const l = lines[i];
      const a = speak(l.text, { f0: 98, rate: 0.9, whisper: i % 2 === 0, formantScale: 0.88, breath: 0.4, monotone: true, holdWord: l.holdWord, holdSec: l.holdSec, gapWord: l.gapWord, gapSec: l.gapSec });
      mix(under, a, p.start + 0.085, 0.22);
    });
    biquad(under, 'lp', 1800);
    mix(v, under);
  }
  // micrófono barato + cuarto donde grababa (living): reflexiones cortas
  biquad(v, 'hp', 170); biquad(v, 'peak', 2600, 1.2, 3); biquad(v, 'lp', 5200);
  const refl = v.slice(); biquad(refl, 'lp', 2500);
  mix(v, refl, 0.007, 0.25); mix(v, refl, 0.0135, -0.16); mix(v, refl, 0.023, 0.1);
  // tono de cuarto + el reloj del living de fondo (en 'mimic' el reloj no está)
  const room = pink(n, 0.012); biquad(room, 'lp', 900); mix(v, room);
  if (!wrong) {
    for (let s = 0.4; s < total - 0.5; s += 1.0) {
      const tick = resonate(impulse(0.06, 0.0015, 0.05), [{ f: 2400, t60: 0.03 }, { f: 3900, t60: 0.02 }, { f: 1300, t60: 0.05 }]);
      biquad(tick, 'lp', 3000); mix(v, tick, s + rnd(-0.004, 0.004), (Math.round(s) % 2) ? 0.8 : 1);
    }
  }
  normalize(v, 0.6);
  // grabación en cinta: saturación, pérdida de agudos
  softclip(v, 1.7);
  biquad(v, 'lp', 6200, 0.6);
  // print-through: eco fantasma de cada frase 1.6 s ANTES (vuelta anterior de la cinta)
  const ghost = v.slice(); biquad(ghost, 'lp', 1800);
  mix(v, ghost, -1.6, 0.025);
  // dropouts (cinta gastada)
  for (let k = 0; k < (wrong ? 5 : 3); k++) {
    const at = rnd(lead, total - 1), d = rnd(0.05, wrong ? 0.4 : 0.16);
    const a = Math.round(at * SR), b = Math.min(n, a + Math.round(d * SR));
    for (let i = a; i < b; i++) { const u = (i - a) / (b - a); v[i] *= 1 - 0.8 * Math.sin(Math.PI * u); }
  }
  // hiss + zumbido de red 50 Hz
  const hiss = pink(n, 0.05); biquad(hiss, 'hp', 1400); biquad(hiss, 'highshelf', 6000, 0.7, 3);
  mix(v, hiss);
  for (let i = 0; i < n; i++) v[i] += 0.0035 * Math.sin(2 * Math.PI * 50 * i / SR) + 0.0015 * Math.sin(2 * Math.PI * 150 * i / SR);
  // wow & flutter + arranque del motor
  const wowPh = Math.random() * 6, flPh = Math.random() * 6;
  const wn = slowNoise(total, 0.8, 0.0025);
  v = varispeed(v, (tt) => {
    const startup = tt < 0.35 ? 0.82 + 0.18 * (tt / 0.35) : 1;
    const slow = wrong && tt > total * 0.62 && tt < total * 0.7 ? 0.965 : 1; // la cinta "arrastra"
    return startup * slow * (1 + 0.0045 * Math.sin(2 * Math.PI * 0.55 * tt + wowPh) + 0.0016 * Math.sin(2 * Math.PI * 8.2 * tt + flPh) + wn(tt));
  }, total);
  // teclas de la casetera: play al principio, stop al final
  const clack = mechClick(0.9); mix(v, clack, 0.0);
  mix(v, mechClick(0.6), total - 0.35);
  // altavoz chico del grabador
  biquad(v, 'hp', 220, 0.8); biquad(v, 'peak', 1200, 1, 2);
  normalize(fade(v, 0.001, 0.05), 0.55);
  return { data: v, duration: total, phrases };
}

export function breathSound(sec = 1, g = 0.3, wet = 0) {
  const n = len(sec), x = pink(n, 1);
  biquad(x, 'bp', 1400, 0.8); biquad(x, 'peak', 2600, 2, 6); biquad(x, 'lp', 5000);
  for (let i = 0; i < n; i++) { const u = i / n; x[i] *= Math.pow(Math.sin(Math.PI * u), 1.4) * g; }
  if (wet) { // chasquidos húmedos (saliva)
    for (let k = 0; k < 4 * wet; k++) {
      const c = impulse(0.01, 0.0008, 0.15 * wet); biquad(c, 'bp', rnd(1500, 3500), 3);
      mix(x, c, rnd(0, sec));
    }
  }
  return x;
}

export function mechClick(g = 1) {
  const x = new Float32Array(len(0.12));
  mix(x, resonate(impulse(0.05, 0.001, g), [{ f: 1800, t60: 0.03 }, { f: 3400, t60: 0.02 }, { f: 700, t60: 0.05 }, { f: 220, t60: 0.06, g: 0.6 }]), 0);
  mix(x, resonate(impulse(0.04, 0.001, g * 0.5), [{ f: 2600, t60: 0.02 }, { f: 1100, t60: 0.03 }]), 0.028);
  return x;
}

// Balbuceo sin texto (TV, vecinos): sílabas inventadas
const SYL = ['la', 'pe', 'ro', 'si', 'mo', 'ten', 'das', 'co', 'mu', 'ver', 'que', 'na', 'bien', 'lo', 'ga', 'se', 'tra', 'di', 'pa', 'no'];
export function pseudoText(words = 8) {
  let s = '';
  for (let w = 0; w < words; w++) {
    let wd = ''; const k = 1 + ((Math.random() * 3) | 0);
    for (let j = 0; j < k; j++) wd += SYL[(Math.random() * SYL.length) | 0];
    s += wd + (w === words - 1 ? '.' : Math.random() < 0.15 ? ', ' : ' ');
  }
  return s;
}

export { white };
