// Dominio puro y reproducible: no Three, Rapier, navegador ni audio.
export function randomFromSeed(seed) {
  let s = (Number(seed) >>> 0) || 1;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const SLOTS = Object.freeze([
  { id:'a', side:-1, z:4.5, width:4.4, depth:4.9 },
  { id:'b', side:1,  z:9.5, width:4.4, depth:4.9 },
  { id:'c', side:-1, z:13.5,width:4.4, depth:4.9 },
]);
export function makeCase(seed=11) {
  const rand=randomFromSeed(seed);
  const kinds=['study','kitchen','bedroom'];
  for(let i=kinds.length-1;i>0;i--){const j=Math.floor(rand()*(i+1));[kinds[i],kinds[j]]=[kinds[j],kinds[i]];}
  const rooms=SLOTS.map((slot,i)=>({...slot,kind:kinds[i],detail:Math.floor(rand()*3)}));
  return {version:1,seed:Number(seed)>>>0,rooms,clueRoom:rooms.find(r=>r.kind==='study').id,
    entry:{x:0,z:16.4},exit:{x:0,z:17.7},breaker:{x:0.8,z:1.0}};
}
export function initialState(plan) {
  return {version:1,seed:plan.seed,tick:0,power:true,doors:Object.fromEntries(plan.rooms.map(r=>[r.id,false])),
    clue:false,finished:false,events:[],npc:{pos:{x:0,z:2.2},belief:null,confidence:0,heardCount:0}};
}
export function action(plan,state,request) {
  if(!request || !Number.isSafeInteger(request.tick)||request.tick<state.tick || typeof request.id!=='string')
    return {ok:false,reason:'invalid-request',events:[]};
  if(state.events.some(e=>e.requestId===request.id))return {ok:false,reason:'duplicate',events:[]};
  let sound=null,kind='',at={x:0,z:0};
  if(request.kind==='door') {
    const r=plan.rooms.find(r=>r.id===request.target);
    if(!r)return {ok:false,reason:'missing-door',events:[]};
    state.doors[r.id]=!state.doors[r.id];
    kind=state.doors[r.id]?'door-open':'door-close';at={x:r.side*1.6,z:r.z};sound=6.5;
  } else if(request.kind==='breaker') {
    state.power=!state.power;kind=state.power?'power-on':'power-off';at=plan.breaker;sound=7;
  } else if(request.kind==='clue') {
    if(request.target!==plan.clueRoom)return {ok:false,reason:'wrong-room',events:[]};
    if(state.clue)return {ok:false,reason:'already-collected',events:[]};
    if(!state.doors[request.target])return {ok:false,reason:'clue-not-accessible',events:[]};
    state.clue=true;kind='clue-found';at={x:plan.rooms.find(r=>r.id===request.target).side*4,z:plan.rooms.find(r=>r.id===request.target).z};sound=0;
  } else if(request.kind==='leave') {
    if(!state.clue)return {ok:false,reason:'evidence-required',events:[]};
    state.finished=true;kind='exited';at=plan.exit;sound=0;
  } else return {ok:false,reason:'unknown-action',events:[]};
  state.tick=request.tick;
  const event={id:state.events.length+1,requestId:request.id,tick:state.tick,kind,at,volume:sound};
  state.events.push(event);
  return {ok:true,events:[event]};
}
// ÚNICA entrada de conocimiento: un evento que el sensor realmente detectó.
// Puertas cerradas atenúan. No hay lectura de la ubicación real del jugador.
export function senseSound(plan,state,event) {
  if(!event || !event.volume)return null;
  const dist=Math.hypot(event.at.x-state.npc.pos.x,event.at.z-state.npc.pos.z);
  if(dist>event.volume)return null;
  const room=plan.rooms.find(r=>Math.abs(event.at.x)>1.65 && Math.sign(event.at.x)===r.side && Math.abs(event.at.z-r.z)<r.depth/2);
  const attenuation=room && !state.doors[room.id] ? 0.35:1;
  if(dist>event.volume*attenuation)return null;
  return {id:event.id,tick:event.tick,kind:event.kind,at:{...event.at},modality:'heard',confidence:Math.max(.1,1-dist/(event.volume*attenuation))};
}
export function receiveObservation(state,observation) {
  if(!observation || observation.modality!=='heard' || !Number.isFinite(observation.confidence))return false;
  if(state.npc.belief?.id===observation.id)return false;
  state.npc.belief=structuredClone(observation);
  state.npc.confidence=observation.confidence;
  state.npc.heardCount++;
  return true;
}
export function step(state,tick) {
  if(!Number.isSafeInteger(tick)||tick<state.tick)return;
  const delta=tick-state.tick;state.tick=tick;
  state.npc.confidence=Math.max(0,state.npc.confidence-Math.min(delta,3600)*0.0002);
}
