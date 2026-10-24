// Renderer + restrained post: filmic tone map, fine grain, vignette, slight lens softness at the edges.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const FilmShader = {
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, grain: { value: .045 }, vignette: { value: .55 }, fear: { value: 0 }, fade: { value: 1 }, res: { value: new THREE.Vector2(1, 1) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float time, grain, vignette, fear, fade; uniform vec2 res; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
    void main(){
      vec2 uv = vUv; vec2 c = uv - .5; float r = length(c);
      float ca = .0012 + fear * .004;
      vec3 col;
      col.r = texture2D(tDiffuse, uv + c * ca).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - c * ca).b;
      float g = h(uv * res + fract(time * 31.7) * 100.) - .5;
      float lum = dot(col, vec3(.299,.587,.114));
      col += g * grain * (1.2 - lum);           // grain lives in the shadows, like film
      col *= 1. - smoothstep(.35, .95, r) * vignette;
      col = mix(col, vec3(lum) * vec3(1.02, .98, .95), fear * .35);
      gl_FragColor = vec4(col * fade, 1.);
    }`,
};

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  // Keep rendering at the CSS pixel size on high-DPI screens. The composer
  // runs multiple full-screen passes, so supersampling above 1x multiplies
  // fragment work without changing the game's layout or behavior.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  return renderer;
}

export class Post {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    this.film = new ShaderPass(FilmShader); this.composer.addPass(this.film);
    this.composer.addPass(new OutputPass());
  }
  setSize(w, h) { this.composer.setSize(w, h); this.film.uniforms.res.value.set(w, h); }
  render(t) { this.film.uniforms.time.value = t; this.composer.render(); }
  get u() { return this.film.uniforms; }
}
