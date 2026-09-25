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
  /**
   * Slug de la ficha (/players/{id}). La tabla plana solo guarda el nombre;
   * la API lo cruza por mlb_id. null si el jugador no está en el esquema de
   * juego: la fila se muestra igual, pero no lleva a ninguna parte.
   */
  player_id: string | null;
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
  /** Slug de la ficha. Ver BattingRow. */
  player_id: string | null;
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
  /** Crudo de la MLB: "1st", "7th". Se conserva, no se pinta. */
  inning_ordinal: string | null;
  /** El que se pinta: "1ro", "7mo". Derivado del número en el backend. */
  inning_ordinal_es: string | null;
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

/* ── Detalle de un juego ───────────────────────────────────────────────────
   Lo que devuelve /live/games/{pk}/detail. Se pide una sola vez, al abrir un
   juego — la tarjeta del listado NO trae nada de esto. */

export interface PlayLine {
  index: number;
  inning: number | null;
  inning_ordinal_es: string | null;
  is_top_inning: boolean | null;
  /** "Alta del 3ro" — ya armado en el backend. */
  half_label: string | null;

  /** Crudo de la MLB: "Groundout". Se conserva, no se pinta. */
  event: string | null;
  /** El que se pinta: "Roletazo de out". */
  event_es: string | null;
  /** Texto libre de la MLB, EN INGLÉS. Opcional como subtítulo. */
  description: string | null;

  batter: string | null;
  pitcher: string | null;

  rbi: number;
  is_scoring_play: boolean;
  is_out: boolean;
  outs: number;
  balls: number;
  strikes: number;

  away_score: number;
  home_score: number;
  is_complete: boolean;
}

export interface DetailInning {
  num: number;
  ordinal_es: string | null;
  /** null = la media entrada no se jugó. NO es cero. */
  away_runs: number | null;
  home_runs: number | null;
  away_hits: number;
  home_hits: number;
}

export interface BatterLine {
  player_id: number;
  name: string;
  position: string | null;
  /** 100, 200… titulares; 101, 102… quienes los relevaron. */
  batting_order: number | null;
  is_starter: boolean;
  summary: string | null;
  at_bats: number;
  runs: number;
  hits: number;
  doubles: number;
  triples: number;
  home_runs: number;
  rbi: number;
  walks: number;
  strikeouts: number;
  stolen_bases: number;
  left_on_base: number;
}

export interface PitcherLine {
  player_id: number;
  name: string;
  order: number;
  is_starter: boolean;
  note: string | null;
  summary: string | null;
  /** STRING: "0.2" son dos outs, no dos décimas. No convertir a número. */
  innings_pitched: string | null;
  hits: number;
  runs: number;
  earned_runs: number;
  walks: number;
  strikeouts: number;
  home_runs: number;
  pitches: number;
  strikes: number;
}

export interface BullpenArm {
  player_id: number;
  name: string;
}

export interface TeamDetail {
  team_code: string | null;
  team_name: string | null;
  runs: number;
  hits: number;
  errors: number;
  left_on_base: number;
  batters: BatterLine[];
  pitchers: PitcherLine[];
  bench: BullpenArm[];
  bullpen: BullpenArm[];
}

export interface LiveGameDetail {
  game_pk: number | null;
  game_id: string | null;
  status: LiveStatus;
  timestamp: string | null;
  innings: DetailInning[];
  scheduled_innings: number;
  plays: PlayLine[];
  plays_total: number;
  plays_returned: number;
  home: TeamDetail;
  away: TeamDetail;
}

export interface LiveDetailResponse {
  age_seconds: number;
  /** false = el juego terminó y esto ya no cambia. Deja de refrescar. */
  is_updating: boolean;
  data: LiveGameDetail;
}

/* ── Probabilidad de ganar ───────────────────────────────────────────────
   Lo que devuelve /live/games/{pk}/winprob. Mismos campos que en
   frontend/lib/types.ts: el backend es uno solo. */

export interface WinProbPoint {
  inning: number;
  is_top: boolean;
  /** Marcador en ese momento. */
  away: number;
  home: number;
  /** Probabilidad de que gane el LOCAL, 0..1. */
  wp: number;
  /** "Alta del 3ro", compuesto en el backend. El cliente no lo arma. */
  label: string;
}

export interface WinProbResponse {
  age_seconds: number;
  is_updating: boolean;
  home_team: string | null;
  away_team: string | null;
  /** La de ahora mismo. `null` en previa y en final: ahí hay resultado. */
  current: number | null;
  /** "Estrellas nunca estuvo por debajo del 56%." Solo en juegos terminados. */
  headline: string | null;
  points: WinProbPoint[];
  points_count: number;
}

/* ── Fichas: jugador y equipo ─────────────────────────────────────────────
   Copia de frontend/lib/types.ts: los dos clientes consumen el mismo
   contrato. Si cambia uno, cambian los tres (backend incluido).

   Vienen del esquema de granularidad de juego (api/game_routes.py), no de las
   tablas planas. Es la diferencia entre "el líder de esta temporada" y "las
   catorce temporadas de este hombre". */

export interface PlayerBio {
  player_id: string;
  full_name: string;
  birth_date: string | null;
  /** Código crudo: 'L', 'R' o 'S'. Para pintar se usa `bats_label`. */
  bats: string | null;
  throws: string | null;
  /**
   * Lateralidad YA traducida por la API. El cliente NUNCA traduce: un
   * `bats === "L" ? "Zurdo" : "Derecho"` etiqueta mal a los 198 ambidiestros
   * de la base, sin error y sin que nadie lo note. Ver src/lateralidad.py.
   */
  bats_label: string | null;
  throws_label: string | null;
  nationality: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  /** Años cumplidos, calculados en el servidor. */
  age: number | null;
  mlb_id: number | null;
}

export interface PlayerBattingSeason {
  season_id: string;
  team_code: string;
  games: number;
  games_batted: number;
  pa: number;
  ab: number;
  h: number;
  doubles: number;
  triples: number;
  hr: number;
  r: number;
  rbi: number;
  bb: number;
  so: number;
  sb: number;
  hbp: number;
  sf: number;
  avg: number | null;
  obp: number | null;
  slg: number | null;
  ops: number | null;
}

export interface PlayerPitchingSeason {
  season_id: string;
  team_code: string;
  games: number;
  games_started: number;
  wins: number;
  losses: number;
  saves: number;
  innings_pitched: number | null;
  outs: number;
  h: number;
  er: number;
  so: number;
  bb: number;
  era: number | null;
  whip: number | null;
}

/**
 * Totales de carrera. Los calcula el servidor (src/carrera.py) porque las
 * tasas no se promedian: el AVG de la carrera sale de H/AB del total, no de
 * la media de los AVG anuales.
 */
export interface CareerBatting
  extends Omit<PlayerBattingSeason, 'season_id' | 'team_code'> {
  tb: number;
  seasons: number;
  teams: number;
}

export interface CareerPitching
  extends Omit<PlayerPitchingSeason, 'season_id' | 'team_code'> {
  seasons: number;
  teams: number;
}

export interface CareerTeam {
  team_code: string;
  seasons: number;
  first_season: string;
  last_season: string;
}

export interface PlayerProfile {
  player: PlayerBio;
  batting: PlayerBattingSeason[];
  pitching: PlayerPitchingSeason[];
  career_batting: CareerBatting | null;
  career_pitching: CareerPitching | null;
  teams: CareerTeam[];
  is_pitcher: boolean;
}

export interface PlayerSearchHit {
  player_id: string;
  full_name: string;
  birth_date: string | null;
  nationality: string | null;
  bats_label: string | null;
  throws_label: string | null;
  /**
   * Códigos separados por coma ("LIC,TOR,EST"), o null si nunca bateó/lanzó.
   * Vienen así, y no como arreglo, porque salen de un GROUP_CONCAT de SQLite.
   * Es lo que permite distinguir de un vistazo a dos homónimos en la lista.
   */
  batting_teams: string | null;
  pitching_teams: string | null;
}

export interface TeamSeasonRow {
  season_id: string;
  games_played: number;
  wins: number;
  losses: number;
  runs_for: number;
  runs_against: number;
  win_pct: number | null;
  run_diff: number;
}

export interface TeamRosterBatter {
  player_id: string;
  full_name: string;
  games: number;
  games_batted: number;
  pa: number;
  ab: number;
  h: number;
  hr: number;
  rbi: number;
  sb: number;
  bb: number;
  so: number;
  avg: number | null;
  obp: number | null;
  slg: number | null;
  ops: number | null;
}

export interface TeamRosterPitcher {
  player_id: string;
  full_name: string;
  games: number;
  games_started: number;
  wins: number;
  losses: number;
  saves: number;
  innings_pitched: number | null;
  /** Outs en crudo. El mínimo se compara aquí, no sobre IP ya redondeada. */
  outs: number;
  so: number;
  bb: number;
  era: number | null;
  whip: number | null;
}

export interface TeamLeader {
  /** Campo de la vista: "hr", "avg", "era"… Decide cómo se formatea el valor. */
  stat: string;
  label: string;
  /** true = es una tasa y lleva mínimo de calificación. Regla 10 de CLAUDE.md. */
  qualified: boolean;
  player_id: string;
  full_name: string;
  value: number;
}

export interface TeamLeaders {
  batting: TeamLeader[];
  pitching: TeamLeader[];
  qualified_batters: number;
  qualified_pitchers: number;
}

export interface TeamProfile {
  team_code: string;
  team_name: string;
  short_name: string;
  city: string | null;
  founded_year: string | null;
  season_id: string;
  history: TeamSeasonRow[];
  seasons_count: number;
  /** Juegos que jugó el equipo esa temporada: la base de los dos mínimos. */
  team_games: number;
  min_pa: number;
  min_ip: number;
  leaders: TeamLeaders;
  batters: TeamRosterBatter[];
  pitchers: TeamRosterPitcher[];
}
