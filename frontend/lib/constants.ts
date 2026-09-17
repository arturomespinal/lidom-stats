export interface TeamStyle {
  primary: string;
  bg: string;
  text: string;
}

export const TEAM_STYLES: Record<string, TeamStyle> = {
  AGU: { primary: "#FFD400", bg: "#FFD40018", text: "#FFD400" },
  TOR: { primary: "#C8102E", bg: "#C8102E18", text: "#ff4d6d" },
  EST: { primary: "#00713B", bg: "#00713B18", text: "#4ade80" },
  GIG: { primary: "#1D6FA4", bg: "#1D6FA418", text: "#60b4f0" },
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
