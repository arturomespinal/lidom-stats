import { BattingRow, PitchingRow, StandingRow } from "@/lib/types";

const API_BASE =
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
  if (opts.min_pa != null) params.set("min_pa", String(opts.min_pa));
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
  if (opts.min_ip != null) params.set("min_ip", String(opts.min_ip));
  if (opts.sort_by) params.set("sort_by", opts.sort_by);
  if (opts.limit) params.set("limit", String(opts.limit));

  const data = await apiFetch<{ data: PitchingRow[] }>(`/pitching?${params}`);
  return data?.data ?? [];
}
