"use client";

import TeamBadge from "@/components/TeamBadge";
import { StandingRow } from "@/lib/types";

const fmt = {
  pct: (v: number | null) =>
    v != null ? v.toFixed(3).replace(/^0/, "") : "—",
  num: (v: number | null) => (v != null ? String(v) : "—"),
  diff: (v: number | null) => {
    if (v == null) return "—";
    if (v > 0) return `+${v}`;
    return String(v);
  },
};

export default function StandingsTable({ data }: { data: StandingRow[] }) {
  const sorted = [...data].sort(
    (a, b) => (b.win_loss_pct ?? 0) - (a.win_loss_pct ?? 0)
  );

  return (
    <div className="overflow-x-auto table-scroll rounded-lg border border-[#30363d]">
      <table className="w-full text-sm whitespace-nowrap">
        <thead>
          <tr className="bg-[#21262d] text-[#8b949e] text-xs uppercase tracking-wider">
            <th className="px-3 py-3 text-center w-8">#</th>
            <th className="px-4 py-3 text-left">Equipo</th>
            <th className="px-3 py-3 text-center">JJ</th>
            <th className="px-3 py-3 text-center text-[#f0f6fc]">G</th>
            <th className="px-3 py-3 text-center">P</th>
            <th className="px-3 py-3 text-center text-[#f0f6fc]">PCT</th>
            <th className="px-3 py-3 text-center">GB</th>
            <th className="px-3 py-3 text-center hidden lg:table-cell">RF</th>
            <th className="px-3 py-3 text-center hidden lg:table-cell">RC</th>
            <th className="px-3 py-3 text-center hidden lg:table-cell">DCAR</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <tr
              key={row.team_id}
              className="border-t border-[#30363d] bg-[#161b22] hover:bg-[#1c2128] transition-colors"
            >
              <td className="px-3 py-3 text-center text-[#8b949e] text-xs">
                {i + 1}
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <TeamBadge code={row.team_id} />
                  <span className="font-medium">{row.team_name}</span>
                </div>
              </td>
              <td className="px-3 py-3 text-center text-[#8b949e]">
                {fmt.num(row.games_played)}
              </td>
              <td className="px-3 py-3 text-center font-bold">{row.wins}</td>
              <td className="px-3 py-3 text-center text-[#8b949e]">
                {row.losses}
              </td>
              <td className="px-3 py-3 text-center font-bold">
                {fmt.pct(row.win_loss_pct)}
              </td>
              <td className="px-3 py-3 text-center text-[#8b949e]">
                {row.games_back === "-" ? "—" : row.games_back}
              </td>
              <td className="px-3 py-3 text-center text-[#8b949e] hidden lg:table-cell">
                {fmt.num(row.runs_scored)}
              </td>
              <td className="px-3 py-3 text-center text-[#8b949e] hidden lg:table-cell">
                {fmt.num(row.runs_allowed)}
              </td>
              <td className="px-3 py-3 text-center hidden lg:table-cell">
                <span
                  className={`text-xs font-semibold ${
                    (row.run_differential ?? 0) >= 0
                      ? "text-emerald-400"
                      : "text-red-400"
                  }`}
                >
                  {fmt.diff(row.run_differential)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
