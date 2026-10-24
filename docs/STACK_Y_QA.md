# Stack local + límites

- **Three.js 0.186.1:** escena 3D, luz, geometría, cámara. WebGLRenderer para maximizar compatibilidad (Vega integrada). https://threejs.org/docs/
- **Vite 8.3.4:** entorno local y bundle web. https://vite.dev/guide/
- **Rapier 0.21.0 compat:** colisión/dinámica para props de demostración, WASM integrado al paquete (más pesado pero simple de empaquetar). https://rapier.rs/docs/
- **Web Audio API:** espacialización y síntesis de prueba, luego assets y salas acústicas. https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API
- **JavaScript ESM modular:** a propósito sin React/R3F para no cargar UI ni multiplicar abstracciones del gameplay. Migrar a TS **solo cuando el slice esté estable**; no hay nada que instalar aparte del `npm install`.
- **Node.js >=22.12**, 24 recomendado. Sin backend, BD ni API Keys.

Versiones contrastadas en octubre de 2026 con npm público, pero la instalación local de este ZIP no pudo probarse por falta de conectividad al registro.

## QA mínimo

1. `npm install`, `npm run check`, `npm run build`, `npm run dev`.
2. Probar navegación y **E** en puerta con el mouse bloqueado en los 3 escenarios.
3. Escuchar pasos, tono base y golpe direccional con auriculares; el audio requiere click del usuario.
4. Observar 10–15 min: no debe saturar eventos, no saltos de volumen. Director por sesión, **no** modelos ML reales.
5. Comparar screenshots reales contra la intención del arte, corregir superficies mojadas sin causa, proporciones, clipping y luminarias sin fuentes coherentes.
6. Escena navegable en AMD Vega 7/8 a 720p/900p con profiling real (meta de rendimiento, no validado).

No generar pre-render falso y decir que es screenshot. No poner multijugador superficial que no sincroniza IA/puertas. No marcar como probado el build hasta correr en una máquina con npm.
