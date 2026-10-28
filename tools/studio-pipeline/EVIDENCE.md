# Pipeline completo verificado

Kit 0.2.1 fijado a `0c146395985f6fc1f6cf7d836632795d678c55ef`, integrado en main mediante [studio-tools #8](https://github.com/Ratwaredev/studio-tools/pull/8), merge `11da4fc36f24d60838f8cea9968325cc9daca410`. Instalacion limpia npm ci y doctor pasan en los tres consumidores.

UMBRAL: sintaxis, cinco tests de audio, 19 referencias SHA-256 y build pasan. Se corrigieron dos entradas de manifiesto: PNGs validados por CRC y bytes iguales al commit inicial upstream 6e4f004; imagenes intactas, procedencia registrada en reference-provenance.json. Inicio, movimiento, linterna, apertura/cierre de puerta y audio real con cuatro loops pasan. Spector: 9.512 comandos en la captura sin advertencias. Juego procedural: no se inventa GLB.

La cadena final instalada pasa: 20/20 imagenes estables a tolerancia cero, defecto positivo detectado, fuga controlada y recuperacion correcta. AMD/D3D11 y memoria real Windows WDDM del proceso Chromium registrada (dedicada/compartida/committed; incluye compositor). Datos completos: [last-verification.json](last-verification.json).

Kit: 63/63 tests, cero omitidos. Matriz de candidatos y ensayos cerrados: docs/CONSUMABLE-20261028.md y docs/evidence/closure-20261028.json del kit. Los candidatos redundantes/incompatibles estan descartados, no pendientes de instalar. Sin GitHub Actions ni produccion; no constituye aceptacion F9 de los pedidos funcionales ajenos.
