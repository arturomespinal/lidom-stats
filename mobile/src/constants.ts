import { temaActual, tematico, type Tema } from './tema';

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
 * Sobre el navy oscuro de septiembre, el azul oficial de Licey (#003DA5) y el verde de
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
 * ── Look "Pizarra" (12-nov-2026, en main desde el 16-nov) ───────────────
 * `primary` y `on` no cambian: la teja sólida es la misma. `text` es ahora la
 * tinta de cada club para fondo OSCURO, aclarada hasta pasar 4.5:1 sobre las
 * cinco superficies (la peor, la franja #232A33): AGU 7.1, TOR 4.8, EST 6.9,
 * GIG 4.9, ESC 4.9, LIC 5.7. El lavado sube de 12% a 16%: sobre grafito el
 * 12% casi no se veía.
 */
const TEJAS: Record<string, Omit<TeamStyle, 'text'>> = {
  AGU: { primary: '#F2A71B', tint: 'rgba(242,167,27,0.16)', on: '#0B1830' },
  TOR: { primary: '#C7304F', tint: 'rgba(199,48,79,0.16)',  on: '#FFFFFF' },
  EST: { primary: '#14B87A', tint: 'rgba(20,184,122,0.16)', on: '#0B1830' },
  GIG: { primary: '#D2327C', tint: 'rgba(210,50,124,0.16)', on: '#FFFFFF' },
  ESC: { primary: '#EF4B4B', tint: 'rgba(239,75,75,0.16)',  on: '#0B1830' },
  LIC: { primary: '#4A8BF0', tint: 'rgba(74,139,240,0.16)', on: '#0B1830' },
};

/**
 * La tinta de cada club para texto, por modo. En oscuro, aclarada hasta 4.5:1
 * sobre la franja; en claro, oscurecida hasta 4.6:1 sobre las seis
 * superficies claras (16-nov-2026). Los mismos valores que `--club-*` en
 * frontend/app/globals.css. La teja sólida (primary, on) no cambia.
 */
const TINTAS: Record<Tema, Record<string, string>> = {
  oscuro: { AGU: '#F2A71B', TOR: '#EA6A85', EST: '#2FCB8D', GIG: '#EC69A3', ESC: '#F46A6A', LIC: '#6FA3F5' },
  claro:  { AGU: '#8B5D08', TOR: '#BF2E4C', EST: '#0D754E', GIG: '#BC296D', ESC: '#CC1212', LIC: '#1260D9' },
};

export const TEAM_STYLES: Record<string, TeamStyle> = tematico(() =>
  Object.fromEntries(
    Object.entries(TEJAS).map(([code, teja]) => [code, { ...teja, text: TINTAS[temaActual()][code] }]),
  ),
);

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
 * ── Look "Pizarra" (12-nov-2026, en main desde el 16-nov) ───────────────
 * Una pizarra de estadio: fondo grafito, tarjetas un paso más claras con
 * borde fino, cifras grandes en Barlow Condensed y lo seleccionado RELLENO DE
 * CLARO con texto grafito. Reemplazó al tema claro con tinta navy y Bebas
 * Neue (25-sep-2026).
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
const OSCURO = {
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

  // La serie "del resto" en las gráficas de las fichas (la liga, los otros
  // cinco, las barras sin color). Una marca, no texto: basta 3:1.
  serie: '#8A96A9',

  // Marca. El verde, SOLO cascarón.
  brand:     '#03DA58',
  brandNavy: '#091C3A',
};

/**
 * Pizarra clara (16-nov-2026): el mismo diseño sobre blanco y gris claro, con
 * texto grafito. TODO cambia de lado, también la franja (`ink`). Los mismos
 * valores que `:root[data-tema="claro"]` en frontend/app/globals.css, donde
 * está la tabla de contraste: todo texto pasa 4.6:1 sobre las seis
 * superficies. Lo seleccionado se invierte: pastilla grafito, texto claro.
 */
const CLARO: typeof OSCURO = {
  bgPage:   '#F2F4F7',
  bgSunken: '#E8ECF1',
  bgCard:   '#FFFFFF',
  bgRaised: '#EBEEF2',
  bgHeader: '#F6F7F9',
  border:   '#D3D9E1',
  borderSoft: '#E6E9EE',

  textPrimary:   '#0D1014',
  textSupport:   '#2F3742',
  textSecondary: '#4B5563',
  textFaint:     '#596372',

  accent:   '#161A20',
  accentOn: '#F3F5F7',

  ink:    '#E4E8EE',
  inkFg:  '#0D1014',
  inkDim: '#4B5563',

  positive: '#136F44',
  negative: '#B4233B',
  warning:  '#8A5A00',
  live:     '#C42B21',

  campoPasto:  '#DCE9DF',
  campoFranja: '#D3E3D7',
  campoTierra: '#EADFCB',
  campoLinea:  '#FFFFFF',

  serie: '#7A8594',

  brand:     '#03DA58',
  brandNavy: '#091C3A',
};

export type Paleta = typeof OSCURO;

/** La paleta del modo actual. Ver src/tema.ts. */
export const COLORS: Paleta = tematico(() => (temaActual() === 'claro' ? CLARO : OSCURO));

/**
 * Familias tipográficas.
 *
 * La letra de títulos, marcadores, códigos de equipo y estados es Barlow
 * Condensed (look "Pizarra"; reemplazó a Bebas Neue el 16-nov-2026).
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
 * - **Siempre con `textTransform: 'uppercase'`.** Bebas Neue, la letra anterior, no tenía minúsculas y
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
export const ALPHA = tematico(() => ({
  live15:    `${COLORS.live}26`,
  live30:    `${COLORS.live}4D`,
  neutral15: `${COLORS.textSecondary}26`,
  neutral30: `${COLORS.textSecondary}4D`,
  positive12: `${COLORS.positive}1F`,
  // La raya fina sobre la franja (cabeceras de ficha y de récords).
  rayaFranja: `${COLORS.inkFg}24`,
}));
