// Waypoint graph over the plan. Nodes are hand-placed free spots per room plus a pair of nodes at
// each passable portal; edges inside a room are kept only if no furniture box blocks them.
const POINTS = {
  zaguan: [[0, 1.3], [0, 3.9]],
  pasillo: [[0, 6], [0, 9.8], [0, 12.4], [0, 15.5], [0, 19], [0, 21.2]],
  hueco: [[1.9, 12.5]],
  patio: [[0, 23], [0, 26.2], [1.9, 29.2], [-2, 28]],
  lavadero: [[1.9, 30.8], [0, 32], [2.8, 32.4], [-2.8, 32.8], [0, 34]],
  baulera: [[-4.1, 33]],
  hall1b: [[-1.9, 12.4], [-3.4, 12.4]],
  living: [[-4.6, 12.4], [-5.3, 8.4], [-5.3, 13.6], [-8.6, 8.6], [-8.8, 10.4], [-5.0, 14.4], [-9.1, 13.3]],
  cocina: [[-2.9, 14.3], [-2.0, 15.2], [-2.3, 16.8], [-3.6, 16.75]],
  distrib: [[-4.9, 15.6], [-4.9, 16.7], [-5.1, 17.5]],
  dormitorio: [[-6.4, 17.0], [-7.6, 17.6], [-8.9, 18.5], [-9.0, 16.3], [-8.9, 19.2]],
  bano: [[-5.1, 18.7], [-4.0, 19.1]],
};
const NO_PASS = new Set(['calle', '1a', 'ascensor', 'escalera']);

export class Nav {
  constructor(building) {
    this.b = building; this.nodes = []; this.edges = [];
    const byRoom = {};
    for (const [room, pts] of Object.entries(POINTS)) for (const [x, z] of pts) { const n = this.addNode(x, z, room); (byRoom[room] ||= []).push(n); }
    for (const p of building.portals) {
      if (!p.b || NO_PASS.has(p.id) || p.type === 'window' || p.type === 'gate') continue;
      const c = building.portalCenter(p); const nx = p.axis === 'x' ? 1 : 0, nz = p.axis === 'z' ? 1 : 0;
      const side = r => { const rb = building.rooms[r].b; return p.axis === 'x' ? Math.sign((rb[0] + rb[1]) / 2 - p.c) : Math.sign((rb[2] + rb[3]) / 2 - p.c); };
      const na = this.addNode(c.x + nx * side(p.a) * .5, c.z + nz * side(p.a) * .5, p.a, p.id);
      const nb = this.addNode(c.x + nx * side(p.b) * .5, c.z + nz * side(p.b) * .5, p.b, p.id);
      this.link(na, nb, p.id); (byRoom[p.a] ||= []).push(na); (byRoom[p.b] ||= []).push(nb);
    }
    for (const list of Object.values(byRoom)) for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) if (this.clear(list[i], list[j])) this.link(list[i], list[j]);
    // nodos aislados (muebles muy cerca): se unen al vecino más cercano del cuarto que no cruce paredes
    for (const list of Object.values(byRoom)) for (const n of list) {
      if (n.adj.length) continue;
      const cand = list.filter(m => m !== n && m.adj.length && this.clear(n, m, .05)).sort((a, b) => Math.hypot(a.x - n.x, a.z - n.z) - Math.hypot(b.x - n.x, b.z - n.z));
      if (cand[0]) this.link(n, cand[0]);
    }
    this.byRoom = byRoom;
  }
  addNode(x, z, room, portal = null) { const n = { id: this.nodes.length, x, z, room, portal, adj: [] }; this.nodes.push(n); return n; }
  link(a, b, door = null) { const d = Math.hypot(a.x - b.x, a.z - b.z); a.adj.push({ to: b, d, door }); b.adj.push({ to: a, d, door }); }
  clear(a, b, pad = .22) {
    for (const bx of this.b.boxes) if (segBox(a.x, a.z, b.x, b.z, bx, pad)) return false;
    for (const s of this.b.segments) if (segSeg(a.x, a.z, b.x, b.z, s.x1, s.z1, s.x2, s.z2)) return false;
    return true;
  }
  nearest(x, z, room) {
    let best = null, bd = 1e9;
    for (const n of (room && this.byRoom[room]) || this.nodes) { if (!n.adj.length) continue; const d = Math.hypot(n.x - x, n.z - z); if (d < bd) { bd = d; best = n; } }
    return best;
  }
  // Dijkstra; doorCost(doorId) lets the caller price closed/locked doors
  path(from, to, doorCost = () => 0) {
    const dist = new Map([[from, 0]]), prev = new Map(), open = new Set([from]);
    while (open.size) {
      let u = null, ud = 1e9; for (const n of open) { const d = dist.get(n); if (d < ud) { ud = d; u = n; } }
      open.delete(u); if (u === to) break;
      for (const e of u.adj) { const c = doorCost(e.door); if (c === Infinity) continue; const nd = ud + e.d + c; if (nd < (dist.get(e.to) ?? 1e9)) { dist.set(e.to, nd); prev.set(e.to, { n: u, door: e.door }); open.add(e.to); } }
    }
    if (!dist.has(to)) return null;
    const out = []; let n = to; while (n !== from) { const p = prev.get(n); out.unshift({ node: n, door: p.door }); n = p.n; }
    return out;
  }
  roomDistance(a, b) { const p = this.path(this.byRoom[a][0], this.byRoom[b][0]); return p ? p.length : 99; }
}

function segSeg(ax, az, bx, bz, cx, cz, dx, dz) {
  const d = (bx - ax) * (dz - cz) - (bz - az) * (dx - cx); if (Math.abs(d) < 1e-9) return false;
  const t = ((cx - ax) * (dz - cz) - (cz - az) * (dx - cx)) / d, u = ((cx - ax) * (bz - az) - (cz - az) * (bx - ax)) / d;
  return t > .02 && t < .98 && u > 0 && u < 1;
}
function segBox(ax, az, bx, bz, b, pad) {
  const x0 = b.x0 - pad, x1 = b.x1 + pad, z0 = b.z0 - pad, z1 = b.z1 + pad;
  for (let i = 0; i <= 20; i++) { const t = i / 20, x = ax + (bx - ax) * t, z = az + (bz - az) * t; if (x > x0 && x < x1 && z > z0 && z < z1) return true; }
  return false;
}
