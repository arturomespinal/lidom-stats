import Link from "next/link";
import { TeamRosterBatter, TeamRosterPitcher } from "@/lib/types";

function pct(v: number | null | undefined): string {
  if (v == null) return "—";
  return v >= 1 ? v.toFixed(3) : v.toFixed(3).slice(1);
}

function num(v: number | null | undefined, dec = 0): string {
  return v == null ? "—" : v.toFixed(dec);
}

/**
 * La plantilla de una temporada.
 *
 * Cada nombre es un enlace a la ficha del jugador. Es la razón por la que este
 * endpoint devuelve `player_id` y no solo el nombre: el slug ya identifica al
 * hombre a través de las catorce temporadas, así que no hace falta buscarlo
 * por nombre —que es justo donde dos homónimos se confunden—.
 *
 * Las dos tablas son distintas a propósito y no una genérica con columnas
 * parametrizadas: son doce columnas contra trece, se usan una sola vez cada
 * una, y la abstracción costaría más de leer que las dos juntas.
 */

export function Batters({ data }: { data: TeamRosterBatter[] }) {
  return (
    <section>
      <h2 className="mb-2 font-cond text-lg font-bold tracking-[0.02em] text-fg">
        Bateadores
      </h2>
      <div className="overflow-x-auto rounded-xl border border-line bg-card">
        <table className="w-full min-w-[620px] text-sm">
          <thead>
            <tr className="border-b border-line bg-header text-[11px] uppercase tracking-[0.06em] text-dim">
              <th className="px-3 py-2.5 text-left font-medium">Jugador</th>
              <th className="px-2 py-2.5 text-right font-medium" title="Juegos">J</th>
              <th className="px-2 py-2.5 text-right font-medium" title="Apariciones al plato">AP</th>
              <th className="px-2 py-2.5 text-right font-medium" title="Hits">H</th>
              <th className="px-2 py-2.5 text-right font-medium" title="Jonrones">HR</th>
              <th className="px-2 py-2.5 text-right font-medium" title="Carreras impulsadas">CI</th>
              <th className="px-2 py-2.5 text-right font-medium" title="Bases robadas">BR</th>
              <th className="px-2 py-2.5 text-right font-medium" title="Promedio">AVG</th>
              <th className="px-3 py-2.5 text-right font-medium" title="OBP + SLG">OPS</th>
            </tr>
          </thead>
          <tbody>
            {data.map((j) => (
              <tr
                key={j.player_id}
                className="border-b border-line-soft last:border-0 hover:bg-raised"
              >
                <td className="px-3 py-2">
                  <Link
                    href={`/players/${j.player_id}`}
                    className="text-fg underline-offset-2 hover:underline"
                  >
                    {j.full_name}
                  </Link>
                </td>
                <td className="num px-2 py-2 text-right text-fg2">{j.games}</td>
                <td className="num px-2 py-2 text-right text-fg2">{j.pa}</td>
                <td className="num px-2 py-2 text-right text-fg2">{j.h}</td>
                <td className="num px-2 py-2 text-right text-fg2">{j.hr}</td>
                <td className="num px-2 py-2 text-right text-fg2">{j.rbi}</td>
                <td className="num px-2 py-2 text-right text-fg2">{j.sb}</td>
                <td className="num px-2 py-2 text-right font-medium text-fg">
                  {pct(j.avg)}
                </td>
                <td className="num px-3 py-2 text-right font-medium text-fg">
                  {pct(j.ops)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function Pitchers({ data }: { data: TeamRosterPitcher[] }) {
  return (
    <section>
      <h2 className="mb-2 font-cond text-lg font-bold tracking-[0.02em] text-fg">
        Lanzadores
      </h2>
      <div className="overflow-x-auto rounded-xl border border-line bg-card">
        <table className="w-full min-w-[620px] text-sm">
          <thead>
            <tr className="border-b border-line bg-header text-[11px] uppercase tracking-[0.06em] text-dim">
              <th className="px-3 py-2.5 text-left font-medium">Lanzador</th>
              <th className="px-2 py-2.5 text-right font-medium" title="Juegos">J</th>
              <th className="px-2 py-2.5 text-right font-medium" title="Juegos iniciados">JI</th>
              <th className="px-2 py-2.5 text-right font-medium" title="Ganados">G</th>
              <th className="px-2 py-2.5 text-right font-medium" title="Perdidos">P</th>
              <th className="px-2 py-2.5 text-right font-medium" title="Salvados">SV</th>
              <th className="px-2 py-2.5 text-right font-medium" title="Entradas lanzadas">IP</th>
              <th className="px-2 py-2.5 text-right font-medium" title="Ponches">K</th>
              <th className="px-2 py-2.5 text-right font-medium" title="Efectividad">EFE</th>
              <th className="px-3 py-2.5 text-right font-medium" title="Embasados por entrada">WHIP</th>
            </tr>
          </thead>
          <tbody>
            {data.map((j) => (
              <tr
                key={j.player_id}
                className="border-b border-line-soft last:border-0 hover:bg-raised"
              >
                <td className="px-3 py-2">
                  <Link
                    href={`/players/${j.player_id}`}
                    className="text-fg underline-offset-2 hover:underline"
                  >
                    {j.full_name}
                  </Link>
                </td>
                <td className="num px-2 py-2 text-right text-fg2">{j.games}</td>
                <td className="num px-2 py-2 text-right text-fg2">
                  {j.games_started}
                </td>
                <td className="num px-2 py-2 text-right text-fg2">{j.wins}</td>
                <td className="num px-2 py-2 text-right text-fg2">{j.losses}</td>
                <td className="num px-2 py-2 text-right text-fg2">{j.saves}</td>
                <td className="num px-2 py-2 text-right text-fg2">
                  {num(j.innings_pitched, 1)}
                </td>
                <td className="num px-2 py-2 text-right text-fg2">{j.so}</td>
                <td className="num px-2 py-2 text-right font-medium text-fg">
                  {num(j.era, 2)}
                </td>
                <td className="num px-3 py-2 text-right font-medium text-fg">
                  {num(j.whip, 2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
