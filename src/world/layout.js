// Floor plan of the slice: planta baja of a 1950s porteño building, unit 1°B. Metres; x east, z south, y up.
// Rooms are axis-aligned rectangles; each generates its own inward-facing walls, so both sides of a
// partition can have different finishes. Portals sit on a room edge and cut both rooms' walls.

export const ROOMS = {
  calle:     { name: 'Vereda, calle Moreno', b: [-4.5, 4.5, -3.6, 0], h: 0, floor: 'street', wall: 'facade', outdoor: true, surface: 'wet', reverb: 'outdoor' },
  zaguan:    { name: 'Zaguán', b: [-1.6, 1.6, 0, 5], h: 3.5, floor: 'mosaic', wall: 'wallHall', surface: 'mosaic', reverb: 'hall' },
  pasillo:   { name: 'Pasillo de planta baja', b: [-1.2, 1.2, 5, 22], h: 3.3, floor: 'mosaic', wall: 'wallHall', surface: 'mosaic', reverb: 'hall' },
  hueco:     { name: 'Hueco de la escalera', b: [1.2, 3.2, 11.6, 13.3], h: 2.25, floor: 'concrete', wall: 'wallService', surface: 'wood', reverb: 'closet' },
  patio:     { name: 'Patio interno', b: [-3.5, 3.5, 22, 30], h: 0, floor: 'street', wall: 'facade', outdoor: true, surface: 'wet', reverb: 'outdoor' },
  lavadero:  { name: 'Lavadero común', b: [-3.5, 3.5, 30, 35], h: 2.8, floor: 'concrete', wall: 'wallService', surface: 'concrete', reverb: 'tile' },
  baulera:   { name: 'Baulera', b: [-5.2, -3.5, 31.4, 34.6], h: 2.4, floor: 'concrete', wall: 'wallService', surface: 'concrete', reverb: 'closet' },
  hall1b:    { name: '1°B · Recibidor', b: [-4, -1.2, 11, 13.8], h: 3.0, floor: 'parquet', wall: 'wallpaperLiving', surface: 'parquet', reverb: 'small' },
  living:    { name: '1°B · Living comedor', b: [-10, -4, 7, 15], h: 3.0, floor: 'parquet', wall: 'wallpaperLiving', surface: 'parquet', reverb: 'room' },
  cocina:    { name: '1°B · Cocina', b: [-4, -1.2, 13.8, 18], h: 3.0, floor: 'floorKitchen', wall: 'wallKitchen', surface: 'ceramic', reverb: 'tile' },
  distrib:   { name: '1°B · Pasillito', b: [-5.8, -4, 15, 18], h: 3.0, floor: 'parquet', wall: 'wallpaperBed', surface: 'parquet', reverb: 'small' },
  dormitorio:{ name: '1°B · Dormitorio', b: [-10, -5.8, 15, 21], h: 3.0, floor: 'parquet', wall: 'wallpaperBed', surface: 'parquet', reverb: 'room' },
  bano:      { name: '1°B · Baño', b: [-5.8, -3.0, 18, 20.6], h: 2.8, floor: 'floorBath', wall: 'wallBath', surface: 'ceramic', reverb: 'tile' },
};

// type: door (leaf), opening (no leaf), window (solid for collision, visual + sound leak), gate (iron, see-through)
// edge: which wall line. axis 'x' => wall runs along z at x=c ; axis 'z' => wall runs along x at z=c
export const PORTALS = [
  { id: 'calle', type: 'door', a: 'calle', b: 'zaguan', axis: 'z', c: 0, from: -.7, to: .7, h: 2.6, leaf: 'street', hinge: 'from', swing: 'zaguan', open: 0 },
  { id: 'zaguan_int', type: 'door', a: 'zaguan', b: 'pasillo', axis: 'z', c: 5, from: -.75, to: .75, h: 2.5, leaf: 'glass', hinge: 'to', swing: 'pasillo', open: .85 },
  { id: '1a', type: 'door', a: 'pasillo', b: null, axis: 'x', c: 1.2, from: 7.05, to: 7.95, h: 2.2, leaf: 'wood', hinge: 'from', swing: null, open: 0, locked: true, label: '1°A' },
  { id: 'ascensor', type: 'gate', a: 'pasillo', b: null, axis: 'x', c: 1.2, from: 9.4, to: 10.9, h: 2.2 },
  { id: 'hueco', type: 'door', a: 'pasillo', b: 'hueco', axis: 'x', c: 1.2, from: 12.25, to: 12.95, h: 1.95, leaf: 'plank', hinge: 'to', swing: 'pasillo', open: 0, lockedInside: true },
  { id: 'escalera', type: 'gate', a: 'pasillo', b: null, axis: 'x', c: 1.2, from: 13.5, to: 18.3, h: 3.3 },
  { id: '1b', type: 'door', a: 'pasillo', b: 'hall1b', axis: 'x', c: -1.2, from: 11.95, to: 12.85, h: 2.2, leaf: 'wood', hinge: 'from', swing: 'hall1b', open: 0, locked: true, label: '1°B' },
  { id: 'patio', type: 'door', a: 'pasillo', b: 'patio', axis: 'z', c: 22, from: -.55, to: .55, h: 2.4, leaf: 'glass', hinge: 'from', swing: 'patio', open: 0 },
  { id: 'lavadero', type: 'door', a: 'patio', b: 'lavadero', axis: 'z', c: 30, from: 1.5, to: 2.35, h: 2.1, leaf: 'paint', hinge: 'to', swing: 'lavadero', open: .25 },
  { id: 'baulera', type: 'door', a: 'lavadero', b: 'baulera', axis: 'x', c: -3.5, from: 32.4, to: 33.2, h: 2.0, leaf: 'plank', hinge: 'from', swing: 'lavadero', open: 0, lockedInside: true },
  { id: 'living_hall', type: 'opening', a: 'hall1b', b: 'living', axis: 'x', c: -4, from: 11.6, to: 13.1, h: 2.4 },
  { id: 'cocina', type: 'door', a: 'hall1b', b: 'cocina', axis: 'z', c: 13.8, from: -3.3, to: -2.5, h: 2.15, leaf: 'paint', hinge: 'from', swing: 'cocina', open: .6 },
  { id: 'cocina_distrib', type: 'door', a: 'cocina', b: 'distrib', axis: 'x', c: -4, from: 16.3, to: 17.1, h: 2.15, leaf: 'paint', hinge: 'to', swing: 'distrib', open: 0 },
  { id: 'living_distrib', type: 'door', a: 'living', b: 'distrib', axis: 'z', c: 15, from: -5.45, to: -4.55, h: 2.2, leaf: 'wood', hinge: 'to', swing: 'distrib', open: .9 },
  { id: 'dormitorio', type: 'door', a: 'distrib', b: 'dormitorio', axis: 'x', c: -5.8, from: 16.6, to: 17.45, h: 2.15, leaf: 'wood', hinge: 'from', swing: 'dormitorio', open: .3 },
  { id: 'bano', type: 'door', a: 'distrib', b: 'bano', axis: 'z', c: 18, from: -5.5, to: -4.75, h: 2.1, leaf: 'paint', hinge: 'from', swing: 'bano', open: .15 },
  // windows: sound leaks, light from outside, never passable
  { id: 'w_living1', type: 'window', a: 'living', b: null, axis: 'x', c: -10, from: 8.6, to: 10.0, sill: .9, h: 2.5, outside: 'shaft' },
  { id: 'w_living2', type: 'window', a: 'living', b: null, axis: 'x', c: -10, from: 11.8, to: 13.2, sill: .9, h: 2.5, outside: 'shaft' },
  { id: 'w_dorm', type: 'window', a: 'dormitorio', b: null, axis: 'x', c: -10, from: 15.6, to: 17.0, sill: .9, h: 2.5, outside: 'shaft' },
  { id: 'w_cocina', type: 'window', a: 'cocina', b: null, axis: 'z', c: 18, from: -2.6, to: -1.6, sill: 1.2, h: 2.2, outside: 'shaft' },
  { id: 'w_lav', type: 'window', a: 'lavadero', b: 'patio', axis: 'z', c: 30, from: -2.4, to: -.6, sill: 1.1, h: 2.1, outside: 'patio' },
  { id: 'w_zag', type: 'window', a: 'zaguan', b: 'calle', axis: 'z', c: 0, from: -1.45, to: -.85, sill: .9, h: 2.4, outside: 'street', bars: true },
];

// Hiding places (player) and the spots the entity may check. 'peek' = the view the hidden player gets.
export const HIDES = {
  placard: { room: 'dormitorio', pos: [-9.55, 0, 19.2], enter: [-8.9, 0, 19.2], look: [1, 0, 0], label: 'placard' },
  hueco:   { room: 'hueco', pos: [2.7, 0, 12.45], enter: [1.7, 0, 12.6], look: [-1, 0, 0], label: 'hueco' },
  bañera:  { room: 'bano', pos: [-5.1, 0, 20.0], enter: [-4.6, 0, 19.2], look: [1, 0, -.6], label: 'cortina del baño' },
};

export const START = { pos: [0, 0, -2.2], yaw: Math.PI };  // on the sidewalk, facing the door
