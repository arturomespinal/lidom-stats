import TeamBadge from "@/components/TeamBadge";
import { TeamDetail } from "@/lib/types";

/**
 * Equipo contra equipo: barras enfrentadas, el visitante a la izquierda y el
 * local a la derecha, como en el marcador.
 *
 * El color no dice de qué equipo es cada barra —eso lo dice el lado, con su
 * código arriba— sino quién va adelante en esa fila: la barra mayor en tinta,
 * la otra en gris. Seis colores de club serían tres rojos indistinguibles.
 */

const FILAS: { clave: keyof NonNullable<TeamDetail["totals"]>; etiqueta: string }[] = [
  { clave: "hits", etiqueta: "Hits" },
  { clave: "home_runs", etiqueta: "Jonrones" },
  { clave: "walks", etiqueta: "Boletos" },
  { clave: "strikeouts", etiqueta: "Ponches" },
  { clave: "left_on_base", etiqueta: "Dejados en base" },
  { clave: "pitches", etiqueta: "Lanzamientos" },
];

function Barra({ valor, maximo, gana, lado }: { valor: number; maximo: number; gana: boolean; lado: "izq" | "der" }) {
  // Un cero no lleva barra; cualquier otro valor, al menos un trazo visible.
  const ancho = valor > 0 && maximo > 0 ? Math.max(4, (valor / maximo) * 100) : 0;
  return (
    <div className={`flex h-2 flex-1 ${lado === "izq" ? "justify-end" : "justify-start"}`}>
      <div
        className={`h-2 ${lado === "izq" ? "rounded-l-full" : "rounded-r-full"} ${gana ? "bg-ink" : "bg-line"}`}
        style={{ width: `${ancho}%` }}
      />
    </div>
  );
}

export default function Comparativa({ away, home }: { away: TeamDetail; home: TeamDetail }) {
  if (!away.totals || !home.totals) return null;
  const a = away.totals;
  const h = home.totals;
  return (
    <section aria-label="Equipo contra equipo" className="rounded-xl border border-line bg-card px-4 py-3">
      <div className="mb-3 flex items-center justify-between">
        <TeamBadge code={away.team_code ?? "—"} size="sm" />
        <p className="text-[10px] uppercase tracking-wide text-dim">Equipo contra equipo</p>
        <TeamBadge code={home.team_code ?? "—"} size="sm" />
      </div>
      <table className="w-full text-sm">
        <caption className="sr-only">
          {away.team_code} contra {home.team_code}: hits, jonrones, boletos, ponches, dejados en base y lanzamientos
        </caption>
        <tbody>
          {FILAS.map(({ clave, etiqueta }) => {
            const va = a[clave];
            const vh = h[clave];
            const max = Math.max(va, vh);
            return (
              <tr key={clave}>
                <td className="w-10 py-1.5 text-left font-semibold tabular-nums text-fg">{va}</td>
                <td className="py-1.5">
                  <p className="mb-1 text-center text-xs text-dim">{etiqueta}</p>
                  <div className="flex items-center gap-1" aria-hidden="true">
                    <Barra valor={va} maximo={max} gana={va >= vh && va > 0} lado="izq" />
                    <Barra valor={vh} maximo={max} gana={vh >= va && vh > 0} lado="der" />
                  </div>
                </td>
                <td className="w-10 py-1.5 text-right font-semibold tabular-nums text-fg">{vh}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
