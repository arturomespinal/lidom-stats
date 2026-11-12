export interface TeamStyle {
  /** Color del club. Relleno de la teja sólida, franja de fila, lavados. */
  primary: string;
  /** El mismo color al 12%, para el relleno de la teja perfilada. */
  tint: string;
  /**
   * Tinta del club para TEXTO y trazos finos sobre el fondo grafito: el
   * primario aclarado hasta pasar 4.5:1 sobre la superficie más clara de las
   * oscuras. El vino de Toros da 2.9:1 tal cual; como texto no se leería.
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
 * ── Look "Pizarra" (rama nuevo-look, 12-nov-2026) ─────────────────────────
 * `primary` y `on` no cambian: la teja sólida es la misma. `text` es ahora la
 * tinta de cada club para fondo OSCURO, aclarada hasta pasar 4.5:1 sobre las
 * cinco superficies (la peor, la franja #232A33): AGU 7.1, TOR 4.8, EST 6.9,
 * GIG 4.9, ESC 4.9, LIC 5.7. El lavado sube de 12% a 16%: sobre grafito el
 * 12% casi no se veía.
 */
export const TEAM_STYLES: Record<string, TeamStyle> = {
  AGU: { primary: '#F2A71B', tint: 'rgba(242,167,27,0.16)', text: '#F2A71B', on: '#0B1830' },
  TOR: { primary: '#C7304F', tint: 'rgba(199,48,79,0.16)',  text: '#EA6A85', on: '#FFFFFF' },
  EST: { primary: '#14B87A', tint: 'rgba(20,184,122,0.16)', text: '#2FCB8D', on: '#0B1830' },
  GIG: { primary: '#D2327C', tint: 'rgba(210,50,124,0.16)', text: '#EC69A3', on: '#FFFFFF' },
  ESC: { primary: '#EF4B4B', tint: 'rgba(239,75,75,0.16)',  text: '#F46A6A', on: '#0B1830' },
  LIC: { primary: '#4A8BF0', tint: 'rgba(74,139,240,0.16)', text: '#6FA3F5', on: '#0B1830' },
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
 * ── Look "Pizarra" (rama nuevo-look, 12-nov-2026) ─────────────────────────
 * Una pizarra de estadio: fondo grafito, tarjetas un paso más claras con
 * borde fino, cifras grandes en Barlow Condensed y lo seleccionado RELLENO DE
 * CLARO con texto grafito. El look anterior (tema claro, tinta navy, Bebas
 * Neue) sigue intacto en `main`.
 *
 * El grafito es neutro a propósito: el navy oscuro que se rechazó el 25-sep
 * teñía la interfaz de azul.
 *
 * ── Sin color de acento ───────────────────────────────────────────────────
 * Cualquier acento cromático cae cerca de un club (el coral del kit era
 * Escogido, ΔE 3.3). El acento es el claro: lo seleccionado se rellena de
 * claro (accent) con texto grafito (accentOn).
 *
 * ── El color de club NUNCA identifica solo ────────────────────────────────
 * Toros, Escogido y Gigantes no se distinguen ni con visión normal. Toda
 * marca de club lleva su código de tres letras.
 *
 * Ningún componente escribe un hex a mano. Si un color no está aquí, o es de
 * equipo (TEAM_STYLES) o falta un token.
 */
export const COLORS = {
  bgPage:   '#0D1014',
  bgSunken: '#090B0E',   // filas hundidas (fuera de la clasificación), fondo de gráfica
  bgCard:   '#161A20',
  bgRaised: '#1E242C',   // presionado
  bgHeader: '#12161B',
  border:   '#2A313B',
  borderSoft: '#20262E', // separadores de fila

  textPrimary:   '#F3F5F7',
  textSupport:   '#C9D0DA',
  textSecondary: '#A7B0BD',
  textFaint:     '#8E98A6',  // micro-etiquetas (≥5.0 sobre todas las superficies)

  accent:   '#F3F5F7',   // lo seleccionado se rellena de claro
  accentOn: '#0D1014',   // y lleva el texto grafito (17.4:1)

  // La franja de contexto (cabeceras, pie de tarjeta, la jugada que entra) y
  // su texto. Un paso por encima de bgRaised.
  ink:    '#232A33',
  inkFg:  '#F3F5F7',
  inkDim: '#A7B0BD',

  // Semánticos, aclarados para fondo oscuro.
  positive: '#4CC38A',
  negative: '#F0808F',
  warning:  '#E3B341',
  live:     '#FF5A4F',

  // El terreno dibujado de la situación del juego (Campo.tsx). Fondo, no
  // dato: tonos apagados para que encima se lean las bases y los nombres.
  // Ningún club se identifica por ellos.
  campoPasto:  '#1B2A22',
  campoFranja: '#203128',  // las franjas del corte de la grama
  campoTierra: '#3A3126',
  campoLinea:  '#8E98A6',

  // Marca. El verde, SOLO cascarón.
  brand:     '#03DA58',
  brandNavy: '#091C3A',
};

/**
 * Familias tipográficas.
 *
 * La letra de títulos, marcadores, códigos de equipo y estados es Barlow
 * Condensed (look "Pizarra"; reemplaza a Bebas Neue, que sigue en `main`).
 * Se cargan dos pesos, y cada uno es una FAMILIA aparte:
 *
 * - `display` (700): marcadores, cifras, códigos de equipo, nombres grandes.
 * - `displayMedia` (600): títulos de sección, estados y acciones.
 *
 * Dos reglas que no se pueden olvidar al usarlas:
 *
 * - **Nunca con `fontWeight`.** El peso lo elige la familia. En Android,
 *   pedir '700' a una fuente propia hace que el sistema la sustituya por la
 *   suya, sin error y sin aviso: el texto sale en Roboto negrita.
 * - **Siempre con `textTransform: 'uppercase'`.** Bebas no tenía minúsculas y
 *   el texto de los componentes sigue escrito normal; Barlow sí las tiene, y
 *   sin la transformación "Estrellas" saldría en minúsculas.
 *
 * El cuerpo sigue en la fuente del sistema: San Francisco y Roboto tienen
 * cifras tabulares (`fontVariant: ['tabular-nums']`), que es lo que importa en
 * una app de estadísticas.
 */
export const FONTS = {
  display: 'BarlowCondensed_700Bold',
  displayMedia: 'BarlowCondensed_600SemiBold',
};

/** Transparencias derivadas, para no repetir el sufijo alfa por ahí suelto. */
export const ALPHA = {
  live15:    `${COLORS.live}26`,
  live30:    `${COLORS.live}4D`,
  neutral15: `${COLORS.textSecondary}26`,
  neutral30: `${COLORS.textSecondary}4D`,
  positive12: `${COLORS.positive}1F`,
};
