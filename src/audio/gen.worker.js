// Worker: genera buffers en segundo plano para no trabar el hilo principal.
import { generate, setSR, setTapeScript } from './gen.js';

self.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'init') { setSR(m.sr); return; }
  if (m.type === 'script') { setTapeScript(m.id, m.lines); return; }
  if (m.type === 'gen') {
    try {
      const r = generate(m.key);
      self.postMessage({ key: m.key, ...r }, r.ch.map((c) => c.buffer));
    } catch (err) {
      self.postMessage({ key: m.key, error: String(err) });
    }
  }
};
