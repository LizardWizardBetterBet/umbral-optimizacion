# Auditoría de rendimiento

## Alcance

Se revisaron el render, las sombras, los espejos, el clima y las actualizaciones por cuadro. Los cambios mantienen el diseño y las reglas de la partida.

## Cambios aplicados

- El render y sus tres pasadas de pantalla completa usan una relación de píxeles máxima de 1.0. Antes llegaba a 1.25 en pantallas de alta densidad; eso procesaba hasta 56 % más píxeles que 1.0 (1.25² = 1.5625).
- La sombra dinámica de la linterna usa un mapa de 512×512 en lugar de 1024×1024, con un cuarto de los texeles de sombra.
- Si el navegador bloquea Pointer Lock, la cámara se puede seguir girando con arrastre del mouse. Pointer Lock sigue siendo el control principal cuando está disponible.

## Hallazgos para futuras mediciones

- El shader de película lee tres muestras de color por píxel; después se aplica la conversión de salida. El costo crece con la resolución de la ventana.
- Los dos espejos cercanos renderizan la escena en texturas de 512×512. Pueden añadir dos pasadas cuando el jugador se acerca.
- La lluvia actualiza 2.600 gotas y hasta 400 salpicaduras en cada cuadro.
- La falda de la entidad actualiza sus vértices y recalcula normales durante la animación.
- La iluminación de escenas y el render de Three.js deben medirse en el navegador y en hardware objetivo para separar límites de GPU de límites de CPU.

## Verificación

- La escena cargó en el navegador, se inició una partida y se comprobó el giro de cámara mediante arrastre del mouse. El HUD y el aviso de interacción aparecieron. No se pudo obtener una medición fiable de FPS ni una comparación visual antes/después.
- `npm run build` completó. Vite informa que el bundle principal supera los 500 kB minificados.
- Sintaxis y las cinco pruebas de audio pasaron. `npm run check` se detuvo en `verify-references.mjs`: el SHA-256 de `referencias/umbral_casa_rural.png` no coincide con el manifiesto existente. El PNG no se modificó en este trabajo.
