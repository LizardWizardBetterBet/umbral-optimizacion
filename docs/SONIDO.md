# Diseño de sonido — lo más importante del juego

**Sensación objetivo:** el jugador aprende qué sonidos son normales en un edificio o una casa. Entonces detecta una imposibilidad minúscula. Miedo por comparación, no por volumen.

## Capas simultáneas

1. **Piso del lugar** (continuo, apenas audible): aire en conductos, zumbido de transformador, habitación de madera que se dilata, insectos lejos, tráfico amortiguado. Diferente por ambiente; NO un loop de viento universal.
2. **Sistemas localizables** (punto 3D): heladera, fluorescente, caldera, electricidad, cañería, radio, agua de desagüe. Obedecen energía/estado real del objeto.
3. **Meteorología y exterior:** viento filtrado por ventanas/cortinas; lluvia variable según techo o exterior; vegetación nocturna direccional.
4. **Jugador:** pasos según superficie, ropa, respiración tras correr, roce de la mano, interactuar con peso y resistencia; NO ruido de pasos idénticos ni respiración teatral permanente.
5. **Presencia:** sonidos causales: presión en bisagra, pasos que cambian de habitación, vibración estructural, un golpe detrás de la pared, timbre en otro piso, voz imperfecta si existe un sistema de imitación.
6. **Silencio:** reducción de una capa esperable es señal potente. Conservar ruido físico mínimo, nunca “mute total de todo el mundo” para forzar susto.

## Principios técnicos

- Audio Web Audio API / AudioListener y PannerNode, HRTF cuando sea viable; fuente con posición y atenuación real.
- No oír a través de 3 paredes con el mismo nivel: oclusión/filtrado de bajas y altas según puertas, materiales y pisos. Implementar **después** de validación base de spatialización.
- Un golpe en escalera tiene reverberación corta y reflexiones distintas de una habitación amueblada. Zona acústica basada en geometría, no reverb constante global.
- Sin jumpscare por defecto ni música anticipatoria que spoilee peligro. La IA puede manipular **fuentes existentes** con límites, no inyectar “screamer.mp3” en los auriculares.
- Contraste dinámico seguro: compresor/limitador en master; evitar picos imprevisibles y niveles dañinos. Dar controles separados para ambiente, efectos y voz.
- Escucha para solo y coop: proximidad opcional, atenuación por paredes, radio de corto alcance (más adelante). Nunca suplantar voz real de un compañero sin que los usuarios lo conozcan y acepten.

## Tres identidades sonoras

**Edificio:** cañerías, ascensor, persianas, pasos en losa, tráfico urbano apagado, ventana cerrada vibrando, vecinos ambiguos (¿existen?). Timbres, artefactos domésticos, cables.

**Casa rural:** hojas secas, chapas expandiéndose, alambre tenso, insectos con direccionalidad, perro muy lejano, agua de pozo, madera bajo peso; silencio relativo fuera de casa.

**Complejo subterráneo:** extracción de aire, pulsos de bomba, relés, motor que se detiene, agua goteando según superficie, eco de túnel, alarmas funcionales (no decorativas).

## Lo que trae el prototipo

Web Audio **sintetizado**, no samples profesionales. Genera ruido filtrado de ambiente y tonos de prueba, pasos cortos y golpes con panning 3D. Es una demostración de arquitectura, no la banda sonora aprobada. **No hay archivos de audio externos ni licencias dudosas**.

Siguiente iteración: incluir 12–20 grabaciones propias o de librerías con licencia comercial compatible, un manifiesto de procedencia y una matriz de zonas acústicas; escuchar con auriculares reales y grabar video con audio.
