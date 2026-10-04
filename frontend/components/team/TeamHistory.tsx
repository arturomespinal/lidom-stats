import Link from "next/link";
import { TeamSeasonRow } from "@/lib/types";
import { TEAM_STYLES } from "@/lib/constants";

interface Props {
  history: TeamSeasonRow[];
  teamCode: string;
  /** La temporada que muestra la ficha: su fila va marcada y las demás la abren. */
  elegida: string;
}

/** ±N con el signo SIEMPRE visible. El signo es el dato, no el color. */
function conSigno(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

/**
 * El rendimiento por temporada: una barra por campaña más la tabla.
 *
 * ── Por qué la barra y la tabla, y no una sola ────────────────────────────
 * La tabla contesta "¿cuántas ganaron en 2018?" y la barra contesta "¿va
 * mejorando?". Son dos preguntas distintas y la segunda no se lee de una
 * columna de números.
 *
 * ── El signo, no el color ─────────────────────────────────────────────────
 * El diferencial usa verde y rojo, que en deuteranopia quedan a ΔE 6.7: para
 * un ojo de cada doce son el mismo color. Por eso el número lleva el signo
 * escrito y la barra tiene una línea de cero visible: quien no distinga los
 * tonos lee igual el dato, y quien sí los distinga lo lee más rápido.
 */
export default function TeamHistory({ history, teamCode, elegida }: Props) {
  const color = TEAM_STYLES[teamCode]?.primary ?? "rgb(var(--fg2))";

  // La barra se escala contra el mejor porcentaje del propio equipo y no
  // contra 1.000: una escala de 0 a 1 aplasta catorce temporadas entre .400 y
  // .650 en un tercio del ancho y no se distingue una de otra.
  const maxPct = Math.max(...history.map((f) => f.win_pct ?? 0), 0.001);

  return (
    <div>
      <div className="overflow-hidden rounded-xl border border-line bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-header text-[11px] uppercase tracking-[0.06em] text-dim">
              <th className="px-3 py-2.5 text-left font-medium">Temporada</th>
              <th className="px-2 py-2.5 text-right font-medium" title="Ganados">
                G
              </th>
              <th className="px-2 py-2.5 text-right font-medium" title="Perdidos">
                P
              </th>
              <th
                className="px-2 py-2.5 text-right font-medium"
                title="Porcentaje de victorias"
              >
                PCT
              </th>
              {/* La barra no lleva encabezado con texto: el ancho ya se explica
                  solo, y una palabra ahí compite con los números. */}
              <th className="hidden w-[34%] px-3 py-2.5 sm:table-cell" />
              <th
                className="px-2 py-2.5 text-right font-medium"
                title="Carreras anotadas"
              >
                CA
              </th>
              <th
                className="px-2 py-2.5 text-right font-medium"
                title="Carreras permitidas"
              >
                CP
              </th>
              <th
                className="px-3 py-2.5 text-right font-medium"
                title="Diferencial de carreras"
              >
                DIF
              </th>
            </tr>
          </thead>
          <tbody>
            {history.map((f) => {
              const pct = f.win_pct ?? 0;
              const es = f.season_id === elegida;
              return (
                <tr
                  key={f.season_id}
                  aria-current={es ? "true" : undefined}
                  className={`border-b border-line-soft last:border-0 ${es ? "bg-raised" : "hover:bg-raised"}`}
                >
                  <td className={`num px-3 py-2 text-fg ${es ? "shadow-[inset_3px_0_0_rgb(var(--ink))]" : ""}`}>
                    {es ? (
                      <b>{f.season_id}</b>
                    ) : (
                      <Link href={`/teams/${teamCode}?season=${f.season_id}`} className="underline-offset-2 hover:underline">
                        {f.season_id}
                      </Link>
                    )}
                  </td>
                  <td className="num px-2 py-2 text-right font-medium text-fg">
                    {f.wins}
                  </td>
                  <td className="num px-2 py-2 text-right text-fg2">{f.losses}</td>
                  <td className="num px-2 py-2 text-right font-medium text-fg">
                    {pct.toFixed(3).slice(1)}
                  </td>
                  <td className="hidden px-3 py-2 sm:table-cell">
                    <div className="h-1.5 w-full rounded-full bg-sunken">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${(pct / maxPct) * 100}%`,
                          backgroundColor: color,
                        }}
                      />
                    </div>
                  </td>
                  <td className="num px-2 py-2 text-right text-fg2">
                    {f.runs_for}
                  </td>
                  <td className="num px-2 py-2 text-right text-fg2">
                    {f.runs_against}
                  </td>
                  <td
                    className={`num px-3 py-2 text-right font-medium ${
                      f.run_diff > 0
                        ? "text-pos"
                        : f.run_diff < 0
                          ? "text-neg"
                          : "text-fg2"
                    }`}
                  >
                    {conSigno(f.run_diff)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-[11px] text-faint">
        Serie regular.
      </p>
    </div>
  );
}
