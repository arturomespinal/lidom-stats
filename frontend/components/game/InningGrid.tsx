import TeamBadge from "@/components/TeamBadge";
import { DetailInning, LiveGameDetail } from "@/lib/types";

/**
 * El cuadro clásico por entradas, con R-H-E al final.
 *
 * Una media entrada que no se jugó lleva PUNTO, no cero: el local que va
 * ganando no batea en la baja del 9no, y un 0 ahí diría que bateó y no anotó.
 * El backend manda null justamente para poder distinguirlo.
 *
 * Va en la pantalla principal del juego, en su tarjeta (6-oct, captura de
 * SofaScore): antes era una pestaña. La entrada en curso lleva su número en
 * rojo, el de "EN VIVO".
 */

function Row({
  code,
  cells,
  totals,
  batting,
}: {
  code: string | null;
  cells: (number | null)[];
  totals: [number, number, number];
  batting: boolean;
}) {
  return (
    <tr className="border-t border-line">
      <th scope="row" className="py-2 pr-2 text-left font-normal sm:pr-3">
        <span className="flex items-center gap-1.5">
          {/* El triángulo marca quién batea, igual que en la tarjeta. */}
          <span aria-hidden className="w-2 text-[11px] text-warn">
            {batting ? "▸" : ""}
          </span>
          <TeamBadge code={code ?? "—"} />
        </span>
      </th>
      {cells.map((v, i) => (
        <td
          key={i}
          className={`px-1 py-2 text-center tabular-nums sm:px-2 ${
            v === null ? "text-faint" : "text-fg2"
          }`}
        >
          {v === null ? "·" : v}
        </td>
      ))}
      <td className="px-1 py-2 text-center sm:px-2 text-base font-bold tabular-nums text-fg">
        {totals[0]}
      </td>
      <td className="px-1 py-2 text-center sm:px-2 tabular-nums text-fg2">{totals[1]}</td>
      <td className="px-1 py-2 text-center sm:px-2 tabular-nums text-fg2">{totals[2]}</td>
    </tr>
  );
}

export default function InningGrid({ detail }: { detail: LiveGameDetail }) {
  const jugadas = detail.innings;

  if (jugadas.length === 0) {
    return (
      <p className="px-4 py-10 text-center text-sm text-dim">
        El juego no ha comenzado.
      </p>
    );
  }

  // El backend solo manda las entradas JUGADAS. Un marcador de béisbol enseña
  // las nueve desde el primer lanzamiento: las que faltan van en blanco, y eso
  // también dice cuánto queda de juego.
  const total = Math.max(detail.scheduled_innings, jugadas.length);
  const innings: DetailInning[] = Array.from(
    { length: total },
    (_, i) =>
      jugadas[i] ?? {
        num: i + 1,
        ordinal_es: null,
        away_runs: null,
        home_runs: null,
        away_hits: 0,
        home_hits: 0,
      }
  );

  // Se mira sobre `jugadas`, no sobre `innings`, que ahora lleva relleno.
  const last = jugadas[jugadas.length - 1];
  const homeBatting =
    detail.status === "live" && last.away_runs !== null && last.home_runs === null;
  const enCurso = detail.status === "live" ? last.num : null;

  return (
    <div className="overflow-x-auto table-scroll px-3 py-3 sm:px-4">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-dim">
            <th className="w-14 sm:w-16" />
            {innings.map((i) => (
              <th
                key={i.num}
                className={`px-1 pb-1 text-center font-bold sm:px-2 ${i.num === enCurso ? "text-live" : ""}`}
              >
                {i.num}
                {i.num === enCurso && <span className="sr-only"> (en curso)</span>}
              </th>
            ))}
            <th className="px-1 pb-1 text-center font-bold sm:px-2 text-fg">R</th>
            <th className="px-1 pb-1 text-center font-bold sm:px-2">H</th>
            <th className="px-1 pb-1 text-center font-bold sm:px-2">E</th>
          </tr>
        </thead>
        <tbody>
          <Row
            code={detail.away.team_code}
            cells={innings.map((i) => i.away_runs)}
            totals={[detail.away.runs, detail.away.hits, detail.away.errors]}
            batting={detail.status === "live" && !homeBatting}
          />
          <Row
            code={detail.home.team_code}
            cells={innings.map((i) => i.home_runs)}
            totals={[detail.home.runs, detail.home.hits, detail.home.errors]}
            batting={homeBatting}
          />
        </tbody>
      </table>
    </div>
  );
}
