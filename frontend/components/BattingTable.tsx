"use client";

import { useState } from "react";
import Link from "next/link";
import TeamBadge from "@/components/TeamBadge";
import { BattingRow } from "@/lib/types";

type SortKey =
  | "ops"
  | "batting_avg"
  | "on_base_pct"
  | "slugging_pct"
  | "home_runs"
  | "rbi"
  | "hits"
  | "stolen_bases"
  | "plate_appearances";

const COLUMNS: { key: SortKey; label: string; title: string }[] = [
  { key: "batting_avg", label: "AVG", title: "Promedio de bateo" },
  { key: "on_base_pct", label: "OBP", title: "On-base percentage" },
  { key: "slugging_pct", label: "SLG", title: "Slugging percentage" },
  { key: "ops", label: "OPS", title: "On-base plus slugging" },
  { key: "home_runs", label: "HR", title: "Home runs" },
  { key: "rbi", label: "RBI", title: "Carreras impulsadas" },
  { key: "hits", label: "H", title: "Hits" },
  { key: "stolen_bases", label: "SB", title: "Bases robadas" },
  { key: "plate_appearances", label: "PA", title: "Turnos al bate" },
];

const fmt = {
  avg: (v: number | null) =>
    v != null ? v.toFixed(3).replace(/^0/, "") : "—",
  ops: (v: number | null) =>
    v != null ? v.toFixed(3) : "—",
};

interface SortBtnProps {
  col: (typeof COLUMNS)[number];
  active: boolean;
  asc: boolean;
  onClick: () => void;
}

function SortBtn({ col, active, asc, onClick }: SortBtnProps) {
  return (
    <th
      className={`px-3 py-3 text-center cursor-pointer select-none transition-colors ${
        active
          ? "text-accent bg-raised shadow-[inset_0_-2px_0_rgb(var(--accent))]"
          : "text-dim hover:text-fg"
      }`}
      title={col.title}
      onClick={onClick}
    >
      <span className="inline-flex items-center gap-0.5 text-xs uppercase tracking-wider">
        {col.label}
        <span className="text-[10px] opacity-60">
          {active ? (asc ? "↑" : "↓") : ""}
        </span>
      </span>
    </th>
  );
}

export default function BattingTable({ data }: { data: BattingRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("ops");
  const [asc, setAsc] = useState(false);

  const toggle = (key: SortKey) => {
    if (key === sortKey) setAsc((a) => !a);
    else { setSortKey(key); setAsc(false); }
  };

  const sorted = [...data].sort((a, b) => {
    const av = (a[sortKey] as number | null) ?? -Infinity;
    const bv = (b[sortKey] as number | null) ?? -Infinity;
    return asc ? av - bv : bv - av;
  });

  return (
    <div className="overflow-x-auto table-scroll rounded-lg border border-line">
      <table className="w-full text-sm whitespace-nowrap">
        <thead>
          <tr className="bg-header">
            <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-dim">
              Jugador
            </th>
            <th className="px-3 py-3 text-center text-xs uppercase tracking-wider text-dim">
              Equipo
            </th>
            <th className="px-3 py-3 text-center text-xs uppercase tracking-wider text-dim">
              JJ
            </th>
            {COLUMNS.map((col) => (
              <SortBtn
                key={col.key}
                col={col}
                active={sortKey === col.key}
                asc={asc}
                onClick={() => toggle(col.key)}
              />
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <tr
              key={row.player_id ?? `${row.player}-${i}`}
              className="border-t border-line bg-card hover:bg-raised transition-colors"
            >
              <td className="px-4 py-2.5 font-medium">
                {/* El nombre lleva a la ficha: las catorce temporadas del
                    hombre, no solo esta. Sin slug, texto quieto. */}
                {row.player_id ? (
                  <Link
                    href={`/players/${row.player_id}`}
                    className="text-fg underline-offset-2 hover:underline"
                  >
                    {row.player}
                  </Link>
                ) : (
                  row.player
                )}
              </td>
              <td className="px-3 py-2.5 text-center">
                <Link
                  href={`/teams/${row.team_id}`}
                  className="inline-block"
                  aria-label={`Ver ${row.team_id}`}
                >
                  <TeamBadge code={row.team_id} />
                </Link>
              </td>
              <td className="px-3 py-2.5 text-center text-dim">
                {row.games}
              </td>
              <td className="px-3 py-2.5 text-center font-mono">
                {fmt.avg(row.batting_avg)}
              </td>
              <td className="px-3 py-2.5 text-center font-mono text-dim">
                {fmt.avg(row.on_base_pct)}
              </td>
              <td className="px-3 py-2.5 text-center font-mono text-dim">
                {fmt.avg(row.slugging_pct)}
              </td>
              <td
                className={`px-3 py-2.5 text-center font-mono font-semibold ${
                  sortKey === "ops" ? "text-accent" : ""
                }`}
              >
                {fmt.ops(row.ops)}
              </td>
              <td className="px-3 py-2.5 text-center">{row.home_runs}</td>
              <td className="px-3 py-2.5 text-center text-dim">
                {row.rbi}
              </td>
              <td className="px-3 py-2.5 text-center text-dim">
                {row.hits}
              </td>
              <td className="px-3 py-2.5 text-center text-dim">
                {row.stolen_bases}
              </td>
              <td className="px-3 py-2.5 text-center text-dim">
                {row.plate_appearances}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
