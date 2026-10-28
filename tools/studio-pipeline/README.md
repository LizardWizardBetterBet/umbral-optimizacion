# Pipeline compartido 0.2.1

El kit esta integrado en main de Ratwaredev/studio-tools y fijado por commit en package-lock.json. Requiere Node >=24 y acceso Git HTTPS al repositorio privado. No requiere rutas personales ni claves SSH.

```sh
npm ci --prefix tools/studio-pipeline --ignore-scripts
node tools/studio-pipeline.mjs doctor
node tools/studio-pipeline.mjs pipeline --out <carpeta-nueva> --browsers <Playwright> --hardware
```

pipeline prepara los modelos reales, valida semantica/rig/atlas/hashes y carga esas salidas por manifiesto en el juego real. Rechaza sobrescrituras y assets cambiados tras validar. No sustituye originales ni agrega dependencias al bundle del juego. Windows mide memoria dedicada/compartida/committed del proceso GPU Chromium; incluye compositor.

Opciones: --spector captura WebGL; --bvh compara raycasts estaticos sin modificar fuentes; --hardware usa Chromium completo/D3D11. Datos y resultados: EVIDENCE.md y last-verification.json.

Otros comandos: assets, prepare-assets, optimize, atlas, ktx, compress-glb, rig y retarget. Los comandos ktx/compress-glb usan --encoder <toktx.exe> externo. rig <modelo.glb> inspecciona capacidades. retarget <source.glb> <target.glb> <clip.json> <nuevo.clip.json> usa SkeletonUtils y valida conservacion del rig, sin sobrescribir archivos. El kit incluye fixtures/animation/rpg-native-walk.clip.json capturado del Animator real.

Decisiones, versiones, licencias y ensayos cerrados: docs/CONSUMABLE-20261028.md del kit. Sin GitHub Actions, servicios de red runtime ni produccion. Los golden requieren juicio humano.

Agregar --functional al pipeline para inicio, movimiento, linterna, apertura/cierre de puerta y audio real. UMBRAL es procedural: no se inventan GLB. Las dos correcciones de manifiesto preservan las imagenes originales; procedencia en reference-provenance.json.
