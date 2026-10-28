import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {makeCase,initialState,action,senseSound,receiveObservation,step} from '../sim.mjs';
test('diez semillas: habitaciones conectables y pista existente',()=>{
 for(let seed=1;seed<=10;seed++){
  const p=makeCase(seed);
  assert.equal(p.rooms.length,3);
  assert.equal(new Set(p.rooms.map(r=>r.kind)).size,3);
  assert.ok(p.rooms.some(r=>r.id===p.clueRoom));
  assert.deepEqual(p,makeCase(seed));
 }
});
test('acciones idempotentes y puzzle completables',()=>{
 const p=makeCase(19),s=initialState(p);
 const open=action(p,s,{id:'1',tick:1,kind:'door',target:p.clueRoom});
 assert.equal(open.ok,true);
 assert.equal(action(p,s,{id:'1',tick:1,kind:'door',target:p.clueRoom}).ok,false);
 assert.equal(s.doors[p.clueRoom],true);
 assert.equal(action(p,s,{id:'2',tick:2,kind:'clue',target:p.clueRoom}).ok,true);
 assert.equal(action(p,s,{id:'3',tick:3,kind:'leave'}).ok,true);
 assert.equal(s.finished,true);
});
test('NPC no aprende acciones sin percepción verificable',()=>{
 const p=makeCase(2),s=initialState(p);
 assert.equal(s.npc.belief,null);
 action(p,s,{id:'1',tick:1,kind:'clue',target:p.clueRoom});
 assert.equal(s.npc.belief,null);
 const result=action(p,s,{id:'2',tick:2,kind:'door',target:p.clueRoom});
 const sense=senseSound(p,s,result.events[0]);
 if(sense)assert.equal(receiveObservation(s,sense),true);
 assert.equal(s.npc.heardCount,sense?1:0);
 assert.equal(receiveObservation(s,sense),false);
 step(s,500);
 assert.ok(s.npc.confidence>=0);
});
test('sin pista no hay salida y lectura no muta estado',()=>{
 const p=makeCase(11),s=initialState(p),before=structuredClone(s);
 assert.equal(action(p,s,{id:'exit',tick:0,kind:'leave'}).ok,false);
 assert.deepEqual(s,before);
});
