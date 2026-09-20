import Link from "next/link";
import { TeamLeader, TeamLeaders } from "@/lib/types";

/**
 * Los líderes del equipo, en dos filas de tarjetitas.
 *
 * ── Por qué esto existe además de la plantilla ────────────────────────────
 * La plantilla va ordenada por uso, que es lo correcto para una plantilla: se
 * lee de arriba abajo como un roster. Pero eso entierra al mejor. En Águilas
 * 2025-26, el líder de OPS aparece en la fila once y el de bases robadas en la
 * cuarta. Quien abre la ficha de un equipo quiere saber quién es el bueno
 * antes de ponerse a leer treinta filas.
 *
 * ── El mínimo de calificación se muestra, no se esconde ───────────────────
 * Las tasas (AVG, OPS, EFE, WHIP) llevan mínimo y las acumuladas no — regla 10
 * de CLAUDE.md. Un líder de promedio con un asterisco y el mínimo al pie es
 * honesto; uno sin nada invita a preguntar por qué no aparece el que batea
 * 1.000 en un turno.
 */

function valor(stat: string, v: number): string {
  if (["avg", "obp", "slg", "ops"].includes(stat)) {
    return v >= 1 ? v.toFixed(3) : v.toFixed(3).slice(1);
  }
  if (["era", "whip"].includes(stat)) return v.toFixed(2);
  return String(v);
}

/**
 * `min-h-[72px]`: la tarjeta ENTERA es el área táctil, y por debajo de 44 px
 * de alto deja de serlo en un teléfono.
 */
function Tarjeta({ l }: { l: TeamLeader }) {
  return (
    <Link
      href={`/players/${l.player_id}`}
      className="group flex min-h-[72px] min-w-0 flex-col justify-between rounded-lg border border-line bg-card p-3 transition-colors hover:border-fg2"
    >
      <span className="text-[10px] uppercase tracking-[0.08em] text-faint">
        {l.label}
        {/* El asterisco marca lo que lleva mínimo; el pie lo explica. */}
        {l.qualified && <span className="text-dim"> *</span>}
      </span>
      <span className="num mt-1.5 font-cond text-2xl font-bold leading-none text-fg">
        {valor(l.stat, l.value)}
      </span>
      <span className="mt-1.5 truncate text-xs text-fg2 group-hover:text-fg">
        {l.full_name}
      </span>
    </Link>
  );
}

export default function Leaders({
  leaders,
  minPa,
  minIp,
  seasonId,
}: {
  leaders: TeamLeaders;
  minPa: number;
  minIp: number;
  seasonId: string;
}) {
  if (leaders.batting.length === 0 && leaders.pitching.length === 0) return null;

  const hayTasa =
    leaders.batting.some((l) => l.qualified) ||
    leaders.pitching.some((l) => l.qualified);

  return (
    <section>
      <h2 className="mb-2 font-cond text-lg font-bold tracking-[0.02em] text-fg">
        Destacados de {seasonId}
      </h2>

      <div className="space-y-2">
        {/* Rejilla de 2 columnas en teléfono y 5 en escritorio. Con
            `flex-wrap` las cinco tarjetas entraban a la fuerza en 390 px —
            70 px cada una— y todos los nombres salían cortados en "Ader…".
            El número de categorías varía cuando nadie alcanza el mínimo; la
            rejilla lo aguanta dejando la última fila incompleta, que se lee
            mucho mejor que cinco nombres truncados. */}
        {leaders.batting.length > 0 && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {leaders.batting.map((l) => (
              <Tarjeta key={`b-${l.stat}`} l={l} />
            ))}
          </div>
        )}
        {leaders.pitching.length > 0 && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {leaders.pitching.map((l) => (
              <Tarjeta key={`p-${l.stat}`} l={l} />
            ))}
          </div>
        )}
      </div>

      {hayTasa && (
        <p className="mt-2 text-[11px] text-faint">
          * Con mínimo de calificación: {minPa} apariciones al plato para el
          bateo, {minIp} entradas para el pitcheo. Las acumuladas no llevan
          mínimo.
        </p>
      )}
    </section>
  );
}
