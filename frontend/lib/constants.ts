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
 * El fondo es #06152B. El azul oficial de Licey (#003DA5) y el verde de
 * Estrellas (#00713B) sobre eso se leen como negro: hay que subirlos o la
 * franja de 3 px desaparece.
 */
export const TEAM_STYLES: Record<string, TeamStyle> = {
  AGU: { primary: "#F2A71B", tint: "rgba(242,167,27,0.14)", text: "#F5B94B" },
  TOR: { primary: "#C7304F", tint: "rgba(199,48,79,0.14)", text: "#E0798F" },
  EST: { primary: "#14B87A", tint: "rgba(20,184,122,0.14)", text: "#36D498" },
  GIG: { primary: "#D6357F", tint: "rgba(214,53,127,0.14)", text: "#E7689F" },
  ESC: { primary: "#EF4B4B", tint: "rgba(239,75,75,0.14)", text: "#F58080" },
  LIC: { primary: "#4A8BF0", tint: "rgba(74,139,240,0.14)", text: "#7FAEF6" },
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
