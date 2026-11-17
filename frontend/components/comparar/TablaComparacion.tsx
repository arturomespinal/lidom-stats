import Link from "next/link";

import TeamBadge from "@/components/TeamBadge";
import type { Comparacion, RenglonComparado } from "@/lib/types";

/**
 * Dos jugadores, renglón por renglón: A a la izquierda, B a la derecha, con
 * barras enfrentadas como "Equipo contra equipo" (components/game/Comparativa).
 *
 * El color no dice de quién es la barra —eso lo dice el lado, con el nombre
 * y la teja arriba— sino quién gana el renglón: la del ganador en tinta, la
 * otra en gris, y su cifra en negrita. Quién gana lo decide el servidor
 * (src/comparar.py): en efectividad, WHIP, boletos por 9 y ponches por
 * aparición gana el MÁS BAJO, y su barra es la corta. Los renglones de
 * volumen (juegos, apariciones, aperturas) van sin barras: se muestran para
 * dar contexto, no se ganan.
 */

function Barra({ valor, maximo, gana, lado }: { valor: number; maximo: number; gana: boolean; lado: "izq" | "der" }) {
  const ancho = valor > 0 && maximo > 0 ? Math.max(4, (valor / maximo) * 100) : 0;
  return (
    <div className={`flex h-2 flex-1 ${lado === "izq" ? "justify-end" : "justify-start"}`}>
      <div
        className={`h-2 ${lado === "izq" ? "rounded-l-full" : "rounded-r-full"} ${gana ? "bg-accent" : "bg-line"}`}
        style={{ width: `${ancho}%` }}
      />
    </div>
  );
}

function Renglon({ f }: { f: RenglonComparado }) {
  const a = f.a ?? 0;
  const b = f.b ?? 0;
  const max = Math.max(a, b);
  const peso = (gana: boolean) =>
    !f.decides ? "text-fg2" : gana ? "font-bold text-fg" : f.better ? "text-dim" : "text-fg";
  return (
    <tr className="border-t border-line-soft first:border-0">
      <td className={`w-16 py-2 text-left tabular-nums ${peso(f.better === "a")}`}>{f.a_text}</td>
      <td className="py-2">
        <p className="text-center text-xs text-dim">{f.label}</p>
        {f.decides && f.a != null && f.b != null && (
          <div className="mt-1 flex items-center gap-1" aria-hidden="true">
            <Barra valor={a} maximo={max} gana={f.better === "a"} lado="izq" />
            <Barra valor={b} maximo={max} gana={f.better === "b"} lado="der" />
          </div>
        )}
      </td>
      <td className={`w-16 py-2 text-right tabular-nums ${peso(f.better === "b")}`}>{f.b_text}</td>
    </tr>
  );
}

export default function TablaComparacion({ cmp }: { cmp: Comparacion }) {
  const [pa, pb] = cmp.players;
  const pie = (p: typeof pa) =>
    [p.volume, p.age != null ? `${p.age} años` : null, p.teams.length > 1 ? p.teams.join(" · ") : null]
      .filter(Boolean)
      .join(" · ");
  return (
    <section aria-label={`${pa.full_name} contra ${pb.full_name}`} className="rounded-xl border border-line bg-card px-4 py-3">
      <div className="mb-3 flex items-start justify-between gap-3 border-b border-line pb-3">
        <Link href={`/players/${pa.player_id}`} className="group flex min-w-0 items-center gap-2">
          {pa.team_code && <TeamBadge code={pa.team_code} size="sm" />}
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold text-fg group-hover:underline">{pa.full_name}</span>
            <span className="block text-[11px] leading-snug text-dim">{pie(pa) || "Sin cifras"}</span>
          </span>
        </Link>
        <Link href={`/players/${pb.player_id}`} className="group flex min-w-0 flex-row-reverse items-center gap-2 text-right">
          {pb.team_code && <TeamBadge code={pb.team_code} size="sm" />}
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold text-fg group-hover:underline">{pb.full_name}</span>
            <span className="block text-[11px] leading-snug text-dim">{pie(pb) || "Sin cifras"}</span>
          </span>
        </Link>
      </div>
      <table className="w-full text-sm">
        <caption className="sr-only">
          {pa.full_name} contra {pb.full_name}, {cmp.role === "batting" ? "bateo" : "pitcheo"}, {cmp.season_label}
        </caption>
        <tbody>
          {cmp.rows.map((f) => (
            <Renglon key={f.key} f={f} />
          ))}
        </tbody>
      </table>
    </section>
  );
}
