export interface TeamStyle {
  primary: string;
  bg: string;
  text: string;
}

/**
 * Los colores oficiales de los seis clubes. NO son parte de la paleta de la
 * app: son identidad ajena y por eso viven aparte de COLORS.
 */
export const TEAM_STYLES: Record<string, TeamStyle> = {
  AGU: { primary: '#FFD400', bg: '#FFD40025', text: '#FFD400' },
  TOR: { primary: '#C8102E', bg: '#C8102E25', text: '#ff6b84' },
  EST: { primary: '#00713B', bg: '#00713B25', text: '#4ade80' },
  GIG: { primary: '#1D6FA4', bg: '#1D6FA425', text: '#60b4f0' },
  ESC: { primary: '#C8102E', bg: '#C8102E25', text: '#ff6b84' },
  LIC: { primary: '#003DA5', bg: '#003DA525', text: '#60a5fa' },
};

/**
 * Paleta de LIDOM Stats — fuente única para el móvil.
 *
 * La app NO tiene color de marca. Los seis equipos ya ocupan el amarillo, el
 * rojo, el verde y el azul; cualquier acento competiría con alguno y haría que
 * las filas se leyeran como si pertenecieran a un equipo. El acento es el
 * mismo blanco del texto, y la jerarquía la cargan el tamaño y el peso.
 *
 * Corolario que no se puede olvidar: el color ya no distingue lo activo de lo
 * inactivo. Un elemento seleccionado se INVIERTE —relleno claro, texto
 * oscuro (accentOn)— en vez de teñirse. Si algún día una pestaña activa vuelve
 * a ser "accent sobre card", va a desaparecer.
 *
 * Ningún componente escribe un hex a mano. Si un color no está aquí, o es de
 * equipo (TEAM_STYLES) o falta un token.
 */
export const COLORS = {
  bgPage:   '#0B0B0C',
  bgSunken: '#0F0F11',   // filas hundidas (equipos fuera de la clasificación)
  bgCard:   '#151517',
  bgRaised: '#1D1D21',   // superficie elevada, presionada
  bgHeader: '#1E1E21',
  border:   '#2C2C31',

  textPrimary:   '#F4F4F5',
  textSupport:   '#D6D6DA',  // texto de apoyo: nombres de equipo, líneas
  textSecondary: '#96969E',  // etiquetas, datos menores

  accent:   '#F4F4F5',   // = textPrimary. Ver la nota de arriba.
  accentOn: '#0B0B0C',   // = bgPage. Texto sobre relleno claro.

  // Semánticos. Significan algo, así que no cambian con la paleta.
  positive: '#4ADE80',   // bueno, ventaja, clasifica
  negative: '#F87171',   // malo, atraso
  warning:  '#FBBF24',   // base ocupada, out consumido, dato viejo
  live:     '#FF4D4F',   // en vivo, ahora mismo
};

/** Transparencias derivadas, para no repetir el sufijo alfa por ahí suelto. */
export const ALPHA = {
  live15:    `${COLORS.live}26`,
  live30:    `${COLORS.live}4D`,
  neutral15: `${COLORS.textSecondary}26`,
  neutral30: `${COLORS.textSecondary}4D`,
  positive12: `${COLORS.positive}1F`,
};
