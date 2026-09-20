import {
  BattingRow,
  LiveDetailResponse,
  LiveGameState,
  PitchingRow,
  PlayerProfile,
  PlayerSearchHit,
  StandingRow,
  TeamProfile,
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

/* ── Fichas ──────────────────────────────────────────────────────────────── */

/**
 * Ficha de un jugador: biografía, todas sus temporadas y los totales de
 * carrera ya compuestos por el servidor.
 *
 * Devuelve `null` en vez de lanzar, como el resto de este módulo: la página
 * decide si eso es un 404 o un backend caído, y la diferencia no se puede
 * hacer aquí sin duplicar el manejo de errores en cada llamada.
 */
export async function fetchPlayerProfile(
  playerId: string
): Promise<PlayerProfile | null> {
  return apiFetch<PlayerProfile>(`/players/${encodeURIComponent(playerId)}`);
}

export async function searchPlayers(
  query: string,
  limit = 20
): Promise<PlayerSearchHit[]> {
  // La API exige 2 caracteres y devuelve 422 con uno solo. Cortar aquí evita
  // un viaje garantizado a fallar mientras alguien escribe la primera letra.
  if (query.trim().length < 2) return [];
  const params = new URLSearchParams({ q: query.trim(), limit: String(limit) });
  const data = await apiFetch<{ data: PlayerSearchHit[] }>(
    `/players/search?${params}`
  );
  return data?.data ?? [];
}

/**
 * Ficha de un equipo: historial por temporada, plantilla y cuerpo de lanzadores.
 *
 * Es UNA llamada y no tres a propósito: la pantalla pinta las tres cosas a la
 * vez, y encadenar tres viajes para dibujar una sola vista es justo lo que
 * hace que una ficha tarde en aparecer.
 */
export async function fetchTeamProfile(
  code: string,
  season: string,
  rosterLimit = 30
): Promise<TeamProfile | null> {
  const params = new URLSearchParams({
    season,
    roster_limit: String(rosterLimit),
  });
  return apiFetch<TeamProfile>(`/teams/${code}?${params}`);
}

// crestUrl() se eliminó junto con los escudos. Las marcas de equipo ahora son
// propias y se dibujan en TeamBadge — no hay archivo que pedirle al backend.
