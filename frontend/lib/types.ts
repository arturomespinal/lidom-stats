export interface StandingRow {
  team_id: string;
  team_name: string;
  wins: number;
  losses: number;
  games_played: number | null;
  win_loss_pct: number | null;
  games_back: string;
  runs_scored: number | null;
  runs_allowed: number | null;
  run_differential: number | null;
}

export interface BattingRow {
  player: string;
  team_id: string;
  games: number;
  plate_appearances: number;
  at_bats: number;
  runs: number;
  hits: number;
  doubles: number;
  triples: number;
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
  hits: number;
  earned_runs: number;
  walks: number;
  strikeouts: number;
  whip: number | null;
  strikeouts_per_nine: number | null;
  walks_per_nine: number | null;
}
