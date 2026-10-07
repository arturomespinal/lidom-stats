import TeamBadge from "@/components/TeamBadge";
import { KeyPlay } from "@/lib/types";

/**
 * Las jugadas que más movieron la probabilidad de ganar, de la que más a la
 * que menos. Las calcula el backend (`jugadas_clave` en src/live/store.py)
 * con la misma curva que la franja de arriba; el cambio es desde el equipo
 * que bateaba: un doble play le resta al suyo.
 */
export default function JugadasClave({
  jugadas,
  awayCode,
  homeCode,
}: {
  jugadas: KeyPlay[];
  awayCode: string;
  homeCode: string;
}) {
  if (jugadas.length === 0) return null;
  return (
    <div className="mt-3 border-t border-line pt-3">
      <p className="mb-2 text-[10px] uppercase tracking-wide text-dim">Jugadas clave</p>
      <ol className="space-y-2">
        {jugadas.map((j) => {
          const sube = j.swing > 0;
          return (
            <li key={j.index} className="flex items-center gap-3">
              <TeamBadge code={j.team_code ?? "—"} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-fg">
                  <span className="font-semibold">{j.event_es ?? "Jugada"}</span>
                  {j.batter ? ` de ${j.batter}` : ""}
                </p>
                <p className="text-xs tabular-nums text-dim">
                  {j.half_label} · {awayCode} {j.away}-{j.home} {homeCode}
                </p>
              </div>
              <span
                className={`num shrink-0 font-cond text-2xl leading-none ${sube ? "text-fg" : "text-dim"}`}
                aria-label={`${sube ? "subió" : "bajó"} ${Math.abs(j.swing)} puntos la probabilidad de ${j.team_code ?? "su equipo"}`}
              >
                {sube ? "+" : "−"}
                {Math.abs(j.swing)}%
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
