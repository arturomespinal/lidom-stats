import Link from "next/link";
import type { CareerTeam } from "@/lib/types";
import { DEFAULT_SEASON, TEAM_STYLES } from "@/lib/constants";
import { rangoTemporadas } from "@/lib/formato";

/**
 * La trayectoria como una sola barra partida por equipo, cada tramo del largo
 * de las temporadas que jugó ahí y en orden cronológico. Se ve de un golpe
 * dónde pasó la mayor parte de su carrera — cosa que una fila de tejas no
 * dice. Cada tramo abre el equipo; el código va escrito en la tinta del club
 * debajo de su color, porque el color solo nunca identifica.
 */
export default function Trayectoria({ equipos }: { equipos: CareerTeam[] }) {
  const orden = [...equipos].sort((a, b) => a.first_season.localeCompare(b.first_season));
  return (
    <div className="flex gap-1">
      {orden.map((t) => {
        const st = TEAM_STYLES[t.team_code];
        return (
          <Link
            key={t.team_code}
            href={`/teams/${t.team_code}?season=${DEFAULT_SEASON}`}
            className="group min-h-11 min-w-14 basis-0 space-y-1.5"
            style={{ flexGrow: t.seasons }}
            aria-label={`${t.team_code}, ${t.seasons} temporadas, ${rangoTemporadas(
              t.first_season,
              t.last_season,
            )}. Abrir equipo`}
          >
            <span
              className="block h-3 rounded-[3px] transition-opacity group-hover:opacity-70"
              style={{ backgroundColor: st?.primary ?? "rgb(var(--line))" }}
            />
            <span
              className="block font-cond text-xl leading-none group-hover:underline"
              style={{ color: st?.text ?? "rgb(var(--fg))" }}
            >
              {t.team_code}
            </span>
            <span className="num block truncate text-[11px] text-dim">
              {rangoTemporadas(t.first_season, t.last_season)}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
