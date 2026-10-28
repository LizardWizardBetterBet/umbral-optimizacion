# Pipeline compartido

Instalar una vez: `npm ci --prefix tools/studio-pipeline --ignore-scripts`.

`node tools/studio-pipeline.mjs doctor` verifica la instalaci贸n fijada por commit.
`node tools/studio-pipeline.mjs probe --out artifacts/studio-<nombre-nuevo> --browsers <carpeta-Playwright>` corre el diagn贸stico en este juego. Usar un checkout aislado mientras haya otro agente editando.
`node tools/studio-pipeline.mjs assets --out artifacts/assets-<nombre-nuevo>` valida los assets reales.
`node tools/studio-pipeline.mjs atlas <ruta.glb>` detecta UV inv谩lidas/overlap; no reescribe el atlas.
`node tools/studio-pipeline.mjs ktx <entrada.png> <candidato.ktx2> --encoder <toktx.exe> --mode uastc` genera una copia offline.

El kit vive en este subproyecto de herramientas: no cambia dependencias, configuraci贸n, fuentes ni guardados del juego. No usa GitHub Actions ni accede a red al ejecutar el juego. No aprobar golden ni sustituir assets sin pasar sus gates. El mismo comando sirve a los otros dos juegos; la implementaci贸n pertenece a studio-tools.


Opciones del probe: `--hardware` mide GPU real si Chromium/D3D11 la expone; `--bvh` compara raycasts est醫icos sin cambiar fuentes; `--spector` captura WebGL. `compress-glb <original.glb> <nuevo.glb> --encoder <toktx.exe>` genera candidato KTX2; no sustituye assets. Las trazas se abren en Perfetto externo.
`probe --out <nueva> --functional --hardware` prueba inicio, movimiento, linterna, puerta y audio reales.

El repositorio del kit es privado: Git debe tener acceso HTTPS a Ratwaredev/studio-tools (por ejemplo mediante la autenticaci髇 GitHub habitual del equipo). El lock fija HTTPS y SHA; no requiere claves SSH ni rutas C:/RatLabStudio.
