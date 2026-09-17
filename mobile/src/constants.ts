export interface TeamStyle {
  primary: string;
  bg: string;
  text: string;
}

export const TEAM_STYLES: Record<string, TeamStyle> = {
  AGU: { primary: '#FFD400', bg: '#FFD40025', text: '#FFD400' },
  TOR: { primary: '#C8102E', bg: '#C8102E25', text: '#ff6b84' },
  EST: { primary: '#00713B', bg: '#00713B25', text: '#4ade80' },
  GIG: { primary: '#1D6FA4', bg: '#1D6FA425', text: '#60b4f0' },
  ESC: { primary: '#C8102E', bg: '#C8102E25', text: '#ff6b84' },
  LIC: { primary: '#003DA5', bg: '#003DA525', text: '#60a5fa' },
};

export const COLORS = {
  bgPage: '#0d1117',
  bgCard: '#161b22',
  bgHeader: '#21262d',
  border: '#30363d',
  textPrimary: '#f0f6fc',
  textSecondary: '#8b949e',
  accent: '#58a6ff',
};
