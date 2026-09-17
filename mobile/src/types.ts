export interface StandingRow {
  team_id: string;
  team_name: string;
  /** Nombre corto del catálogo canónico ("Águilas"), para pantallas angostas. */
  short_name: string;
  wins: number;
  losses: number;
  games_played: number | null;
  win_loss_pct: number | null;
  games_back: string;
  run_differential: number | null;
  /** Si el equipo ocupa hoy un puesto de round robin. */
  playoff_spot: boolean;
  /**
   * Distancia con signo a la línea de clasificación: positivo = colchón sobre
   * el primero que está fuera, negativo = atraso contra el último que está
   * dentro. null cuando no hay línea (menos equipos que cupos).
   */
  playoff_games: number | null;
}

export interface BattingRow {
  player: string;
  team_id: string;
  games: number;
  plate_appearances: number;
  at_bats: number;
  hits: number;
  home_runs: number;
  rbi: number;
  stolen_bases: number;
  walks: number;
  strikeouts: number;
  batting_avg: number | null;
  on_base_pct: number | null;
  slugging_pct: number | null;
  ops: number | null;
}

export interface PitchingRow {
  player: string;
  team_id: string;
  wins: number;
  losses: number;
  era: number | null;
  games: number;
  games_started: number;
  saves: number;
  innings_pitched: number | null;
  strikeouts: number;
  walks: number;
  whip: number | null;
  strikeouts_per_nine: number | null;
  walks_per_nine: number | null;
}

/* ── Estado en vivo ──────────────────────────────────────────────────────────
   Refleja LiveGameState de src/live/gumbo.py en el backend, y es el mismo
   contrato que usa el frontend web. Si cambia uno, cambian los tres. */

export interface LiveTeamLine {
  team_code: string;
  team_name: string;
  runs: number;
  hits: number;
  errors: number;
  left_on_base: number;
}

export interface LiveInningLine {
  inning: number;
  /* null = esa mitad no se jugó. El caso típico es el cierre del noveno
     cuando el local va ganando: no es un cero, es que no batearon. */
  away_runs: number | null;
  home_runs: number | null;
}

export interface LiveRunners {
  first: string | null;
  second: string | null;
  third: string | null;
}

export interface LiveDecisions {
  winner: string | null;
  loser: string | null;
  save: string | null;
}

export type LiveStatus = 'preview' | 'live' | 'final' | 'other';

export interface LiveGameState {
  game_pk: number;
  game_id: string | null;
  season: string | null;
  game_date: string | null;
  venue: string | null;

  status: LiveStatus;
  detailed_status: string;
  timestamp: string | null;
  /* Lo que la propia API recomienda esperar entre consultas. */
  poll_wait_seconds: number;

  inning: number | null;
  inning_ordinal: string | null;
  inning_half: string | null;
  is_top_inning: boolean | null;
  scheduled_innings: number;
  outs: number;
  balls: number;
  strikes: number;

  home: LiveTeamLine;
  away: LiveTeamLine;
  line_score: LiveInningLine[];

  runners: LiveRunners;
  batter: string | null;
  on_deck: string | null;
  pitcher: string | null;

  last_play: string | null;
  last_play_event: string | null;
  last_play_is_scoring: boolean;
  plays_count: number;

  decisions: LiveDecisions | null;
}
