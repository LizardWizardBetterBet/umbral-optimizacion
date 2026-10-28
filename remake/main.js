import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import {makeCase, initialState, randomFromSeed, action, senseSound, receiveObservation, step} from './sim.mjs';
import './style.css';

// Laboratorio desde cero. El prototipo anterior NO se usa para arte ni gameplay.
// La primera entrega valida escala, arquitectura, física, luz fija y causalidad.
// Los personajes y la dirección sonora final todavía NO están integrados.
await RAPIER.init();
const $ = (s) => document.querySelector(s);
const seed = Math.max(1, Math.floor(Number(new URLSearchParams(location.search).get('seed')) || 11));
const plan = makeCase(seed), state = initialState(plan), rand = randomFromSeed(seed + 303);
const canvas = $('#scene');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101316);
scene.fog = new THREE.FogExp2(0x12191d, 0.018);
const camera = new THREE.PerspectiveCamera(72, 1, 0.06, 90);
camera.rotation.order = 'YXZ';
const renderer = new THREE.WebGLRenderer({canvas, antialias:true, powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
scene.add(new THREE.HemisphereLight(0x647884, 0x251d19, .21));
const world = new RAPIER.World({x:0,y:-9.81,z:0});
const colliderList = [];
const mats = {
  plaster:new THREE.MeshStandardMaterial({color:0x716d62,roughness:.96}),
  corridor:new THREE.MeshStandardMaterial({color:0x48494a,roughness:.92}),
  trim:new THREE.MeshStandardMaterial({color:0x322f2b,roughness:.78}),
  floor:new THREE.MeshStandardMaterial({color:0x393631,roughness:.86}),
  tiles:new THREE.MeshStandardMaterial({color:0x454b48,roughness:.87}),
  ceiling:new THREE.MeshStandardMaterial({color:0x77736b,roughness:1}),
  oak:new THREE.MeshStandardMaterial({color:0x49372a,roughness:.72}),
  wood:new THREE.MeshStandardMaterial({color:0x5b4839,roughness:.75}),
  black:new THREE.MeshStandardMaterial({color:0x171b1c,roughness:.55,metalness:.22}),
  bronze:new THREE.MeshStandardMaterial({color:0x9c7851,roughness:.48,metalness:.67}),
  ceramic:new THREE.MeshStandardMaterial({color:0xa8a296,roughness:.58}),
  paper:new THREE.MeshStandardMaterial({color:0xbeb09b,roughness:1,side:THREE.DoubleSide}),
  fabric:new THREE.MeshStandardMaterial({color:0x53534d,roughness:1}),
  rug:new THREE.MeshStandardMaterial({color:0x575045,roughness:1}),
  glass:new THREE.MeshStandardMaterial({color:0x101e23,roughness:.1,metalness:.12}),
};
function collider(x,y,z,w,h,d) {
  const desc=RAPIER.ColliderDesc.cuboid(w/2,h/2,d/2).setTranslation(x,y,z);
  return world.createCollider(desc);
}
function box(x,y,z,w,h,d,mat,solid=false) {
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);
  mesh.position.set(x,y,z);
  mesh.receiveShadow=true;mesh.castShadow=true;scene.add(mesh);
  if(solid)colliderList.push(collider(x,y,z,w,h,d));
  return mesh;
}
function sphere(x,y,z,r,mat){
  const mesh=new THREE.Mesh(new THREE.SphereGeometry(r,12,8),mat);
  mesh.position.set(x,y,z);mesh.castShadow=true;scene.add(mesh);return mesh;
}
function wall(x,z,w,d,mat=mats.plaster) {
  box(x,1.48,z,w,2.96,d,mat,true);
  if(w>d) {
    box(x,.13,z,w,.14,d+.015,mats.trim);
    box(x,2.78,z,w,.09,d+.02,mats.trim);
  } else {
    box(x,.13,z,w+.015,.14,d,mats.trim);
    box(x,2.78,z,w+.02,.09,d,mats.trim);
  }
}
function floor(x,z,w,d,mat) {
  box(x,-.065,z,w,.13,d,mat,true);
  box(x,2.99,z,w,.1,d,mats.ceiling);
}
function trimDoor(pivot) {
  const knob=sphere(0.06,1.05,.91,.06,mats.bronze);pivot.add(knob);knob.position.set(.07,1.05,.9);
}
function createDoor(room){
  const pivot=new THREE.Group();
  pivot.position.set(room.side*1.6,0,room.z-.55);
  scene.add(pivot);
  const leaf=new THREE.Mesh(new THREE.BoxGeometry(.075,2.37,1.08),mats.oak);
  leaf.position.set(0,1.21,.54);leaf.castShadow=true;leaf.receiveShadow=true;pivot.add(leaf);
  for(const height of [.51,1.42]){
    const panel=new THREE.Mesh(new THREE.BoxGeometry(.085,.58,.7),mats.wood);
    panel.position.set(0,height,.54);pivot.add(panel);
  }
  box(room.side*1.6,2.52,room.z,.22,.18,1.5,mats.trim);
  const id=room.id;
  const latch=box(room.side*1.6,1.07,room.z+.26,.13,.1,.07,mats.bronze);
  const hit=new THREE.Mesh(new THREE.BoxGeometry(.14,2.4,1.08),new THREE.MeshBasicMaterial({visible:false}));
  hit.position.set(0,1.18,.54);pivot.add(hit);
  const door={id,room,pivot,leaf,hit,open:false,collider:collider(room.side*1.6,1.2,room.z,.19,2.4,1.14),target:0};
  return door;
}
const doors=[];
floor(0,9,3.2,18,mats.floor);
wall(0,0,3.3,.22,mats.corridor);
wall(0,18,3.3,.24,mats.corridor);
for(const side of [-1,1]) {
  const gaps=plan.rooms.filter(r=>r.side===side).sort((a,b)=>a.z-b.z);
  let from=0;
  for(const gap of gaps) {
    const until=gap.z-.68;
    if(until>from)wall(side*1.6,(from+until)/2,.24,until-from,mats.corridor);
    from=gap.z+.68;
  }
  if(from<18)wall(side*1.6,(from+18)/2,.24,18-from,mats.corridor);
}
const lampLights=[];
function fixture(x,z,color=0xffd3a0,intensity=1.5) {
  const light=new THREE.PointLight(color,intensity,5.8,2);
  light.position.set(x,2.54,z);light.castShadow=false;scene.add(light);lampLights.push(light);
  box(x,2.79,z,.36,.12,.36,mats.bronze);
  box(x,2.65,z,.31,.18,.31,mats.ceramic);
  return light;
}
for(const z of [2.6,7.3,12.2,16])fixture(0,z,0xffd4ad,1.25);
const interactables=[];
function interact(mesh,label,run) {
  mesh.userData.interaction={label,run};
  interactables.push(mesh);
}
function frame(x,y,z,w,h,d) {
  box(x,y,z,w,h,d,mats.trim);
}
function bed(cx,cz) {
  box(cx,.32,cz,1.7,.55,2.05,mats.wood,true);
  box(cx,.66,cz,1.55,.21,1.85,mats.fabric);
  box(cx,.76,cz-.68,1.30,.12,.42,mats.ceramic);
  box(cx,.85,cz+1.04,1.7,.85,.13,mats.oak);
}
function study(cx,cz,side){
  const deskX=cx+side*.35,deskZ=cz-.52;
  box(deskX,.76,deskZ,1.58,.11,.72,mats.oak,true);
  for(const dx of [-.62,.62])for(const dz of [-.23,.23])
    box(deskX+dx,.36,deskZ+dz,.095,.7,.095,mats.wood);
  box(cx-side*1.03,.42,cz+.75,.58,.76,.58,mats.wood,true);
  for(let i=0;i<7;i++)box(deskX-.6+i*.18,.865,deskZ-.18,.09,.1+(rand()*.12),.27,
    i%2?mats.paper:mats.trim);
  const note=box(deskX,.845,deskZ+.10,.29,.012,.24,mats.paper);
  note.rotation.y=(rand()-.5)*.3;
  interact(note,'Leer la nota',()=>{
    const result=dispatch({kind:'clue',target:plan.clueRoom});
    if(result.ok){note.visible=false;notice('Elena escribió: “Cuando se apague, no contestes.”');$('#chapter span').textContent='Tenés la nota. Volvé a la entrada.';}
  });
}
function kitchen(cx,cz){
  box(cx+.65,.44,cz-1.6,2.0,.88,.48,mats.wood,true);
  box(cx+.65,.91,cz-1.6,2.0,.08,.53,mats.ceramic);
  box(cx+.3,1.05,cz-1.65,.44,.05,.28,mats.black);
  box(cx-.6,.74,cz+.2,1.18,.12,.82,mats.oak,true);
  for(const dx of [-.42,.42])for(const dz of [-.27,.27])
    box(cx-.6+dx,.36,cz+.2+dz,.10,.69,.10,mats.wood);
  sphere(cx-.6,.89,cz+.2,.15,mats.ceramic);
}
function bedroom(cx,cz,side){
  bed(cx+side*.28,cz-.25);
  box(cx-side*1.32,.95,cz+1.15,.72,1.9,.55,mats.wood,true);
  box(cx-side*1.32,1.6,cz+1.47,.06,.46,.02,mats.bronze);
}
for(const room of plan.rooms) {
  const outer=room.side*(1.6+room.width);
  const cx=room.side*(1.6+room.width/2),z=room.z;
  floor(cx,z,room.width,room.depth,room.kind==='kitchen'?mats.tiles:mats.floor);
  wall(outer,z,.24,room.depth+.18,mats.plaster);
  wall(cx,z-room.depth/2,room.width+.18,.2,mats.plaster);
  wall(cx,z+room.depth/2,room.width+.18,.2,mats.plaster);
  box(cx,.025,z,2.7,.02,3.1,mats.rug);
  const light=fixture(cx,z,room.kind==='kitchen'?0xffe1bf:0xffd3a0,1.9);
  if(room.kind==='study')study(cx,z,room.side);
  else if(room.kind==='bedroom')bedroom(cx,z,room.side);
  else kitchen(cx,z);
  // Ventana negra encastrada en pared exterior: no textura plana flotando.
  box(outer-room.side*.135,1.69,z+.65,.04,1.3,1.18,mats.black);
  box(outer-room.side*.162,1.69,z+.65,.025,1.08,1.0,mats.glass);
  box(outer-room.side*.18,1.69,z+.65,.045,1.18,.075,mats.trim);
  box(outer-room.side*.18,1.69,z+.65,.045,.075,1.08,mats.trim);
  const door=createDoor(room);doors.push(door);
  interact(door.hit,'Abrir / cerrar puerta',()=>{
    if(door.open){
      const p=body.translation();
      if(Math.hypot(p.x-room.side*1.6,p.z-room.z)<.85){notice('No hay lugar para cerrar la puerta.');return;}
    }
    const result=dispatch({kind:'door',target:room.id});
    if(result.ok){
      door.open=state.doors[room.id];
      door.target=door.open?-room.side*1.46:0;
      if(door.open&&door.collider){world.removeCollider(door.collider,true);door.collider=null;}
      if(!door.open)door.collider=collider(room.side*1.6,1.2,room.z,.19,2.4,1.14);
    }
  });
}
// Interruptor físico; energía única, lámparas sólo leen su estado.
const board=box(.78,1.42,.155,.42,.66,.10,mats.black);
box(.78,1.52,.08,.23,.1,.035,mats.bronze);
interact(board,'Accionar interruptor',()=>{
  const result=dispatch({kind:'breaker'});if(result.ok)notice(state.power?'La electricidad volvió.':'El edificio quedó casi a oscuras.');
});
// Salida siempre física, pero exige una evidencia.
const exit=box(0,1.23,17.82,1.35,2.46,.09,mats.oak);
interact(exit,'Salir del edificio',()=>{
  const result=dispatch({kind:'leave'});
  if(result.ok){controls=false;document.exitPointerLock?.();$('#hud').hidden=true;$('#ending').hidden=false;}
  else notice('Todavía no tenés ninguna prueba.');
});
box(0,2.65,17.82,1.6,.19,.14,mats.trim);
const emergency=new THREE.PointLight(0x9d524b,.38,2.5,2);
emergency.position.set(0,2.55,17.35);scene.add(emergency);
// Linterna manual: no se usa como sustituto de luces físicas.
const torch=new THREE.SpotLight(0xffedcf,3.2,13,.42,.47,1.65);
torch.position.set(.14,-.17,-.08);torch.target.position.set(0,-.07,-4);
camera.add(torch);camera.add(torch.target);scene.add(camera);
torch.castShadow=false;
let flashlight=true;
let tick=0,requests=0,noticeUntil=0;
function notice(message) {
  $('#notice').textContent=message;noticeUntil=performance.now()+3800;
}
function dispatch(intent){
  const result=action(plan,state,{...intent,id:'local-'+(++requests),tick});
  if(result.ok)for(const e of result.events){
    const observation=senseSound(plan,state,e);
    if(observation)receiveObservation(state,observation);
  }
  return result;
}
const body=world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(plan.entry.x,.92,plan.entry.z));
const capsule=world.createCollider(RAPIER.ColliderDesc.capsule(.56,.28),body);
const movement=world.createCharacterController(.025);
const keys=new Set();let controls=false;
let yaw=0,pitch=0,interacting=null;
window.addEventListener('keydown',e=>{
  if(['KeyW','KeyA','KeyS','KeyD','ShiftLeft','KeyF','KeyE'].includes(e.code))e.preventDefault();
  keys.add(e.code);
  if(e.code==='KeyF'&&!e.repeat){flashlight=!flashlight;torch.intensity=flashlight?3.2:0;}
  if(e.code==='KeyE'&&!e.repeat&&controls&&interacting)interacting.run();
});
window.addEventListener('keyup',e=>keys.delete(e.code));
window.addEventListener('blur',()=>keys.clear());
document.addEventListener('pointerlockchange',()=>{controls=document.pointerLockElement===canvas;});
document.addEventListener('mousemove',e=>{
  if(!controls)return;
  yaw-=e.movementX*.0021;pitch=Math.max(-1.48,Math.min(1.48,pitch-e.movementY*.0021));
});
$('#start').addEventListener('click',()=>{
  $('#front').hidden=true;$('#hud').hidden=false;canvas.requestPointerLock();
});
canvas.addEventListener('click',()=>{if(!$('#front').hidden)return;canvas.requestPointerLock();});
$('#again').addEventListener('click',()=>{location.search='?seed='+(seed+1);});
const ray=new THREE.Raycaster(),direction=new THREE.Vector3(),move=new THREE.Vector3();
function pick() {
  camera.getWorldDirection(direction);
  ray.set(camera.position,direction);ray.far=2.3;
  const hits=ray.intersectObjects(interactables,false);
  const found=hits.find(h=>h.object.visible&&h.object.userData.interaction);
  interacting=found?.object.userData.interaction??null;
  $('#prompt').style.display=interacting?'block':'none';
  if(interacting)$('#prompt').textContent='E  ·  '+interacting.label;
}
function update(dt){
  tick++;step(state,tick);
  for(const d of doors)d.pivot.rotation.y+=(d.target-d.pivot.rotation.y)*Math.min(1,dt*7);
  for(let i=0;i<lampLights.length;i++)lampLights[i].intensity=state.power?(i<4?1.25:1.9):.02;
  if(controls){
    const forward=(keys.has('KeyW')?1:0)-(keys.has('KeyS')?1:0);
    const strafe=(keys.has('KeyD')?1:0)-(keys.has('KeyA')?1:0);
    move.set(Math.cos(yaw)*strafe-Math.sin(yaw)*forward,0,-Math.sin(yaw)*strafe-Math.cos(yaw)*forward);
    if(move.lengthSq()>0)move.normalize().multiplyScalar(dt*(keys.has('ShiftLeft')?3.0:1.85));
    movement.computeColliderMovement(capsule,{x:move.x,y:0,z:move.z});
    const actual=movement.computedMovement(),p=body.translation();
    body.setNextKinematicTranslation({x:p.x+actual.x,y:.92,z:p.z+actual.z});
  } else {
    const p=body.translation();body.setNextKinematicTranslation({x:p.x,y:.92,z:p.z});
  }
  world.step();
  const p=body.translation();
  camera.position.set(p.x,1.62,p.z);camera.rotation.set(pitch,yaw,0,'YXZ');
  if(controls)pick();
}
function resize(){const w=innerWidth,h=innerHeight;camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h,false);}
window.addEventListener('resize',resize);resize();
const clock=new THREE.Clock();let accumulator=0;
function frame(){
  const dt=Math.min(.08,clock.getDelta());accumulator+=dt;
  let steps=0;while(accumulator>=1/60&&steps<5){update(1/60);accumulator-=1/60;steps++;}
  renderer.render(scene,camera);
  if(noticeUntil&&performance.now()>noticeUntil){$('#notice').textContent='';noticeUntil=0;}
  requestAnimationFrame(frame);
}
window.__umbralRemake={plan,state,scene,camera,world,renderer,seed}; // QA/debug reproducible
frame();
