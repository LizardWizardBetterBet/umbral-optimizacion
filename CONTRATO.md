# Contrato interno de la vertical slice (dos agentes en paralelo)

Slice: **Caso 01 — "1°B, la señora Ríos"**. Planta baja de un edificio porteño de fines de los 80
(estilo de `referencias/`: pared a dos tonos verde/marfil, calcáreo, madera oscura, tungsteno, ascensor de reja).

Elena Ríos (71) vive sola en el 1°B hace 40 años. Desaparecida hace 9 días. Los vecinos siguen oyendo
su televisor y su voz "hablando con alguien". La sobrina nos contrata: encontrarla o saber qué pasó, y
recuperar los casetes donde Elena grababa "al que vive en la casa". La entidad es una **imitadora**:
aprende sonidos y voces (incluida la voz real del jugador si habilita el micrófono) y puede adoptar la
forma de Elena. En el espejo no se refleja.

## Espacios (roomId) y superficies
| roomId | qué es | superficie de pasos | reverb |
|---|---|---|---|
| `zaguan` | entrada desde la calle, buzones, puerta de calle | `mosaic` | `hall` |
| `pasillo` | pasillo largo de calcáreo, puertas 1A/1B, ascensor de reja, escalera | `mosaic` | `hall` |
| `hueco` | cuarto bajo la escalera | `wood` | `closet` |
| `patio` | patio interior a cielo abierto, lluvia | `wet` | `outdoor` |
| `lavadero` | lavadero común + tablero eléctrico | `concrete` | `tile` |
| `hall1b` | recibidor del 1°B | `parquet` | `small` |
| `living` | living-comedor (TV, mesa, espejo, reloj) | `carpet` (alfombra) / `parquet` | `room` |
| `cocina` | cocina (heladera) | `ceramic` | `tile` |
| `dormitorio` | dormitorio (placard = escondite) | `parquet` | `room` |
| `bano` | baño (espejo, bañadera) | `ceramic` | `tile` |
| `calle` | vereda exterior (salida) | `wet` | `outdoor` |

## Audio — `src/audio/` (Agente B)
```js
import { AudioEngine } from './audio/AudioEngine.js';
const audio = new AudioEngine();
await audio.start();                     // tras gesto del usuario
audio.setAcoustics({ rooms, portals, roomAt });
//   rooms:   { [roomId]: { reverb, size:[w,h,d], center:{x,y,z}, outdoor?:bool } }
//   portals: [{ id, a, b, pos:{x,y,z}, getOpen: () => 0..1 }]   // puertas, ventanas (0.15 fija), aberturas (1)
//   roomAt(pos) -> roomId
audio.setListener(pos, forward, roomId);  // cada frame
audio.play(name, { pos, roomId, gain=1, rate=1 }) -> { stop() }
audio.loop(name, { pos, roomId, gain=1 }) -> { setGain(g, t), setPos(pos, roomId), stop() }
audio.footstep({ surface, intensity /*0..1*/, pos, roomId, by:'player'|'entity'|'elena' })
audio.setPower(zone, on)                  // zone: 'building'|'1b' — apaga zumbidos/heladera/tubo
audio.mic.enable() -> Promise<bool>;  audio.mic.level() -> 0..1;  audio.mic.capture(seconds) -> Promise<AudioBuffer|null>
audio.playBuffer(buffer, { pos, roomId, gain, color:'raw'|'tape'|'wall' }) -> { stop() }
audio.tape(id, { pos, roomId }) -> { stop(), duration }   // casete con "voz" degradada (balbuceo formántico) + hiss
audio.music(cue)                          // 'none' | 'dread' | 'chase' | 'end' — usar muy poco
audio.update(dt)
```
Pura, sin WebAudio, testeable: `src/audio/propagation.mjs`
```js
export function propagate(fromRoom, toRoom, portals, roomCenters) -> { gain /*0..1*/, muffle /*0..1*/, via /*portal pos o null*/, path:[roomId] }
```
La usan el motor de audio **y** la entidad para oír. Ruido de puertas cerradas, distancia, paredes.

Nombres de sonido mínimos: `door_open`, `door_open_slow`, `door_close`, `door_slam`, `door_locked`,
`knock`, `knock_soft`, `switch`, `breaker`, `breaker_main`, `tube_start`, `drawer_open`, `drawer_close`,
`pickup_paper`, `pickup_small`, `keys`, `key_turn`, `cassette_insert`, `tv_on`, `tv_off`, `floor_creak`,
`pipe_knock`, `glass_tap`, `breath`, `wardrobe_open`, `wardrobe_close`, `elevator_gate`, `elevator_motor`,
`water_drip`, `chair_scrape`, `object_fall`, `whisper`, `death`.
Loops: `rain`, `city`, `building_hum`, `fridge`, `clock`, `tube_hum`, `tv_static`, `tv_program`, `drip`, `entity_breath`.

## Cuerpo de la entidad — `src/entity/Body.js` (Agente B)
```js
import { createEntityBody } from './entity/Body.js';
const body = createEntityBody({ guise: 'elena' | 'wrong' });  // 'elena' = mujer mayor con batón; 'wrong' = misma figura con proporciones/postura incorrectas
scene.add(body.root);                     // origen en los pies, mira hacia +Z local
body.update(dt, { speed /*m/s*/, mode, lookAt /*Vector3|null*/ });
//   mode: 'idle'|'walk'|'stalk'|'run'|'still'|'peek'|'reach'|'crouch'|'turn_head'
body.setWrongness(0..1);                  // 0 humano creíble, 1 imposible (cuello, brazos, cabeza girada)
body.root.layers: capa 0 normal; el código de espejos excluye la capa 2 -> el cuerpo de la entidad se pone en capa 2 cuando es la imitadora
```
Elena real usa el mismo cuerpo con `wrongness=0`.

## Lo que hace el Agente A (no tocar sin avisar)
`src/main.js`, `src/core/*`, `src/world/*`, `src/game/*`, `src/entity/Brain.mjs`, `src/entity/Entity.js`, `index.html`, `src/style.css`.

## Notas de B
- `propagation.mjs` LISTO. Firma: `propagate(fromRoom, toRoom, portals, roomCenters, opts?)`. `roomCenters` acepta `{id:{x,y,z}}` o directamente `rooms` (`{id:{center}}`). `opts = { fromPos, toPos }` opcional (mejora la distancia real del camino). Devuelve además `dist` (m recorridos por portales) y `portalGain` (sólo pérdida por portales, sin distancia). Portal: `getOpen()` o `open` numérico; opcional `closedLossDb` (default 18) y `closedMuffle` (0.82) por portal (p.ej. puerta de calle más gruesa). Sin camino -> `gain 0, muffle 1, path []`.
  Para la entidad: `gain` ya incluye distancia (2 m = 1, luego 2/d). Umbral sugerido para "oír": `intensidadFuente * gain > ~0.08`.
- `AudioEngine` LISTO (API del contrato completa). Extras: `audio.setVolume('master'|'sfx'|'amb'|'voice'|'music', v)`; `audio.ambience = false` apaga los eventos esporádicos automáticos (crujidos de piso en 1B/hueco, cañerías en pasillo/lavadero/baño/cocina, vecino de arriba, canaleta en patio) que se ubican usando `rooms[].center/size`; `audio.tapeInfo(id) -> { duration, phrases:[{start,end,text}] }` (tiempos para subtítulos; `tape()` devuelve también `phrases`); `audio.setTapeScript(id, lines)` para cambiar el texto (el ritmo silábico sale del texto); `audio.mic.recent(sec)` = últimos N s ya oídos (buffer circular de 10 s, sin esperar) y `mic.disable()`. `capture()` devuelve null si no hubo voz (recorta silencios y normaliza).
  Loops con vida propia: `fridge` arranca/corta solo (clunk + gorgoteo), `tube_hum` titila solo (`handle.onFlicker = (dur)=>{}` para sincronizar la luz; `handle.flicker()` para forzarlo), `city` trae colectivos y perro lejano, `rain` trae canaleta y gotas en chapa, `drip` es goteo irregular (sin buffer en loop). `rain`/`city`/`building_hum` son difusos cuando el oyente está en el mismo cuarto y entran por portales (ventanas) cuando no. Zonas de `setPower`: `building_hum` = 'building'; fridge/tube/tv en cuartos del 1B = '1b', si no 'building'; 'building' apagado apaga también '1b'.
  Generación: todo se sintetiza en un Web Worker (`gen.worker.js`) al llamar `start()` (~5-8 s en segundo plano); si algo se pide antes, se genera en el hilo principal (casetes ≈0.7 s).
- `Body.js` LISTO. Extras: `body.setLayer(n)` (Object3D.layers NO se hereda: usar esto para poner toda la malla en capa 2), `body.joints` (grupos: hips, spine, chest, neck, head, shoulderL/R, upperArmL/R, foreArmL/R, handL/R, thighL/R, shinL/R, footL/R), `body.head`, `body.dispose()`. `guise:'wrong'` arranca con wrongness 0.65. Con wrongness > 0.35 al frenar puede quedar congelada a mitad de paso 1-3 s; con 'still' y wrongness > 0.2 quietud total (ni respira). Labs: `/audio-lab.html`, `/body-lab.html?mode=walk&w=0.5` (dev server).
