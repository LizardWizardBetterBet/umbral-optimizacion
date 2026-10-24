# Handoff directo a Opus — UMBRAL

Usá este proyecto **tal como está**. Abrí las referencias locales; **no busques referencias en Internet ni me hagas generar otras por defecto**. No vuelvas a explicar el brief, ejecutá.

**Meta:** convertir este banco técnico en un slice vertical de horror con una entidad que observa, aprende patrones de los jugadores **dentro de la partida** y crea escenas causales. Solo/coop 1–4 eventual; primero validar SOLO. No hacer un clon de Phasmophobia ni un walking simulator basado en sustos preprogramados.

**Prioridades (en orden):**
1. Instalar (`npm install`), comprobar `npm run check`, `npm run build` y abrir en navegador. Corregir fallos reales. **No declarar validación visual sin mirar capturas.**
2. Elegir **un solo mapa** para hacer convincente: arquitectura habitable, colisiones, proporciones, iluminación físicamente creíble, puertas/objetos usables, ruta de entrada/salida.
3. Diseñar y **escuchar** un paisaje sonoro con capas, distancia, oclusión y pausas; sustituir audio procedural de prueba con recursos libres/comerciales licenciados y conservar fuentes/atribuciones. No abusar de música ni de golpes de volumen.
4. Una sola entidad con sensores limitados, memoria de decisiones del jugador, objetivos cambiantes y consecuencias observables. Nunca omnisciente. No patrullas repetitivas. Construir primero 3 demostraciones distintas jugables, no 30 variantes que se sientan iguales.
5. Mirar el resultado renderizado y corregir lo ridículo: escala, objetos, postura, puertas, luz, clipping, sonido mal ubicado. Probar varias partidas; comparar si realmente producen **historias** distintas.

**Dirección visual:** horror materialista con anomalías discretas; arquitectura argentina fines 80/90 y otros espacios reales, no sepia mojada genérica. Estilo y materiales definidos en `docs/VISION.md`; mirar también `docs/MAPAS.md`. Horror del comportamiento antes que del diseño anatómico.

**No consumir tokens de más:** leer archivos por necesidad, no repetir búsquedas/documentación ya adjunta, no generar infinitos planes, no sobreingeniería, no hacer 3 mapas completos antes de aprobar 1. No agregar UI ni features sin uso. Terminar con video/capturas reales, pruebas, diff y próximos bloqueos concretos.

**Alcance real del código incluido:** geometría prototipo, audio Web Audio procedural, director por reglas + memoria, interacción básica, Rapier para objetos demo. No hay multiplayer, network, ML real, ni assets modelados. **El trabajo principal de arte y gameplay sigue pendiente.**


## Referencias opcionales de Orbital y RPG

Consultá `docs/REUSE_GUIDE.md` si una pieza de NPC, percepción, navegación, ambiente, colisión o animación puede resolver un problema concreto de UMBRAL. Hay 30 módulos de juego y 16 scripts de desarrollo/QA bajo `optional-reuse/`, preservados como referencias aisladas. No se importan al juego ni agregan dependencias. Podés ignorarlos, adaptar una idea o escribir tu propia solución. No se encontró un módulo fuente compartido entre esos repositorios. `OPUS_PROMPT_READY.md` contiene el prompt breve listo para copiar.

