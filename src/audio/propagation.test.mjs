import test from 'node:test';
import assert from 'node:assert/strict';
import { propagate } from './propagation.mjs';

const centers = {
  pasillo: { x: 0, y: 1.5, z: 0 },
  hall1b: { x: 4, y: 1.5, z: 0 },
  living: { x: 8, y: 1.5, z: 0 },
  cocina: { x: 8, y: 1.5, z: 5 },
  patio: { x: -6, y: 1.5, z: 0 },
};
const mk = (doorOpen) => [
  { id: 'puerta1b', a: 'pasillo', b: 'hall1b', pos: { x: 2, y: 1, z: 0 }, getOpen: () => doorOpen },
  { id: 'arco', a: 'hall1b', b: 'living', pos: { x: 6, y: 1, z: 0 }, getOpen: () => 1 },
  { id: 'cocina', a: 'living', b: 'cocina', pos: { x: 8, y: 1, z: 2.5 }, getOpen: () => 1 },
  { id: 'ventana', a: 'living', b: 'patio', pos: { x: 8, y: 1.5, z: -3 }, getOpen: () => 0.15 },
];

test('mismo cuarto: sin via, sin muffle', () => {
  const r = propagate('living', 'living', mk(0), centers);
  assert.equal(r.via, null);
  assert.equal(r.muffle, 0);
  assert.deepEqual(r.path, ['living']);
});

test('puerta cerrada atenúa fuerte y apaga agudos; abierta no', () => {
  const closed = propagate('pasillo', 'living', mk(0), centers);
  const opened = propagate('pasillo', 'living', mk(1), centers);
  assert.deepEqual(closed.path, ['pasillo', 'hall1b', 'living']);
  assert.ok(closed.gain < opened.gain * 0.2, `${closed.gain} vs ${opened.gain}`);
  assert.ok(closed.muffle > 0.7 && opened.muffle < 0.25);
});

test('via = portal de entrada al cuarto del oyente', () => {
  const r = propagate('pasillo', 'cocina', mk(1), centers);
  assert.deepEqual(r.path, ['pasillo', 'hall1b', 'living', 'cocina']);
  assert.deepEqual(r.via, { x: 8, y: 1, z: 2.5 });
});

test('sin camino: silencio', () => {
  const r = propagate('pasillo', 'bano', mk(1), centers);
  assert.equal(r.gain, 0);
  assert.equal(r.via, null);
});

test('elige el camino menos atenuado y acepta posiciones', () => {
  const ps = [...mk(0), { id: 'pasillo-patio', a: 'pasillo', b: 'patio', pos: { x: -3, y: 1, z: 0 }, open: 1 }];
  const r = propagate('pasillo', 'living', ps, centers, { fromPos: { x: 0, y: 1, z: 0 }, toPos: { x: 8, y: 1, z: 0 } });
  // por puerta cerrada (22 dB) vs por patio+ventana (ventana 0.15 ≈ 16 dB) -> patio gana
  assert.deepEqual(r.path, ['pasillo', 'patio', 'living']);
  assert.ok(r.gain > 0 && r.gain < 1);
});
