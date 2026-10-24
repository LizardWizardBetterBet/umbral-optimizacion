# UMBRAL: vertical slice, Caso 01

Este es un juego de horror psicológico en primera persona, hecho con Three.js y Web Audio. El caso transcurre en **Moreno 1418, 1°B, en octubre de 1991**.

## Ejecutar
Hace falta Node 22.12 o posterior. En Windows alcanza con `INSTALAR_WINDOWS.bat`. También se puede correr `npm install` y después `npm run dev`. Una vez levantado, abrí http://127.0.0.1:5173/ con auriculares.

## Controles
| Tecla | Acción |
|---|---|
| WASD | caminar |
| Shift | correr (consume aire) |
| C | agacharse |
| E | usar |
| E mantenida | puerta despacio y en silencio, o forzar la puerta del 1°B |
| Q | golpear la puerta que mirás |
| F | linterna |
| R | escuchar casete |
| Tab | libreta |

## El caso
Elena Ríos lleva nueve días desaparecida. El encargado dejó la llave "donde siempre"; mirá en el buzón. Cada noche cambian varias cosas, según una semilla:

- dónde está Elena: bajo la escalera, en la baulera o ya no está;
- dónde quedó la llave;
- si el 1°B tiene luz;
- el temperamento de la entidad: paciente, territorial o cazador.

Lo que vive en el 1°B imita sonidos y voces, y usa la forma de Elena. No se refleja en los espejos. Todo lo que hace lo hace físicamente, en algún lugar del edificio:

- prender el televisor;
- bajar una térmica del tablero;
- apretar el pulsador de luz del pasillo;
- cerrar la puerta que dejaste abierta;
- mover una silla;
- golpear como golpeaste vos;
- dejarte un casete;
- repetir tu voz, si activaste el micrófono.

Además recuerda qué hacés y se adapta: tus escondites, la linterna, las puertas que cerrás al huir, tus rutas de escape y los señuelos que ignorás. Al final, la partida te muestra lo que aprendió de vos.

## QA
- `?seed=N&elena=hueco|baulera|gone&temper=paciente|territorial|cazador` fija una variante.
- `?shot=x,y,z,yaw,pitch&lights&torch` arma una captura estática. Para hacerla corré `node tools/shot.mjs nombre=...`.
- `tools/smoke.mjs` y `tools/playtest.mjs` corren partidas automáticas sin renderizar (requieren `npm i -D playwright` y `npm run dev` corriendo).

## Rendimiento
- La resolución interna del render se limita a 1× para reducir el costo de las pasadas de postproceso en pantallas de alta densidad.
- La sombra dinámica de la linterna usa un mapa de 512×512 para aliviar la GPU.
- El mouse queda capturado durante la partida: mueve la cámara sin mantener clic y se libera al pausar con Escape. Si el navegador rechaza la captura, la partida queda en pausa.
- Ver [docs/AUDITORIA_RENDIMIENTO.md](docs/AUDITORIA_RENDIMIENTO.md) para el relevamiento y las limitaciones de medición.

## Arquitectura
| Carpeta | Contenido |
|---|---|
| `src/world/` | plano (`layout.js`), arquitectura, materiales procedurales, mobiliario, luces con interruptores y zonas eléctricas, lluvia |
| `src/core/` | render y post, jugador |
| `src/game/` | interacción, caso, finales, Elena |
| `src/entity/` | cuerpo, navegación, cerebro de la entidad |
| `src/audio/` | motor de audio procedural, propagación entre cuartos, voz, micrófono |

Para el multijugador, todas las reglas leen de `game.players` y todo lo audible pasa por `game.noise()`. Una sesión en red tendría que alimentar a los jugadores remotos y sus eventos de ruido y de voz por esas dos vías. No hay red implementada.
