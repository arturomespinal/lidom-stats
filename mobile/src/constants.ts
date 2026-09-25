export interface TeamStyle {
  /** Color del club. Franja de fila, borde y relleno de la marca. */
  primary: string;
  /** El mismo color al 14%, para el relleno de la marca perfilada. */
  tint: string;
  /** Versión aclarada, para texto sobre el fondo casi negro. */
  text: string;
}

/**
 * Los colores de los seis clubes. NO son parte de la paleta de la app: son
 * identidad ajena, y por eso viven aparte de COLORS.
 *
 * ── Toros y Escogido ya no comparten color ────────────────────────────────
 * Hasta la validación de 14 temporadas los dos eran `#C8102E` EXACTO. En una
 * fila de 28 px eso es indistinguible, y en la barra de probabilidad —donde
 * los dos colores se enfrentan y el color ES el dato— habría sido un bloque
 * rojo sin junta visible.
 *
 * Toros pasa a vino y Escogido se queda con el rojo vivo. Los dos siguen
 * siendo rojos, que es su identidad, pero se separan.
 *
 * ── Todos tienen piso de luminosidad ──────────────────────────────────────
 * El fondo es #06152B. El azul oficial de Licey (#003DA5) y el verde de
 * Estrellas (#00713B) sobre eso se leen como negro: hay que subirlos o la
 * franja de 3 px desaparece.
 *
 * Estos valores son los MISMOS que en frontend/lib/constants.ts. Si cambia
 * uno, cambia el otro: dos plataformas con colores distintos para el mismo
 * equipo es el tipo de fallo que nadie reporta y todo el mundo nota.
 */
export const TEAM_STYLES: Record<string, TeamStyle> = {
  AGU: { primary: '#F2A71B', tint: 'rgba(242,167,27,0.14)', text: '#F5B94B' },
  TOR: { primary: '#C7304F', tint: 'rgba(199,48,79,0.14)', text: '#E0798F' },
  EST: { primary: '#14B87A', tint: 'rgba(20,184,122,0.14)', text: '#36D498' },
  GIG: { primary: '#D6357F', tint: 'rgba(214,53,127,0.14)', text: '#E7689F' },
  ESC: { primary: '#EF4B4B', tint: 'rgba(239,75,75,0.14)', text: '#F58080' },
  LIC: { primary: '#4A8BF0', tint: 'rgba(74,139,240,0.14)', text: '#7FAEF6' },
};

/**
 * Paleta de Deportiv — fuente única para el móvil.
 *
 * ── El contenido no lleva color de marca ──────────────────────────────────
 * Los seis equipos ya ocupan el amarillo, el rojo, el verde, el azul y el
 * magenta. Cualquier acento competiría con alguno y haría que las filas se
 * leyeran como si pertenecieran a un equipo. El acento es el mismo blanco del
 * texto, y la jerarquía la cargan la escala, el peso y el aire.
 *
 * Corolario que no se puede olvidar: el color NO distingue lo activo de lo
 * inactivo. Un elemento seleccionado se INVIERTE —relleno claro, texto oscuro
 * (accentOn)— en vez de teñirse. Si una pestaña activa vuelve a ser "accent
 * sobre card", va a desaparecer: un fondo al 12% del acento sobre la tarjeta
 * es literalmente invisible.
 *
 * ── El navy es la SUPERFICIE ──────────────────────────────────────────────
 * La regla prohíbe un ACENTO de marca, no una superficie. El navy de
 * Deportiv es el fondo de toda la app: un fondo no compite con el texto de
 * ningún club. Con el negro neutro anterior la app era correcta y anónima.
 * `brand` (el verde) sigue siendo SOLO cascarón: es el tono de Estrellas.
 *
 * ── Contraste medido ──────────────────────────────────────────────────────
 * Todo token de texto pasa 4.5:1 sobre bgCard. `textFaint` era el que
 * fallaba (2.9:1 en la paleta negra) y es el de las micro-etiquetas: el
 * texto más chico, el que más lo necesita. Tabla completa en
 * frontend/app/globals.css — los valores son los MISMOS.
 *
 * ── El color de club NUNCA identifica solo ────────────────────────────────
 * Toros, Escogido y Gigantes caen los tres en la familia roja-magenta
 * (Gigantes↔Toros ΔE 7.4, bajo el piso de 15 con visión normal). Es
 * estructural: toda marca de color de club va con su código de tres letras.
 *
 * Ningún componente escribe un hex a mano. Si un color no está aquí, o es de
 * equipo (TEAM_STYLES) o falta un token.
 */
export const COLORS = {
  bgPage:   '#06152B',
  bgSunken: '#041022',   // filas hundidas (equipos fuera de la clasificación)
  bgCard:   '#0B2038',
  bgRaised: '#112A48',   // superficie elevada, presionada
  bgHeader: '#0E2340',
  border:   '#1B3A5C',
  borderSoft: '#12294A', // separadores de fila, más tenues que el borde

  textPrimary:   '#EAF0F8',
  textSupport:   '#B9C8DB',  // texto de apoyo: nombres de equipo, líneas
  textSecondary: '#8FA6C2',  // etiquetas, datos menores
  textFaint:     '#7C94B2',  // micro-etiquetas en versalitas (5.1:1)

  accent:   '#EAF0F8',   // = textPrimary. El acento sigue sin ser color.
  accentOn: '#06152B',   // = bgPage. Texto sobre relleno claro.

  // Semánticos. Significan algo, así que no cambian con la paleta.
  positive: '#3DDC97',   // bueno, ventaja, clasifica
  negative: '#FB7185',   // malo, atraso
  warning:  '#FFC53D',   // base ocupada, out consumido, dato viejo
  live:     '#FF3B30',   // en vivo, ahora mismo

  // Marca. El verde, SOLO cascarón. El navy ya es la superficie.
  brand:     '#03DA58',
  brandNavy: '#091C3A',
};

/** Transparencias derivadas, para no repetir el sufijo alfa por ahí suelto. */
export const ALPHA = {
  live15:    `${COLORS.live}26`,
  live30:    `${COLORS.live}4D`,
  neutral15: `${COLORS.textSecondary}26`,
  neutral30: `${COLORS.textSecondary}4D`,
  positive12: `${COLORS.positive}1F`,
};
