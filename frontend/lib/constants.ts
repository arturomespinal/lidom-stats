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
 * identidad ajena, y por eso viven aquí y no en globals.css.
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
 * ── Tema claro (25-sep-2026) ──────────────────────────────────────────────
 * `text` es ahora la tinta de cada club para fondo CLARO (≥4.5:1 sobre
 * blanco) y `on` el texto que va encima de la teja sólida — tinta o blanco,
 * el que más contraste dé. Gigantes pasó de #D6357F a #D2327C: visualmente
 * igual (ΔE < 1), pero con el primero el blanco encima daba 4.49:1.
 *
 */
export const TEAM_STYLES: Record<string, TeamStyle> = {
  AGU: { primary: "#F2A71B", tint: "rgba(242,167,27,0.12)", text: "#9D6D12", on: "#0B1830" },
  TOR: { primary: "#C7304F", tint: "rgba(199,48,79,0.12)",  text: "#C7304F", on: "#FFFFFF" },
  EST: { primary: "#14B87A", tint: "rgba(20,184,122,0.12)", text: "#0F8659", on: "#0B1830" },
  GIG: { primary: "#D2327C", tint: "rgba(210,50,124,0.12)", text: "#D2327C", on: "#FFFFFF" },
  ESC: { primary: "#EF4B4B", tint: "rgba(239,75,75,0.12)",  text: "#D24242", on: "#0B1830" },
  LIC: { primary: "#4A8BF0", tint: "rgba(74,139,240,0.12)", text: "#3E75CA", on: "#0B1830" },
};

export const TEAM_FULL_NAMES: Record<string, string> = {
  AGU: "Águilas Cibaeñas",
  TOR: "Toros del Este",
  EST: "Estrellas Orientales",
  GIG: "Gigantes del Cibao",
  ESC: "Leones del Escogido",
  LIC: "Tigres del Licey",
};

/** Nombre corto, para cuando el completo no cabe. */
export const TEAM_SHORT_NAMES: Record<string, string> = {
  AGU: "Águilas",
  TOR: "Toros",
  EST: "Estrellas",
  GIG: "Gigantes",
  ESC: "Escogido",
  LIC: "Licey",
};

export const DEFAULT_SEASON = "2025";
