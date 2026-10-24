# Prompt listo para Opus — UMBRAL

Trabajá sobre el proyecto incluido en este ZIP. Primero revisá `OPUS_HANDOFF.md`; después consultá los documentos de visión, mapas, entidades, audio y `docs/REUSE_GUIDE.md` cuando hagan falta. El código en `src/` es un prototipo técnico, no un juego terminado.

Tu objetivo inicial es convertirlo en un slice de horror jugable y convincente, siguiendo la identidad y los límites de `docs/VISION.md`. Elegí una parte pequeña del juego y cerrá el ciclo completo: espacio habitable, interacción, una entidad con percepción limitada y memoria de la partida, efectos materiales persistentes, audio espacial y respuesta jugable. El comportamiento debe producir causas comprensibles sin volverse repetitivo ni omnisciente. No presentes el director por reglas como aprendizaje automático.

Mantené la escala adecuada al slice. Primero entiende y ejecuta el código que ya existe. No agregues subsistemas, dependencias ni mapas por anticipado. Revisá el resultado en ejecución y diferenciá claramente lo que compiló, lo que corriste y lo que observaste visualmente.

`optional-reuse/` contiene 30 módulos TypeScript y 16 scripts de desarrollo/QA de Orbital y RPG organizados por NPC/percepción, navegación/física, entornos, animación humana, captura y validación. No se compilan ni se importan en UMBRAL; sus imports y comandos dependen de sus proyectos de origen. Consultá `docs/REUSE_GUIDE.md` para elegir solo una pieza que resuelva un problema concreto. Podés ignorar todas las referencias, adaptar una idea o crear sistemas propios. No migres proyectos ni agregues toda la carpeta al build.

Seguí el resto del alcance, la dirección y los límites de verificación de `OPUS_HANDOFF.md` y `docs/`. Al cerrar, resume cambios, comandos y comprobaciones realmente ejecutados, evidencia visual observada y bloqueos concretos.

