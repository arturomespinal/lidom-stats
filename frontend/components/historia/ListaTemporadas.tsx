import Link from "next/link";

import type { MejoresTemporadas, TemporadaHistorica } from "@/lib/types";
import { valorHistorico } from "@/lib/formato";
import { Equipos } from "./ListaLideres";
import { rutaJugador } from "./rutas";

/**
 * Las mejores temporadas de la historia en una categoría: lo que un jugador
 * hizo en UNA campaña, no en la carrera.
 *
 * Mismas filas que ListaLideres, sin la tarjeta navy: esa ya está arriba, con
 * el récord de carrera, y dos en la misma página se disputan el ojo.
 *
 * La temporada va escrita bajo el nombre. Los equipos, en sus tejas desde sm;
 * en el móvil las tejas se esconden y esa línea los nombra por su código. Un jugador puede
 * salir varias veces (Ralph Garr tiene tres de los mejores promedios), así que
 * la llave es jugador + temporada.
 */
export default function ListaTemporadas({ datos }: { datos: MejoresTemporadas }) {
  if (datos.data.length === 0) {
    return (
      <p className="rounded-xl border border-line bg-card px-4 py-8 text-center text-sm text-dim">
        Ninguna temporada alcanza el mínimo en esta categoría.
      </p>
    );
  }
  return (
    <ol className="overflow-hidden rounded-xl border border-line bg-card">
      {datos.data.map((t) => (
        <Fila key={`${t.player_id ?? t.id_miembro}-${t.season_id}`} t={t} stat={datos.stat} />
      ))}
    </ol>
  );
}

function Fila({ t, stat }: { t: TemporadaHistorica; stat: string }) {
  const ruta = rutaJugador(t);
  const cuerpo = (
    <>
      <span className="num w-7 shrink-0 text-right text-sm text-dim">{t.rank}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold text-fg">{t.name}</span>
        <span className="num block truncate text-xs text-dim">
          {t.season_id}
          {/* Desde sm los equipos van en sus tejas, a la derecha. */}
          <span className="sm:hidden"> · {t.teams.join(" / ")}</span>
        </span>
      </span>
      <span className="hidden sm:flex">
        <Equipos codigos={t.teams} />
      </span>
      <span className="num w-16 shrink-0 text-right text-lg font-semibold text-fg">{valorHistorico(stat, t.value)}</span>
    </>
  );
  const clase = "flex min-h-14 items-center gap-3 px-4 py-2.5";
  return (
    <li className="border-b border-line-soft last:border-0">
      {ruta ? (
        <Link href={ruta} className={`${clase} hover:bg-raised`}>
          {cuerpo}
        </Link>
      ) : (
        <div className={clase}>{cuerpo}</div>
      )}
    </li>
  );
}
