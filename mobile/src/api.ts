import { API_BASE, DEFAULT_SEASON } from './config';
import {
  BattingRow,
  LiveDetailResponse,
  LiveGameState,
  PitchingRow,
  StandingRow,
  WinProbResponse,
} from './types';

async function get<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_BASE}${path}`);
    if (!res.ok) return null;
    return res.json() as Promise<T>;
  } catch {
    return null;
  }
}

export async function fetchStandings(season = DEFAULT_SEASON): Promise<StandingRow[]> {
  const data = await get<{ data: StandingRow[] }>(`/standings?season=${season}`);
  return data?.data ?? [];
}

export async function fetchBatting(
  season = DEFAULT_SEASON,
  sortBy = 'ops',
  limit = 50,
): Promise<BattingRow[]> {
  const data = await get<{ data: BattingRow[] }>(
    `/batting?season=${season}&sort_by=${sortBy}&limit=${limit}`,
  );
  return data?.data ?? [];
}

export async function fetchPitching(
  season = DEFAULT_SEASON,
  sortBy = 'era',
  limit = 50,
): Promise<PitchingRow[]> {
  const data = await get<{ data: PitchingRow[] }>(
    `/pitching?season=${season}&sort_by=${sortBy}&limit=${limit}`,
  );
  return data?.data ?? [];
}

/* ── En vivo ─────────────────────────────────────────────────────────────── */

export async function fetchLiveGames(onlyLive = false): Promise<LiveGameState[]> {
  const q = onlyLive ? '?only_live=true' : '';
  const data = await get<{ data: LiveGameState[] }>(`/live/games${q}`);
  return data?.data ?? [];
}

/**
 * Detalle de un juego: relato, línea por entradas, boxscore y alineaciones.
 *
 * Devuelve la respuesta ENTERA, no solo `data`, porque `is_updating` es lo que
 * le dice a la pantalla cuándo dejar de sondear.
 */
export async function fetchGameDetail(
  gamePk: number,
  plays = 25,
): Promise<LiveDetailResponse | null> {
  return get<LiveDetailResponse>(`/live/games/${gamePk}/detail?plays=${plays}`);
}

/**
 * El recorrido de la probabilidad de ganar. La pantalla de juego lo pide en
 * el MISMO ciclo que el detalle: un solo ritmo de sondeo, no dos.
 */
export async function fetchWinProb(gamePk: number): Promise<WinProbResponse | null> {
  return get<WinProbResponse>(`/live/games/${gamePk}/winprob`);
}

// crestUrl() se eliminó junto con los escudos. Las marcas de equipo ahora son
// propias y se dibujan en TeamBadge — no hay archivo que pedirle al backend.
