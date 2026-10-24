import * as THREE from 'three';
import { createRenderer, Post } from './core/Renderer.js';
import { Player } from './core/Player.js';
import { makeMaterials } from './world/textures.js';
import { Building } from './world/Building.js';
import { Lighting } from './world/Lighting.js';
import { furnish } from './world/props.js';
import { Rain } from './world/Weather.js';
import { START } from './world/layout.js';
import { Game } from './game/Game.js';
import './style.css';

const $ = s => document.querySelector(s);
const canvas = $('#view');
const params = new URLSearchParams(location.search);

const renderer = createRenderer(canvas);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x06080a);
const camera = new THREE.PerspectiveCamera(70, 1, .05, 120); camera.rotation.order = 'YXZ'; camera.layers.enable(2); scene.add(camera);
const post = new Post(renderer, scene, camera);

const mats = makeMaterials();
const building = new Building(scene, mats);
const lighting = new Lighting(scene, building);
const props = furnish(building, lighting, mats);
building.finalize();
const rain = new Rain(scene, [[-6, 6, -5, 0, 9], [-3.5, 3.5, 22, 30, 11]]);

// flashlight: cool white LED-less halogen, the only light the player carries
const torch = new THREE.SpotLight(0xfff0dc, 0, 22, .55, .85, 2);
torch.castShadow = false; torch.shadow.mapSize.set(512, 512); torch.shadow.bias = -.0006; torch.shadow.camera.near = .1;
torch.position.set(.18, -.22, .1); camera.add(torch); torch.target.position.set(.05, -.1, -4); camera.add(torch.target);

const player = new Player('p1', camera, building);
player.spawn(START.pos, START.yaw);

const game = new Game({ scene, camera, renderer, post, building, lighting, props, player, torch, mats, params });
window.__umbral = game; // debug/QA handle

function resize() { const w = innerWidth, h = innerHeight; camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h, false); post.setSize(w, h); }
addEventListener('resize', resize); resize();

let last = performance.now(), t = 0;
// QA: advance the simulation without rendering (headless playtests)
game.simulate = (seconds, dt = 1 / 30) => { const n = Math.round(seconds / dt); for (let i = 0; i < n; i++) { t += dt; game.update(dt, t); } return t; };
game.paused = false;
function frame(now) {
  const dt = Math.min(.05, (now - last) / 1000); last = now; t += dt;
  if (!game.paused) { game.update(dt, t); rain.update(dt); post.render(t); }
  requestAnimationFrame(frame);
}

// QA: ?shot=x,y,z,yaw,pitch renders a still from a given viewpoint without pointer lock
if (params.has('shot')) {
  const [x, y, z, yaw, pitch] = params.get('shot').split(',').map(Number);
  game.qaShot({ x, y, z, yaw, pitch });
  setTimeout(() => game.simulate(2.5, 1 / 15), 0);
}
requestAnimationFrame(frame);
