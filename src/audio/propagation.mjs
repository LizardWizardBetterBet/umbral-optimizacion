// Propagación de sonido entre cuartos por portales (puertas, ventanas, aberturas).
// Pura: sin WebAudio, sin three. La usan el AudioEngine y la entidad (para oír).
//
// propagate(fromRoom, toRoom, portals, roomCenters, opts?) ->
//   { gain 0..1, muffle 0..1, via {x,y,z}|null, path [roomId], dist m, portalGain 0..1 }
//
//   portals:     [{ id, a, b, pos:{x,y,z}, getOpen?: () => 0..1, open?: 0..1, closedLossDb?, closedMuffle? }]
//   roomCenters: { [roomId]: {x,y,z} }  o directamente `rooms` ({ [roomId]: { center:{x,y,z} } })
//   opts:        { fromPos?, toPos?, refDistance=2, maxPortals=6 }
//
//   gain       = pérdida por portales * atenuación por distancia recorrida (camino, no línea recta)
//   portalGain = sólo la pérdida por portales (el motor usa su propio modelo de distancia)
//   muffle     = cuánto se apagan los agudos (0 limpio, 1 sordo). Puerta cerrada ≈ 0.8
//   via        = posición del portal por el que el sonido entra al cuarto del oyente (null si mismo cuarto)

const CLOSED_LOSS_DB = 18;      // puerta de madera cerrada (con rendija)
const CLOSED_MUFFLE = 0.82;     // la puerta se come los agudos
const BEND_MUFFLE = 0.06;       // difracción por doblar en una abertura
const BEND_LOSS_DB = 1.0;
const DB_PER_METER = 0.35;      // sólo para ordenar caminos (Dijkstra), no para el gain final

const zero = { x: 0, y: 0, z: 0 };

function centerOf(roomCenters, id) {
  const c = roomCenters?.[id];
  if (!c) return null;
  return c.center ?? c;
}

function dist3(a, b) {
  const dx = a.x - b.x, dy = (a.y ?? 0) - (b.y ?? 0), dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function portalOpenness(p) {
  let o = 1;
  if (typeof p.getOpen === 'function') o = p.getOpen();
  else if (typeof p.open === 'number') o = p.open;
  if (!Number.isFinite(o)) o = 0;
  return o < 0 ? 0 : o > 1 ? 1 : o;
}

/** Pérdida de un portal según apertura: { lossDb, muffle } */
export function portalTransmission(open, closedLossDb = CLOSED_LOSS_DB, closedMuffle = CLOSED_MUFFLE) {
  // Una puerta entreabierta (0.1) ya deja pasar bastante: curva rápida al principio.
  const shut = Math.pow(1 - open, 2.2);
  return {
    lossDb: closedLossDb * shut + BEND_LOSS_DB,
    muffle: closedMuffle * shut + BEND_MUFFLE,
  };
}

export function distanceGain(d, refDistance = 2) {
  return d <= refDistance ? 1 : refDistance / d;
}

export function propagate(fromRoom, toRoom, portals = [], roomCenters = {}, opts = {}) {
  const refDistance = opts.refDistance ?? 2;
  const maxPortals = opts.maxPortals ?? 6;
  const fromPos = opts.fromPos ?? centerOf(roomCenters, fromRoom) ?? zero;
  const toPos = opts.toPos ?? centerOf(roomCenters, toRoom) ?? zero;

  if (fromRoom === toRoom) {
    const d = dist3(fromPos, toPos);
    return { gain: distanceGain(d, refDistance), muffle: 0, via: null, path: [fromRoom], dist: d, portalGain: 1 };
  }

  // Grafo: nodos = cuartos; aristas = portales. Dijkstra con costo = dB de pérdida + dB por metro.
  // El "estado" guarda la posición donde está el frente de onda (último portal), para medir camino real.
  const adj = new Map();
  for (const p of portals) {
    if (!p || p.a == null || p.b == null) continue;
    const t = portalTransmission(portalOpenness(p), p.closedLossDb, p.closedMuffle);
    for (const [u, v] of [[p.a, p.b], [p.b, p.a]]) {
      if (!adj.has(u)) adj.set(u, []);
      adj.get(u).push({ to: v, portal: p, t });
    }
  }

  // Cola de prioridad simple (grafos chicos: ~10-30 portales).
  const best = new Map();
  const open = [{ room: fromRoom, cost: 0, lossDb: 0, keep: 1, dist: 0, pos: fromPos, path: [fromRoom], via: null, hops: 0 }];
  best.set(fromRoom, 0);
  let found = null;

  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i].cost < open[bi].cost) bi = i;
    const cur = open.splice(bi, 1)[0];
    if (cur.cost > (best.get(cur.room) ?? Infinity) + 1e-9) continue;
    if (cur.room === toRoom) { found = cur; break; }
    if (cur.hops >= maxPortals) continue;
    for (const e of adj.get(cur.room) ?? []) {
      if (cur.path.includes(e.to)) continue;
      const pp = e.portal.pos ?? zero;
      const seg = dist3(cur.pos, pp);
      let dist = cur.dist + seg;
      let cost = cur.cost + e.t.lossDb + seg * DB_PER_METER;
      if (e.to === toRoom) {
        const last = dist3(pp, toPos);
        dist += last;
        cost += last * DB_PER_METER;
      }
      if (cost < (best.get(e.to) ?? Infinity) - 1e-9) {
        best.set(e.to, cost);
        open.push({
          room: e.to, cost, dist,
          lossDb: cur.lossDb + e.t.lossDb,
          keep: cur.keep * (1 - e.t.muffle),
          pos: pp, path: [...cur.path, e.to], via: pp, hops: cur.hops + 1,
        });
      }
    }
  }

  if (!found) {
    return { gain: 0, muffle: 1, via: null, path: [], dist: Infinity, portalGain: 0 };
  }
  const portalGain = Math.pow(10, -found.lossDb / 20);
  const gain = portalGain * distanceGain(found.dist, refDistance);
  return {
    gain: Math.max(0, Math.min(1, gain)),
    muffle: Math.max(0, Math.min(1, 1 - found.keep)),
    via: found.via ? { x: found.via.x, y: found.via.y ?? 0, z: found.via.z } : null,
    path: found.path,
    dist: found.dist,
    portalGain,
  };
}
