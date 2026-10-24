// Micrófono opcional. Nunca se rutea a la salida. Mantiene un buffer circular de los últimos
// segundos para que la entidad pueda "quedarse" con lo que el jugador acaba de decir.
const RING_SEC = 10;

export class Mic {
  constructor(eng) {
    this.eng = eng;
    this.enabled = false;
    this._lvl = 0;
    this._captures = [];
  }

  async enable() {
    if (this.enabled) return true;
    const ctx = this.eng.ctx;
    if (!ctx || !navigator.mediaDevices?.getUserMedia) return false;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch { return false; }
    const src = ctx.createMediaStreamSource(this.stream);
    this.analyser = ctx.createAnalyser(); this.analyser.fftSize = 1024;
    this._td = new Float32Array(this.analyser.fftSize);
    src.connect(this.analyser);
    // ScriptProcessor: simple y suficiente (4096 muestras ~ 85 ms). Salida muda.
    const proc = ctx.createScriptProcessor(4096, 1, 1);
    this.ring = new Float32Array(Math.round(RING_SEC * ctx.sampleRate));
    this.ringPos = 0; this.ringFill = 0;
    proc.onaudioprocess = (e) => {
      const x = e.inputBuffer.getChannelData(0);
      const r = this.ring, n = r.length;
      for (let i = 0; i < x.length; i++) { r[this.ringPos] = x[i]; this.ringPos = (this.ringPos + 1) % n; }
      this.ringFill = Math.min(n, this.ringFill + x.length);
      for (const c of this._captures) c.push(x);
      e.outputBuffer.getChannelData(0).fill(0);
    };
    const mute = ctx.createGain(); mute.gain.value = 0;
    src.connect(proc); proc.connect(mute); mute.connect(ctx.destination);
    this.proc = proc; this.src = src;
    this.enabled = true;
    return true;
  }

  disable() {
    if (!this.enabled) return;
    this.stream.getTracks().forEach((t) => t.stop());
    try { this.proc.disconnect(); this.src.disconnect(); } catch { /* */ }
    this.enabled = false; this._lvl = 0;
  }

  /** Nivel de voz suavizado 0..1 (≈ -60 dBFS -> 0, -12 dBFS -> 1). */
  level() { return this._lvl; }

  update() {
    if (!this.enabled) return;
    this.analyser.getFloatTimeDomainData(this._td);
    let s = 0; for (let i = 0; i < this._td.length; i++) s += this._td[i] * this._td[i];
    const db = 10 * Math.log10(s / this._td.length + 1e-12);
    const v = Math.max(0, Math.min(1, (db + 60) / 48));
    this._lvl += (v - this._lvl) * (v > this._lvl ? 0.5 : 0.08);
  }

  /** Graba los próximos `seconds`. Devuelve AudioBuffer recortado a la parte con voz, o null si no hubo voz. */
  capture(seconds = 3) {
    if (!this.enabled) return Promise.resolve(null);
    return new Promise((resolve) => {
      const chunks = [];
      const c = { push: (x) => chunks.push(new Float32Array(x)) };
      this._captures.push(c);
      setTimeout(() => {
        this._captures = this._captures.filter((k) => k !== c);
        const n = chunks.reduce((a, b) => a + b.length, 0);
        const all = new Float32Array(n); let o = 0;
        for (const ch of chunks) { all.set(ch, o); o += ch.length; }
        resolve(this._toBuffer(all));
      }, seconds * 1000 + 120);
    });
  }

  /** Los últimos `seconds` ya escuchados (sin esperar). AudioBuffer o null. */
  recent(seconds = 3) {
    if (!this.enabled || !this.ringFill) return null;
    const n = Math.min(this.ringFill, Math.round(seconds * this.eng.ctx.sampleRate));
    const out = new Float32Array(n), r = this.ring, L = r.length;
    let p = (this.ringPos - n + L) % L;
    for (let i = 0; i < n; i++) { out[i] = r[p]; p = (p + 1) % L; }
    return this._toBuffer(out);
  }

  _toBuffer(x) {
    const sr = this.eng.ctx.sampleRate, win = Math.round(sr * 0.02);
    let first = -1, last = -1, pk = 0;
    for (let i = 0; i + win <= x.length; i += win) {
      let s = 0; for (let k = 0; k < win; k++) s += x[i + k] * x[i + k];
      const db = 10 * Math.log10(s / win + 1e-12);
      if (db > -42) { if (first < 0) first = i; last = i + win; }
    }
    if (first < 0 || last - first < sr * 0.15) return null;
    first = Math.max(0, first - Math.round(sr * 0.12)); last = Math.min(x.length, last + Math.round(sr * 0.2));
    const y = x.slice(first, last);
    for (let i = 0; i < y.length; i++) pk = Math.max(pk, Math.abs(y[i]));
    const g = pk > 0 ? Math.min(6, 0.7 / pk) : 1;
    const fadeN = Math.min(y.length >> 2, Math.round(sr * 0.03));
    for (let i = 0; i < y.length; i++) y[i] *= g * Math.min(1, i / fadeN, (y.length - 1 - i) / fadeN);
    const b = this.eng.ctx.createBuffer(1, y.length, sr);
    b.copyToChannel(y, 0);
    return b;
  }
}
