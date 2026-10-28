# UMBRAL Remake · slice procedural v0

**Rama de trabajo, no aprobada visualmente, no mergear a main.** El prototipo original en la raíz del repo permanece intacto. Esta versión vive en `/remake/`.

## Ejecutar
Con Node >= 22.12 y las dependencias ya declaradas en el package raíz:
```bash
npm ci
npm run dev
```
Abrir `http://127.0.0.1:5173/remake/?seed=11` (si Vite asigna otro puerto, sustituirlo). Para correr las pruebas puras:
```bash
node --test remake/tests/sim.test.mjs
```
**Estos comandos no se han ejecutado en el PC del usuario ni se certificó QA visual/audio.** El ejecutable usa WebGL, pointer lock y WebAssembly Rapier.

## Qué cambia
- Mundo nuevo: pasillo y tres habitaciones arquitectónicamente conectadas. Cada seed redistribuye uso de habitación, mobiliario y lugar de la pista; sin habitaciones inaccesibles.
- Física del jugador y puertas cerradas con Rapier, no traslación libre a través de paredes. E para abrir/cerrar puertas, interactuar con interruptor, encontrar una nota y salir.
- Luces en luminarias fijas; un circuito cambia su estado. **No llueve adentro**.
- Eventos auditables, idempotencia, pistas/estado persistibles en memoria, sonido como observación condicionada por distancia y puertas. **Todavía no incorpora el núcleo NPC común ni entidades visuales**.
- `window.__umbralRemake` expone estado y renderer para QA. Test de semillas + sensor + puzzle + idempotencia.

## Lo que NO está terminado
Arte/sensación aprobados por dueño; audio espacial final; animación; verdaderos NPCs; multi 1–4; motor de layouts infinitos; pruebas reales de browser/render/perf/save. No confundir MVP de arquitectura con terror logrado. La señora del prototipo anterior sigue en la versión original, **no se borra**.

## Próximos gates
1. Abrir 10 seeds + revisar colisiones, puertas y salida; cero pop de luces/luz que siga a cámara; tres capturas desde lugares fijos.
2. Conectar paquete privado de NPC compartidos mediante adapter y comprobar que no aprende escondites no percibidos.
3. Construir dirección visual y sensorial nueva con Opus: arte, composición, materiales, personajes, sonido y director procedural de tensión, sin importar los assets del prototipo.
4. Integrar QA local del estudio y benchmark Vega 7; luego cooperación y networking.

## Privacidad
Este repositorio es **público**. No copiar fuentes privadas de ORBITAL/RPG ni archivos de `ratlab-studio` aquí sin autorización expresa. El código de este slice es nuevo e independiente de esos proyectos.
