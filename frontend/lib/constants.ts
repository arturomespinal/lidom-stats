export interface TeamStyle {
  primary: string;
  bg: string;
  text: string;
}

/**
 * Los colores oficiales de los seis clubes. NO son parte de la paleta de la
 * app: son identidad ajena y por eso viven aparte de COLORS.
 *
 * `primary` es la franja de 3 px de la fila y el borde del respaldo; `text`
 * son las siglas cuando no hay escudo. Ambos tienen un piso de luminosidad
 * porque el fondo es casi negro: el tono dominante de varios escudos es
 * DEMASIADO oscuro para una franja, y ahí el color del uniforme gana.
 *
 * Águilas y Gigantes se ajustaron al escudo, que usa otra paleta que el
 * uniforme. Si aparece un escudo en los colores clásicos —amarillo y azul—,
 * revertir es un hex cada uno.
 */
export const TEAM_STYLES: Record<string, TeamStyle> = {
  AGU: { primary: "#D89018", bg: "#D8901818", text: "#ECB151" },
  TOR: { primary: "#C8102E", bg: "#C8102E18", text: "#ff4d6d" },
  EST: { primary: "#00713B", bg: "#00713B18", text: "#4ade80" },
  GIG: { primary: "#B81F5C", bg: "#B81F5C18", text: "#E35990" },
  ESC: { primary: "#C8102E", bg: "#C8102E18", text: "#ff4d6d" },
  LIC: { primary: "#003DA5", bg: "#003DA518", text: "#60a5fa" },
};

export const TEAM_FULL_NAMES: Record<string, string> = {
  AGU: "Águilas Cibaeñas",
  TOR: "Toros del Este",
  EST: "Estrellas Orientales",
  GIG: "Gigantes del Cibao",
  ESC: "Leones del Escogido",
  LIC: "Tigres del Licey",
};

export const DEFAULT_SEASON = "2025";
