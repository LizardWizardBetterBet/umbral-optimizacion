// Narrative material for Caso 01. Rioplatense Spanish, period-accurate (octubre de 1991).

export const BRIEF = {
  title: 'Caso 01 · Moreno 1418, 1°B',
  lines: [
    'Elena Ríos, 71 años, viuda. Vive sola en el 1°B desde 1952.',
    'Nadie la ve hace nueve días. Los vecinos siguen escuchando su televisor y su voz, de noche, "hablando con alguien".',
    'La sobrina, Marta, nos pide que entremos. Quiere a su tía, o quiere saber qué pasó.',
    'Elena grababa casetes. Le dijo a Marta que eran "para cuando no le creyeran".',
    'El encargado, Tito, no quiere entrar. Dijo que dejó la llave "donde siempre".',
  ],
};

export const READ = {
  cartelera: ['Cartelera del consorcio', 'EXPENSAS OCTUBRE 1991 — vencimiento día 10.\n\nSra. RÍOS (1°B): favor comunicarse con la administración.\n\nSe ruega no golpear las cañerías de noche. Algunos vecinos se quejan de golpes en el 1°B a las 3 de la mañana.'],
  cartas: ['Sobres sobre la mesa', 'Tres sobres sin abrir, todos de la administración. El matasellos más viejo es del 2 de octubre.\nDebajo, en una servilleta, con la letra temblorosa de Elena:\n"No contestarle. No decir mi nombre en voz alta."'],
  foto_boda: ['Foto de casamiento', 'Elena y Rubén, 1952. Atrás, en lápiz: "Rubén † 1989. Me sigue pidiendo mate."'],
  foto_sobrina: ['Foto', 'Marta de chica, en la puerta del edificio. Al dorso: "Si golpeo dos y uno, soy yo. Así le golpeaba a Rubén."'],
  calendario: ['Almanaque', 'Octubre de 1991, Farmacia Moreno. Los días del 3 al 13 están tachados con birome roja. El 14 no.'],
  pantuflas: ['Pantuflas', 'Las pantuflas de Elena, una dada vuelta. Están frías. Quien se levantó de esta cama se fue descalzo.'],
  pantuflas_gone: ['Pantuflas', 'Una sola pantufla. La otra no está en el cuarto.'],
  nota_tito_maceta: ['Nota en el buzón', '"Sra. Elena: le dejé la copia en la maceta del fondo, como siempre. Si necesita algo toque el portero. — Tito"'],
  nota_tito_tablero: ['Nota en el buzón', '"Sra. Elena: la llave quedó colgada al lado del tablero, en el lavadero. No baje de noche que se cortó la luz del palier. — Tito"'],
};

// Tape transcripts. "voice" is rendered by the audio engine as degraded formant babble; these are subtitles.
export const TAPES = {
  elena1: { title: 'Casete 1 · "Rubén"', lines: [
    [0, 'Tres de octubre. Son las tres y cuarto.'],
    [3.5, 'Otra vez la cocina. Alguien abrió la heladera, la cerró. Abrió. Cerró.'],
    [8, 'Y después me pidió mate. Con la voz de Rubén.'],
    [12, 'Rubén murió en el ochenta y nueve.'],
    [15.5, 'No le contesto. Si le contesto, aprende.'],
  ] },
  elena2: { title: 'Casete 2 · "Mi voz"', lines: [
    [0, 'Ya sabe mi voz.'],
    [2.5, 'Anoche la del 1°A me golpeó la puerta. Me había oído llamarla desde el pasillo. Yo estaba acostada.'],
    [9, 'Escucha todo. Los pasos, las puertas. Copia lo que hacemos.'],
    [13, 'Pero no ve bien en lo oscuro. Si me quedo quieta, pasa de largo.'],
    [17.5, 'Marta: si venís, golpeá como golpeaba yo a tu tío. Dos, y uno.'],
  ] },
  elena3_hueco: { title: 'Casete 3 · "El espejo"', lines: [
    [0, 'Lo vi parado detrás mío. En el espejo del baño no había nadie.'],
    [5, 'No se refleja. Es lo único que no puede copiar.'],
    [8.5, 'Me voy abajo de la escalera, donde Rubén guardaba las herramientas. Cierro por adentro.'],
    [13, 'Si alguien me abre sin golpear como corresponde, no soy yo la que sale.'],
  ] },
  elena3_baulera: { title: 'Casete 3 · "El espejo"', lines: [
    [0, 'Lo vi parado detrás mío. En el espejo del baño no había nadie.'],
    [5, 'No se refleja. Es lo único que no puede copiar.'],
    [8.5, 'Me voy a la baulera del lavadero. La puerta tiene pasador por dentro.'],
    [13.5, 'Si escuchan mi voz en el hueco de la escalera, no soy yo.'],
  ] },
  elena3_gone: { title: 'Casete 3 · "El espejo"', lines: [
    [0, 'Lo vi parado detrás mío. En el espejo del baño no había nadie.'],
    [5, 'No se refleja. Es lo único que no puede copiar.'],
    [8.5, 'Esta noche lo voy a dejar entrar al dormitorio. Quiero ver qué quiere.'],
    [12.5, 'Quiere salir. Quiere que alguien lo saque, con una cara conocida.'],
    [16.5, 'Marta, si me ves, mirame en un espejo antes de abrazarme.'],
  ] },
  mimic: { title: 'Casete sin etiqueta', lines: [
    [0, '...'],
    [2, '(Una voz igual a la de Elena, pero las pausas están en lugares equivocados.)'],
    [6, 'Marta. Marta. Marta, vení. Estoy abajo.'],
    [10, '(Debajo, muy bajo, se escuchan tus propios pasos.)'],
  ] },
};

export const ELENA_LINES = {
  found: ['¿Marta...? ¿Te mandó Marta?', 'No hagan ruido. Escucha.'],
  follow: 'Voy atrás suyo. Despacio.',
  dark: ['No, ahí no. Está oscuro.', 'Prenda la luz, por favor.', 'Ahí está oscuro. Ahí está él.'],
  afraid: 'Está cerca. Lo siento en los oídos.',
  street: 'La lluvia... hace nueve días que no veo la calle.',
};

export const ENDINGS = {
  rescued: ['Elena Ríos', 'Elena pasó tres semanas internada en el Fernández, deshidratada. No habló durante días. Cuando habló, preguntó si alguien había cerrado la puerta del 1°B.\n\nLos vecinos dicen que el televisor del 1°B se sigue prendiendo a las tres de la mañana.'],
  fake: ['Elena Ríos', 'Marta les agradeció llorando. Esa noche se llevó a su tía a Banfield.\n\nUna semana después los llamó a las tres de la mañana. Habló en voz muy baja: la tía no tomaba mate, no pestañeaba, y se quedaba parada en el pasillo, escuchando. Les preguntó cómo era la voz de ustedes. Ya la conocía.'],
  died: ['Moreno 1418', 'A la mañana Tito encontró la linterna encendida en el piso del {room}. La puerta del 1°B estaba cerrada con llave, por dentro.\n\nEsa noche, los vecinos del 1°A escucharon dos voces nuevas en el departamento.'],
  left_found_truth: ['Informe', 'Entregaron los casetes. Marta los escuchó en silencio.\n{verdict}'],
};
