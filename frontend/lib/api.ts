import {
  BattingRow,
  LiveDetailResponse,
  LiveGameState,
  PitchingRow,
  StandingRow,
} from "@/lib/types";

/* Se exporta porque el marcador en vivo arma la URL del EventSource a mano:
   SSE no pasa por fetch. */
export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function apiFetch<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_BASE}${path}`, { cache: "no-store" });
    if (!res.ok) return null;
    return res.json() as Promise<T>;
  } catch {
    return null;
  }
}

export async function fetchSeasons(): Promise<string[]> {
  const data = await apiFetch<{ seasons: string[] }>("/seasons");
  return data?.seasons ?? [];
}

export async function fetchStandings(season: string): Promise<StandingRow[]> {
  const data = await apiFetch<{ data: StandingRow[] }>(
    `/standings?season=${season}`
  );
  return data?.data ?? [];
}

export async function fetchBatting(
  season: string,
  opts: { team?: string; min_pa?: number; sort_by?: string; limit?: number } = {}
): Promise<BattingRow[]> {
  const params = new URLSearchParams({ season });
  if (opts.team) params.set("team", opts.team);
  if (opts.min_pa != null && Number.isFinite(opts.min_pa)) params.set("min_pa", String(opts.min_pa));
  if (opts.sort_by) params.set("sort_by", opts.sort_by);
  if (opts.limit) params.set("limit", String(opts.limit));

  const data = await apiFetch<{ data: BattingRow[] }>(`/batting?${params}`);
  return data?.data ?? [];
}

export async function fetchPitching(
  season: string,
  opts: { team?: string; min_ip?: number; sort_by?: string; limit?: number } = {}
): Promise<PitchingRow[]> {
  const params = new URLSearchParams({ season });
  if (opts.team) params.set("team", opts.team);
  if (opts.min_ip != null && Number.isFinite(opts.min_ip)) params.set("min_ip", String(opts.min_ip));
  if (opts.sort_by) params.set("sort_by", opts.sort_by);
  if (opts.limit) params.set("limit", String(opts.limit));

  const data = await apiFetch<{ data: PitchingRow[] }>(`/pitching?${params}`);
  return data?.data ?? [];
}

/* ── En vivo ─────────────────────────────────────────────────────────────── */

export async function fetchLiveGames(
  onlyLive = false
): Promise<LiveGameState[]> {
  const q = onlyLive ? "?only_live=true" : "";
  const data = await apiFetch<{ data: LiveGameState[] }>(`/live/games${q}`);
  return data?.data ?? [];
}

export interface LiveStatus {
  poller_running: boolean;
  tracked: number;
  live: number;
  final: number;
  polls: number;
  full_fetches: number;
  patch_applications: number;
  patch_ratio: number | null;
}

export async function fetchLiveStatus(): Promise<LiveStatus | null> {
  return apiFetch<LiveStatus>("/live/status");
}

/* La URL del flujo SSE de un juego. EventSource la consume directamente. */
export function liveStreamUrl(gamePk: number): string {
  return `${API_BASE}/live/games/${gamePk}/stream`;
}

/**
 * Detalle de un juego: relato, línea por entradas, boxscore y alineaciones.
 *
 * Devuelve la respuesta ENTERA y no solo `data`, porque `is_updating` es lo
 * que le dice a la página cuándo dejar de refrescar.
 */
export async function fetchGameDetail(
  gamePk: number,
  plays = 40
): Promise<LiveDetailResponse | null> {
  return apiFetch<LiveDetailResponse>(
    `/live/games/${gamePk}/detail?plays=${plays}`
  );
}

/**
 * URL del escudo de un equipo.
 *
 * Los archivos los sirve el backend desde static/crests/. Si no existe, la
 * petición da 404 y TeamBadge cae a las siglas — por eso esto nunca comprueba
 * nada antes de devolver la URL.
 */
export function crestUrl(code: string): string {
  return `${API_BASE}/static/crests/${code}.png`;
}
