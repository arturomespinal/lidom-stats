"use client";

import { useState } from "react";
import TeamBadge from "@/components/TeamBadge";
import { PitchingRow } from "@/lib/types";

type SortKey =
  | "era"
  | "whip"
  | "strikeouts_per_nine"
  | "strikeouts"
  | "innings_pitched"
  | "wins"
  | "saves"
  | "walks_per_nine";

const COLUMNS: { key: SortKey; label: string; title: string; asc?: boolean }[] = [
  { key: "era",               label: "ERA",  title: "Efectividad (menor = mejor)", asc: true },
  { key: "whip",              label: "WHIP", title: "Hits + BB por entrada (menor = mejor)", asc: true },
  { key: "innings_pitched",   label: "IP",   title: "Entradas lanzadas" },
  { key: "strikeouts",        label: "SO",   title: "Ponches" },
  { key: "strikeouts_per_nine", label: "K/9", title: "Ponches por 9 entradas" },
  { key: "walks_per_nine",    label: "BB/9", title: "Bases por bolas por 9 (menor = mejor)", asc: true },
  { key: "wins",              label: "G",    title: "Victorias" },
  { key: "saves",             label: "SV",   title: "Salvados" },
];

function fmt2(v: number | null) {
  return v != null ? v.toFixed(2) : "—";
}

function fmtIP(v: number | null) {
  if (v == null) return "—";
  const whole = Math.floor(v);
  const thirds = Math.round((v - whole) * 3);
  return thirds === 0 ? `${whole}.0` : `${whole}.${thirds}`;
}

interface SortBtnProps {
  col: (typeof COLUMNS)[number];
  active: boolean;
  ascending: boolean;
  onClick: () => void;
}

function SortBtn({ col, active, ascending, onClick }: SortBtnProps) {
  return (
    <th
      className={`px-3 py-3 text-center cursor-pointer select-none transition-colors ${
        active ? "text-[#58a6ff] bg-[#1c2128]" : "text-[#8b949e] hover:text-[#f0f6fc]"
      }`}
      title={col.title}
      onClick={onClick}
    >
      <span className="inline-flex items-center gap-0.5 text-xs uppercase tracking-wider">
        {col.label}
        <span className="text-[10px] opacity-60">
          {active ? (ascending ? "↑" : "↓") : ""}
        </span>
      </span>
    </th>
  );
}

export default function PitchingTable({ data }: { data: PitchingRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("era");
  const [asc, setAsc] = useState(true);

  const toggle = (col: (typeof COLUMNS)[number]) => {
    if (col.key === sortKey) {
      setAsc((a) => !a);
    } else {
      setSortKey(col.key);
      setAsc(col.asc ?? false);
    }
  };

  const sorted = [...data].sort((a, b) => {
    const av = (a[sortKey] as number | null) ?? (asc ? Infinity : -Infinity);
    const bv = (b[sortKey] as number | null) ?? (asc ? Infinity : -Infinity);
    return asc ? av - bv : bv - av;
  });

  return (
    <div className="overflow-x-auto table-scroll rounded-lg border border-[#30363d]">
      <table className="w-full text-sm whitespace-nowrap">
        <thead>
          <tr className="bg-[#21262d]">
            <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-[#8b949e]">
              Lanzador
            </th>
            <th className="px-3 py-3 text-center text-xs uppercase tracking-wider text-[#8b949e]">
              Equipo
            </th>
            <th className="px-3 py-3 text-center text-xs uppercase tracking-wider text-[#8b949e]">
              JJ
            </th>
            <th className="px-3 py-3 text-center text-xs uppercase tracking-wider text-[#8b949e]">
              ABR
            </th>
            {COLUMNS.map((col) => (
              <SortBtn
                key={col.key}
                col={col}
                active={sortKey === col.key}
                ascending={asc}
                onClick={() => toggle(col)}
              />
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <tr
              key={`${row.player}-${i}`}
              className="border-t border-[#30363d] bg-[#161b22] hover:bg-[#1c2128] transition-colors"
            >
              <td className="px-4 py-2.5 font-medium">{row.player}</td>
              <td className="px-3 py-2.5 text-center">
                <TeamBadge code={row.team_id} />
              </td>
              <td className="px-3 py-2.5 text-center text-[#8b949e]">
                {row.games}
              </td>
              <td className="px-3 py-2.5 text-center text-[#8b949e]">
                {row.games_started}
              </td>
              <td
                className={`px-3 py-2.5 text-center font-mono font-semibold ${
                  sortKey === "era" ? "text-[#58a6ff]" : ""
                }`}
              >
                {fmt2(row.era)}
              </td>
              <td className="px-3 py-2.5 text-center font-mono text-[#8b949e]">
                {fmt2(row.whip)}
              </td>
              <td className="px-3 py-2.5 text-center text-[#8b949e]">
                {fmtIP(row.innings_pitched)}
              </td>
              <td className="px-3 py-2.5 text-center">{row.strikeouts}</td>
              <td className="px-3 py-2.5 text-center font-mono text-[#8b949e]">
                {fmt2(row.strikeouts_per_nine)}
              </td>
              <td className="px-3 py-2.5 text-center font-mono text-[#8b949e]">
                {fmt2(row.walks_per_nine)}
              </td>
              <td className="px-3 py-2.5 text-center">{row.wins}</td>
              <td className="px-3 py-2.5 text-center text-[#8b949e]">
                {row.saves}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
