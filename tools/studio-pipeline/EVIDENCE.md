# VerificaciÃ³n del consumidor

Kit fijado: `f4187952ea8f82faf5ce06b3e79887684ffd5262` ([PR #8](https://github.com/Ratwaredev/studio-tools/pull/8)). Las decisiones completas del radar y ensayos estÃ¡n en docs/CONSUMABLE-20261028.md del kit. Capturas son diagnÃ³stico, no golden aprobado. Sin GitHub Actions ni producciÃ³n.

Base probada: 2e4bfce (upstream/main aislado). Build, sintaxis y tests existentes de audio pasan. Inicio con botÃ³n real y pointer lock concedido; movimiento nativo 0,84 m, linterna, apertura/cierre de puerta y WebAudio running con cuatro loops pasan. Parte de las acciones se ejercita con la API de simulaciÃ³n nativa: no equivale a aceptar todos los controles manuales.

Probe AMD/D3D11: 20 imÃ¡genes estables con tolerancia cero, defecto positivo detectado, recursos propios recuperan baseline. Spector: 9.512 comandos, cero advertencias tras espiar el contexto antes de compilar shaders. Evidencia completa del kit: artifacts/umbral-spector-fixed-02/report.json. VRAM de proceso no expuesta.

Bloqueo previo del check global: referencias/umbral_casa_rural.png no coincide con MANIFIESTO.json (esperado 2b9f699b09fe4c562d0b4423049cf1a389caaf3b1435b217031347004661a50b, actual 40ba8ca13edecd71e53abacb8c637697d12af31db225f56ea0475bbe2f2da13e). No se modificÃ³ imagen ni manifiesto para ocultarlo. Este PR solo agrega herramientas.

Última comprobación desde instalación limpia del SHA final: [last-verification.json](last-verification.json). Pasó con 20/20 imágenes estables, defecto visual y fuga positiva detectados, recuperación correcta y cero errores. Esta repetición usa SwiftShader; la medición AMD previa se conserva por separado.
