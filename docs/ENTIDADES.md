# Entidades: voluntad antes que apariencia

En un mapa podría operar 1 sola entidad con estrategias y manifestaciones; no colección fija de “fantasmas” con 4 pistas. Las láminas son **exploración**, algunas contienen clichés (niñas, dentaduras, tentáculos) a descartar.

## 1 / Suplantador

Objetivo: influir en decisiones sociales. Observa patrones: quién va primero, quién cierra puertas, quién se separa. Usa objetos, siluetas o voces **ficticias del juego**, no clonación de personas reales. Puede cometer errores consistentes: postura demasiado quieta, retraso de respuesta, repetición de un hábito mal interpretado. En coop puede aparecer donde el otro jugador no está. Nunca teletransportarse frente al jugador.

## 2 / Presencia territorial

No necesita cuerpo. Actúa mediante circuitos, llaves, puertas, objetos y sonido. Su objetivo depende del mapa: mantener cerrado un sector, recuperar un objeto, echar invasores, pedir ayuda de forma incomprensible. Puede advertir o atacar; su agencia se deduce por el resultado de varias interacciones.

## 3 / Depredador

Físico, mortal, limitado: oye, ve, recuerda dónde detectó a alguien, pierde el rastro, puede experimentar con una ruta si fue testigo de ella. No corre en círculo en un navmesh fijo. Puede dejar ir al jugador. Ante un ataque existe un margen verificable para reaccionar; nada de instakill aleatorio por detrás.

## Motor de decisión deseado

- **Percepción:** eventos con posición, alcance sensorial, información incierta, fecha y confianza. La entidad **no lee el estado global del jugador** por arte de magia.
- **Memoria de partida:** jugador A usa linterna, B se esconde bajo mesa, C siempre va a salida Norte. Reforzar hipótesis solo tras observaciones.
- **Necesidades internas:** curiosidad, control del territorio, autoprotección, hambre/agresión (solo cuando aplique), incertidumbre.
- **Planificación:** utilidad/GOAP + reglas espaciales. No LLM en tiempo real en el loop. El LLM opcional offline puede diseñar variaciones narrativas **antes de la partida**.
- **Director de tensión:** separa presión ambiental del comportamiento de la entidad y asegura períodos respirables. NO inyecta sustos arbitrarios.
- **Estado persistente:** si abre una puerta, queda abierta; si derriba una silla, queda movida; si corta la electricidad, hay causa restaurable.
- **Multijugador:** servidor autoritativo para posiciones, visibilidad y decisiones; nunca confiar en el cliente para resultados. Más adelante, no en este starter.

`src/game/Director.mjs` implementa solo una **demostración mínima** de memoria (observa correr/cerrar puertas), pondera eventos y evita repeticiones. No inteligencia general, ML ni comportamiento final. Tests incluidos.

## Rasgos visuales

Evitar modelo 3D genérico de zombi con locomoción obvia. Primero una silhouette controlada con paradas y transiciones físicas convincentes. Lo que asusta es que se quede parada donde **no debería**, que manipule objetos con intención, que mantenga distancia, que no mire hacia vos cuando parece conocerte. Pasadas las primeras apariciones debe seguir siendo impredecible por conducta.
