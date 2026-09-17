"use client";

import { Fragment } from "react";
import TeamBadge from "@/components/TeamBadge";
import { TEAM_STYLES } from "@/lib/constants";
import { StandingRow } from "@/lib/types";

const POS = "text-emerald-400";
const NEG = "text-red-400";
const EVEN = "text-amber-400";

const fmt = {
  pct: (v: number | null) => (v != null ? v.toFixed(3).replace(/^0/, "") : "—"),
  num: (v: number | null) => (v != null ? String(v) : "—"),
  diff: (v: number | null) => {
    if (v == null) return "—";
    if (v > 0) return `+${v}`;
    return String(v);
  },
  /** Distancia a la línea, con signo. U+2212 para que alinee con los dígitos. */
  clas: (v: number | null) => {
    if (v == null) return "—";
    if (v === 0) return "0.0";
    return v > 0 ? `+${v.toFixed(1)}` : `−${Math.abs(v).toFixed(1)}`;
  },
};

const clasColor = (v: number | null) => {
  if (v == null) return "text-[#8b949e]";
  if (v > 0) return POS;
  if (v < 0) return NEG;
  return EVEN;
};

/**
 * El corte del round robin, como fila propia dentro de la tabla.
 *
 * Va dentro del <tbody> y no como borde de la fila de arriba para que sea
 * imposible confundirlo con un separador más: la línea entre el 4to y el 5to
 * es lo único que se juega la temporada regular en una liga de seis donde
 * clasifican cuatro.
 */
function CutlineRow({ span }: { span: number }) {
  return (
    <tr className="bg-[#0d1117]">
      <td colSpan={span} className="px-4 py-1.5">
        {/* La etiqueta va a la IZQUIERDA, no centrada. La celda abarca el ancho
            completo de la tabla, que en pantalla angosta es más ancho que el
            viewport: centrada, el texto quedaba fuera de vista hasta que el
            usuario hiciera scroll horizontal, justo la etiqueta que más
            importa. Pegada a la izquierda se ve siempre. */}
        <div className="flex items-center gap-3">
          <div className="h-px w-6 shrink-0 bg-emerald-500/40" />
          <span className="whitespace-nowrap text-[10px] font-bold uppercase tracking-wider text-emerald-400">
            Clasifican al round robin
          </span>
          <div className="h-px flex-1 bg-emerald-500/40" />
        </div>
      </td>
    </tr>
  );
}

export default function StandingsTable({ data }: { data: StandingRow[] }) {
  // No se reordena aquí: la API ordena por PCT y calcula playoff_spot sobre ese
  // orden. Reordenar en el cliente correría el corte de equipo en silencio.
  const cutIndex = data.findIndex((r) => !r.playoff_spot) - 1;
  const COLS = 11;

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
            <th
              className="px-3 py-3 text-center text-[#f0f6fc]"
              title="Juegos de ventaja sobre el primer equipo fuera, o de atraso contra el último clasificado"
            >
              CLAS
            </th>
            <th className="px-3 py-3 text-center hidden lg:table-cell">RF</th>
            <th className="px-3 py-3 text-center hidden lg:table-cell">RC</th>
            <th className="px-3 py-3 text-center hidden lg:table-cell">DCAR</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <Fragment key={row.team_id}>
              <tr
                className={`border-t border-[#30363d] transition-colors hover:bg-[#1c2128] ${
                  row.playoff_spot ? "bg-[#161b22]" : "bg-[#12161c]"
                }`}
              >
                <td className="px-3 py-3 text-center text-xs">
                  <span
                    className={
                      row.playoff_spot
                        ? "font-bold text-[#f0f6fc]"
                        : "text-[#8b949e]"
                    }
                  >
                    {i + 1}
                  </span>
                </td>
                <td className="py-3 pr-4">
                  <div className="flex items-center gap-3">
                    {/* El color oficial del equipo como borde estructural de la
                        fila: es lo que distingue esta tabla de cualquier otra
                        tabla oscura. */}
                    <div
                      className="h-9 w-[3px] shrink-0 rounded-r"
                      style={{
                        backgroundColor:
                          TEAM_STYLES[row.team_id]?.primary ?? "#30363d",
                      }}
                    />
                    <TeamBadge code={row.team_id} />
                    <span className="font-medium">{row.team_name}</span>
                  </div>
                </td>
                <td className="px-3 py-3 text-center text-[#8b949e] tabular-nums">
                  {fmt.num(row.games_played)}
                </td>
                <td className="px-3 py-3 text-center font-bold tabular-nums">
                  {row.wins}
                </td>
                <td className="px-3 py-3 text-center text-[#8b949e] tabular-nums">
                  {row.losses}
                </td>
                <td className="px-3 py-3 text-center font-bold tabular-nums">
                  {fmt.pct(row.win_loss_pct)}
                </td>
                <td className="px-3 py-3 text-center text-[#8b949e] tabular-nums">
                  {row.games_back === "-" ? "—" : row.games_back}
                </td>
                <td
                  className={`px-3 py-3 text-center font-bold tabular-nums ${clasColor(
                    row.playoff_games
                  )}`}
                >
                  {fmt.clas(row.playoff_games)}
                </td>
                <td className="px-3 py-3 text-center text-[#8b949e] tabular-nums hidden lg:table-cell">
                  {fmt.num(row.runs_scored)}
                </td>
                <td className="px-3 py-3 text-center text-[#8b949e] tabular-nums hidden lg:table-cell">
                  {fmt.num(row.runs_allowed)}
                </td>
                <td className="px-3 py-3 text-center hidden lg:table-cell">
                  <span
                    className={`text-xs font-semibold tabular-nums ${
                      (row.run_differential ?? 0) >= 0 ? POS : NEG
                    }`}
                  >
                    {fmt.diff(row.run_differential)}
                  </span>
                </td>
              </tr>
              {i === cutIndex && <CutlineRow span={COLS} />}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
