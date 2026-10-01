import Link from "next/link";

import TeamBadge from "@/components/TeamBadge";
import type { LiderHistorico, LideresHistoricos } from "@/lib/types";
import { epocaHistorica, valorHistorico } from "@/lib/formato";
import { rutaJugador } from "./rutas";

/**
 * Los líderes de todos los tiempos de una categoría.
 *
 * El primero va en una tarjeta navy con la cifra en Bebas, como el héroe de
 * las fichas: es la respuesta a "¿quién tiene el récord?". El resto, en filas
 * de 56 px con el puesto, la época y los equipos.
 *
 * Los empates comparten puesto (dos .310 son los dos 3º); el servidor ya los
 * numera así.
 */
export default function ListaLideres({ datos }: { datos: LideresHistoricos }) {
  const [primero, ...resto] = datos.data;
  if (!primero) {
    return (
      <p className="rounded-xl border border-line bg-card px-4 py-8 text-center text-sm text-dim">
        Nadie alcanza el mínimo en esta categoría.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      <Primero lider={primero} stat={datos.stat} etiqueta={datos.label} />
      {resto.length > 0 && (
        <ol className="overflow-hidden rounded-xl border border-line bg-card">
          {resto.map((l) => (
            <Fila key={`${l.player_id ?? l.id_miembro}`} lider={l} stat={datos.stat} />
          ))}
        </ol>
      )}
    </div>
  );
}

function Equipos({ codigos, variante = "outline" }: { codigos: string[]; variante?: "outline" | "solid" }) {
  return (
    <span className="flex shrink-0 gap-1">
      {codigos.slice(0, 3).map((c) => (
        <TeamBadge key={c} code={c} size="sm" variant={variante} />
      ))}
      {codigos.length > 3 && <span className="self-center text-[11px] text-dim">+{codigos.length - 3}</span>}
    </span>
  );
}

function Epoca({ l }: { l: LiderHistorico }) {
  return (
    <>
      {epocaHistorica(l.first_season, l.last_season)} · {l.seasons} {l.seasons === 1 ? "temporada" : "temporadas"}
    </>
  );
}

function Primero({ lider, stat, etiqueta }: { lider: LiderHistorico; stat: string; etiqueta: string }) {
  const ruta = rutaJugador(lider);
  const contenido = (
    <div className="relative overflow-hidden rounded-xl bg-ink px-4 py-4 text-ink-fg sm:px-6 sm:py-5">
      {/* Navy y sin color de club: el récord es de la liga, no de un equipo.
          Los equipos van abajo, en sus tejas. */}
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.08em] text-ink-dim">Récord de todos los tiempos · {etiqueta}</p>
          <p className="mt-1 truncate font-cond text-[34px] leading-none sm:text-[44px]">{lider.name}</p>
          <p className="num mt-1.5 text-[13px] text-ink-dim">
            <Epoca l={lider} />
          </p>
        </div>
        <span className="num shrink-0 font-cond text-[56px] leading-none sm:text-[80px]">
          {valorHistorico(stat, lider.value)}
        </span>
      </div>
      <div className="mt-3 border-t border-white/15 pt-3">
        <Equipos codigos={lider.teams} variante="solid" />
      </div>
    </div>
  );
  return ruta ? (
    <Link href={ruta} className="tocable block">
      {contenido}
    </Link>
  ) : (
    contenido
  );
}

function Fila({ lider, stat }: { lider: LiderHistorico; stat: string }) {
  const ruta = rutaJugador(lider);
  const cuerpo = (
    <>
      <span className="num w-7 shrink-0 text-right text-sm text-dim">{lider.rank}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold text-fg">{lider.name}</span>
        <span className="num block truncate text-xs text-dim">
          <Epoca l={lider} />
        </span>
      </span>
      <span className="hidden sm:flex">
        <Equipos codigos={lider.teams} />
      </span>
      <span className="num w-16 shrink-0 text-right text-lg font-semibold text-fg">{valorHistorico(stat, lider.value)}</span>
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
