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
 * El fondo es #08090C. El azul oficial de Licey (#003DA5) y el verde de
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
 * ── Dónde vive la marca ───────────────────────────────────────────────────
 * `brand` y `brandNavy` son SOLO para el cascarón: icono, splash, logotipo de
 * cabecera, estados vacíos. El verde de Deportiv y el de Estrellas son el
 * mismo tono, y el navy choca con Licey: si el verde entrara en las tablas,
 * cada fila de Estrellas parecería destacada y cada dato destacado parecería
 * de Estrellas.
 *
 * Ningún componente escribe un hex a mano. Si un color no está aquí, o es de
 * equipo (TEAM_STYLES) o falta un token.
 */
export const COLORS = {
  bgPage:   '#08090C',
  bgSunken: '#050608',   // filas hundidas (equipos fuera de la clasificación)
  bgCard:   '#12151B',
  bgRaised: '#1A1E26',   // superficie elevada, presionada
  bgHeader: '#1A1E26',
  border:   '#252A34',
  borderSoft: '#14171D', // separadores de fila, más tenues que el borde

  textPrimary:   '#F1F3F7',
  textSupport:   '#A6AEBC',  // texto de apoyo: nombres de equipo, líneas
  textSecondary: '#6B7382',  // etiquetas, datos menores
  textFaint:     '#565E6B',  // micro-etiquetas en versalitas

  accent:   '#F1F3F7',   // = textPrimary. Ver la nota de arriba.
  accentOn: '#08090C',   // = bgPage. Texto sobre relleno claro.

  // Semánticos. Significan algo, así que no cambian con la paleta.
  positive: '#3DDC97',   // bueno, ventaja, clasifica
  negative: '#FB7185',   // malo, atraso
  warning:  '#FFC53D',   // base ocupada, out consumido, dato viejo
  live:     '#FF3B30',   // en vivo, ahora mismo

  // Marca. SOLO cascarón — ver la nota de arriba.
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
