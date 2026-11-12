"use client";

import { Fragment } from "react";
import Link from "next/link";
import TeamBadge from "@/components/TeamBadge";
import { StandingRow } from "@/lib/types";

/* Tokens de la paleta, no colores crudos de Tailwind: `pos`, `neg` y `warn`
   significan algo y sobreviven a un cambio de paleta. Ver globals.css. */
const POS = "text-pos";
const NEG = "text-neg";
const EVEN = "text-warn";

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
  if (v == null) return "text-dim";
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
    <tr className="bg-bg">
      <td colSpan={span} className="px-4 py-1.5">
        {/* La etiqueta va a la IZQUIERDA, no centrada. La celda abarca el ancho
            completo de la tabla, que en pantalla angosta es más ancho que el
            viewport: centrada, el texto quedaba fuera de vista hasta que el
            usuario hiciera scroll horizontal, justo la etiqueta que más
            importa. Pegada a la izquierda se ve siempre. */}
        {/* `pos`, el verde del tema: el esmeralda de Tailwind que hubo aquí
            venía del tema oscuro y sobre este fondo daba 1.9:1. */}
        <div className="flex items-center gap-3">
          <div className="h-px w-6 shrink-0 bg-pos/40" />
          <span className="whitespace-nowrap text-[10px] font-bold uppercase tracking-wider text-pos">
            Clasifican al round robin
          </span>
          <div className="h-px flex-1 bg-pos/40" />
        </div>
      </td>
    </tr>
  );
}

export default function StandingsTable({
  data,
  season,
}: {
  data: StandingRow[];
  /** Viaja en el enlace a la ficha para no perder la temporada que se mira. */
  season: string;
}) {
  // No se reordena aquí: la API ordena por PCT y calcula playoff_spot sobre ese
  // orden. Reordenar en el cliente correría el corte de equipo en silencio.
  const cutIndex = data.findIndex((r) => !r.playoff_spot) - 1;
  const COLS = 11;

  return (
    <div className="overflow-x-auto table-scroll rounded-lg border border-line">
      <table className="w-full text-sm whitespace-nowrap">
        <thead>
          <tr className="bg-header text-dim text-xs uppercase tracking-wider">
            <th className="w-8 px-2 py-3 text-center sm:px-3">#</th>
            <th className="px-2 py-3 text-left sm:px-4">Equipo</th>
            <th className="hidden px-3 py-3 text-center sm:table-cell">JJ</th>
            <th className="px-1.5 py-3 text-center text-fg sm:px-3">G</th>
            <th className="px-1.5 py-3 text-center sm:px-3">P</th>
            <th className="px-1.5 py-3 text-center text-fg sm:px-3">PCT</th>
            <th className="px-1.5 py-3 text-center sm:px-3">GB</th>
            <th
              className="px-1.5 py-3 text-center text-fg sm:px-3"
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
                className={`border-t border-line transition-colors hover:bg-raised ${
                  row.playoff_spot ? "bg-card" : "bg-sunken"
                }`}
              >
                <td className="px-2 py-3 text-center text-xs sm:px-3">
                  <span
                    className={
                      row.playoff_spot
                        ? "font-bold text-fg"
                        : "text-dim"
                    }
                  >
                    {i + 1}
                  </span>
                </td>
                <td className="py-2.5 pl-1 pr-2 sm:pr-4">
                  <div className="flex items-center gap-2 sm:gap-3">
                    {/* El equipo lleva a su ficha: es el gesto natural
                        después de leer una tabla de posiciones. */}
                    <Link
                      href={`/teams/${row.team_id}?season=${season}`}
                      className="flex items-center gap-2 underline-offset-2 hover:underline sm:gap-3"
                    >
                      {/* La teja sólida lleva el color del club: en el look
                          Pizarra reemplaza a la raya de color que abría la
                          fila, que decía lo mismo dos veces. */}
                      <TeamBadge code={row.team_id} variant="solid" />
                      {/* En el teléfono, el nombre corto ("Águilas") y sin la
                          columna JJ: así G, P, PCT, GB y CLAS caben en 390 px
                          sin deslizar. Con el nombre completo solo se veían
                          JJ y G, y lo que se viene a mirar quedaba fuera. */}
                      <span className="font-medium sm:hidden">{row.short_name ?? row.team_name}</span>
                      <span className="hidden font-medium sm:inline">{row.team_name}</span>
                    </Link>
                  </div>
                </td>
                <td className="hidden px-3 py-3 text-center text-dim tabular-nums sm:table-cell">
                  {fmt.num(row.games_played)}
                </td>
                <td className="num px-1.5 py-3 text-center font-cond font-bold text-[20px] leading-none sm:px-3">
                  {row.wins}
                </td>
                <td className="num px-1.5 py-3 text-center font-cond text-[20px] leading-none text-dim sm:px-3">
                  {row.losses}
                </td>
                <td className="num px-1.5 py-3 text-center font-cond font-bold text-[20px] leading-none sm:px-3">
                  {fmt.pct(row.win_loss_pct)}
                </td>
                <td className="num px-1.5 py-3 text-center font-cond text-[18px] leading-none text-dim sm:px-3">
                  {row.games_back === "-" ? "—" : row.games_back}
                </td>
                <td
                  className={`num px-1.5 py-3 text-center font-cond font-bold text-[18px] leading-none sm:px-3 ${clasColor(
                    row.playoff_games
                  )}`}
                >
                  {fmt.clas(row.playoff_games)}
                </td>
                <td className="px-3 py-3 text-center text-dim tabular-nums hidden lg:table-cell">
                  {fmt.num(row.runs_scored)}
                </td>
                <td className="px-3 py-3 text-center text-dim tabular-nums hidden lg:table-cell">
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
