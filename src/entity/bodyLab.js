// Harness para mirar el cuerpo (no es parte del juego). URL: ?mode=walk&w=0.5&t=1.2&cam=front|side|back|close&speed=0.8
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createEntityBody } from './Body.js';

const q = new URLSearchParams(location.search);
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(innerWidth, innerHeight); renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x0c0b09);
const cam = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.05, 50);
const camPos = { front: [0, 1.45, 2.6], side: [2.6, 1.3, 0.2], back: [-0.6, 1.5, -2.6], close: [0.15, 1.55, 0.75], low: [0.8, 0.5, 1.6] }[q.get('cam') || 'front'];
cam.position.set(...camPos);
const ctl = new OrbitControls(cam, renderer.domElement); ctl.target.set(0, q.get('cam') === 'close' ? 1.5 : 0.9, 0); ctl.update();
// pasillo: piso de calcáreo oscuro, pared verde/marfil, tungsteno + linterna
const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshStandardMaterial({ color: 0x3a3631, roughness: 0.7 }));
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
const wallLow = new THREE.Mesh(new THREE.PlaneGeometry(10, 1.2), new THREE.MeshStandardMaterial({ color: 0x2f4a3c, roughness: 0.8 })); wallLow.position.set(0, 0.6, -1.5); scene.add(wallLow);
const wallHi = new THREE.Mesh(new THREE.PlaneGeometry(10, 2), new THREE.MeshStandardMaterial({ color: 0xb9b097, roughness: 0.9 })); wallHi.position.set(0, 2.2, -1.5); scene.add(wallHi);
scene.add(new THREE.HemisphereLight(0x3a4050, 0x15110c, 0.35));
const bulb = new THREE.PointLight(0xffb46b, 9, 8, 2); bulb.position.set(0.8, 2.6, 0.6); bulb.castShadow = true; bulb.shadow.bias = -0.001; bulb.shadow.normalBias = 0.02; scene.add(bulb);
const torch = new THREE.SpotLight(0xfff1dc, q.get('torch') === '0' ? 0 : 14, 12, 0.45, 0.5, 2); torch.position.copy(cam.position); torch.castShadow = true; torch.shadow.bias = -0.0005; torch.shadow.normalBias = 0.02; scene.add(torch); scene.add(torch.target);

const body = createEntityBody({ guise: q.get('guise') || 'elena' });
scene.add(body.root);
const modes = ['idle', 'walk', 'stalk', 'run', 'still', 'peek', 'reach', 'crouch', 'turn_head'];
const sel = document.getElementById('mode'); modes.forEach((m) => sel.add(new Option(m, m)));
sel.value = q.get('mode') || 'idle';
const wIn = document.getElementById('w'); wIn.value = q.get('w') ?? 0; body.setWrongness(+wIn.value);
wIn.oninput = () => body.setWrongness(+wIn.value);
const move = document.getElementById('move'), look = document.getElementById('look');
const speed = () => { const m = sel.value; return +(q.get('speed') ?? ({ walk: 0.8, stalk: 0.5, run: 4.2 }[m] ?? 0)); };
let ang = 0;
function step(dt) {
  if (move.checked) { ang += dt * speed() / 2; body.root.position.set(Math.sin(ang) * 2, 0, Math.cos(ang) * 2 - 1); body.root.rotation.y = ang + Math.PI / 2; }
  body.update(dt, { speed: speed(), mode: sel.value, lookAt: look.checked ? cam.position : null });
}
// avance determinista para capturas
const T = +(q.get('t') ?? 0);
for (let i = 0; i < T * 60; i++) step(1 / 60);
window.__ready = true;
let last = performance.now();
renderer.setAnimationLoop(() => {
  const now = performance.now(); const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (!q.has('freeze')) step(dt);
  torch.position.copy(cam.position); torch.target.position.set(0, 1, 0);
  renderer.render(scene, cam);
});
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); });
