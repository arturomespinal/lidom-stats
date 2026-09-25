export interface TeamStyle {
  /** Color del club. Relleno de la teja sólida, franja de fila, lavados. */
  primary: string;
  /** El mismo color al 12%, para el relleno de la teja perfilada. */
  tint: string;
  /**
   * Tinta del club para TEXTO y trazos finos sobre fondo claro: el primario
   * oscurecido hasta pasar 4.5:1 sobre blanco. El amarillo de Águilas da
   * 2.0:1 tal cual; como texto no se leería.
   */
  text: string;
  /** Color del texto ENCIMA de la teja sólida: el que más contraste da. */
  on: string;
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
 * Sobre el navy oscuro de antes, El azul oficial de Licey (#003DA5) y el verde de
 * Estrellas (#00713B) sobre eso se leen como negro: hay que subirlos o la
 * franja de 3 px desaparece.
 *
 * Estos valores son los MISMOS que en frontend/lib/constants.ts. Si cambia
 * uno, cambia el otro: dos plataformas con colores distintos para el mismo
 * equipo es el tipo de fallo que nadie reporta y todo el mundo nota.
 * ── Tema claro (25-sep-2026) ──────────────────────────────────────────────
 * `text` es ahora la tinta de cada club para fondo CLARO (≥4.5:1 sobre
 * blanco) y `on` el texto que va encima de la teja sólida — tinta o blanco,
 * el que más contraste dé. Gigantes pasó de #D6357F a #D2327C: visualmente
 * igual (ΔE < 1), pero con el primero el blanco encima daba 4.49:1.
 *
 */
export const TEAM_STYLES: Record<string, TeamStyle> = {
  AGU: { primary: '#F2A71B', tint: 'rgba(242,167,27,0.12)', text: '#9D6D12', on: '#0B1830' },
  TOR: { primary: '#C7304F', tint: 'rgba(199,48,79,0.12)',  text: '#C7304F', on: '#FFFFFF' },
  EST: { primary: '#14B87A', tint: 'rgba(20,184,122,0.12)', text: '#0F8659', on: '#0B1830' },
  GIG: { primary: '#D2327C', tint: 'rgba(210,50,124,0.12)', text: '#D2327C', on: '#FFFFFF' },
  ESC: { primary: '#EF4B4B', tint: 'rgba(239,75,75,0.12)',  text: '#D24242', on: '#0B1830' },
  LIC: { primary: '#4A8BF0', tint: 'rgba(74,139,240,0.12)', text: '#3E75CA', on: '#0B1830' },
};

/**
 * Nombre corto de cada club, los mismos que la web (TEAM_SHORT_NAMES en
 * frontend/lib/constants.ts). Sirve para títulos y subtítulos ANTES de que
 * llegue la respuesta: la cabecera de una ficha de equipo no tiene que abrir
 * diciendo "LIC" para cambiar a "Licey" medio segundo después.
 */
export const TEAM_SHORT_NAMES: Record<string, string> = {
  AGU: 'Águilas',
  TOR: 'Toros',
  EST: 'Estrellas',
  GIG: 'Gigantes',
  ESC: 'Escogido',
  LIC: 'Licey',
};

/**
 * Paleta de Deportiv — fuente única para el móvil. Los MISMOS valores que
 * frontend/app/globals.css; la tabla de contraste completa vive allá.
 *
 * ── Tema claro, tinta navy (25-sep-2026) ──────────────────────────────────
 * Fondos claros, títulos en Bebas Neue y franjas navy de contexto, tomados de
 * un kit de referencia. El kit tiñe su negro con su rojo de marca; aquí se
 * tiñe con el navy de Deportiv.
 *
 * ── Sin color de acento ───────────────────────────────────────────────────
 * El coral del kit (#FF5050) es el mismo color que Escogido (ΔE 3.3). El
 * acento es la tinta navy: lo seleccionado se rellena de navy con texto
 * blanco (accentOn).
 *
 * ── El color de club NUNCA identifica solo ────────────────────────────────
 * Toros, Escogido y Gigantes no se distinguen ni con visión normal. Toda
 * marca de club lleva su código de tres letras.
 *
 * Ningún componente escribe un hex a mano. Si un color no está aquí, o es de
 * equipo (TEAM_STYLES) o falta un token.
 */
export const COLORS = {
  bgPage:   '#F3F5F8',
  bgSunken: '#E8ECF1',   // filas hundidas (fuera de la clasificación), fondo de gráfica
  bgCard:   '#FFFFFF',
  bgRaised: '#EDF0F4',   // presionado
  bgHeader: '#F3F5F8',
  border:   '#D5DCE5',
  borderSoft: '#E7EBF0', // separadores de fila

  textPrimary:   '#0B1830',  // tinta: negro teñido de navy
  textSupport:   '#36445C',
  textSecondary: '#56637A',
  textFaint:     '#5C697F',  // micro-etiquetas (≥4.7 sobre todas las superficies)

  accent:   '#091C3A',   // navy Deportiv: lo seleccionado se rellena de esto
  accentOn: '#FFFFFF',

  // La franja navy de contexto y su texto.
  ink:    '#091C3A',
  inkFg:  '#FFFFFF',
  inkDim: '#A9B6CC',

  // Semánticos, oscurecidos para fondo claro.
  positive: '#237D56',
  negative: '#B2505E',
  warning:  '#8A6A21',
  live:     '#D43128',

  // Marca. El verde, SOLO cascarón.
  brand:     '#03DA58',
  brandNavy: '#091C3A',
};

/**
 * Familias tipográficas.
 *
 * `display` es Bebas Neue: títulos, marcadores, códigos de equipo y estados.
 * Tiene UN solo peso (400) y solo mayúsculas. Dos reglas que no se pueden
 * olvidar al usarla:
 *
 * - **Nunca con `fontWeight`.** En Android, pedir '700' u '800' a una fuente
 *   propia de un solo peso hace que el sistema la sustituya por la suya, sin
 *   error y sin aviso: el texto sale en Roboto negrita.
 * - El texto se escribe normal y la fuente lo pone en mayúsculas sola.
 *
 * El cuerpo sigue en la fuente del sistema: San Francisco y Roboto tienen
 * cifras tabulares (`fontVariant: ['tabular-nums']`), que es lo que importa en
 * una app de estadísticas.
 */
export const FONTS = {
  display: 'BebasNeue_400Regular',
};

/** Transparencias derivadas, para no repetir el sufijo alfa por ahí suelto. */
export const ALPHA = {
  live15:    `${COLORS.live}26`,
  live30:    `${COLORS.live}4D`,
  neutral15: `${COLORS.textSecondary}26`,
  neutral30: `${COLORS.textSecondary}4D`,
  positive12: `${COLORS.positive}1F`,
};
