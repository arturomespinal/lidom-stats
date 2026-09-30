"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { etiquetaTemporada } from "@/lib/formato";

/**
 * Las temporadas de las tablas planas como pestañas de subrayado, pegadas bajo
 * la barra superior: el mismo dibujo que las de la ficha de equipo
 * (`team/TemporadaTabs`). Posiciones, Bateo y Pitcheo lo usan.
 *
 * Son enlaces y no estado: la temporada vive en la URL (`?season=`), así un
 * enlace abre en la temporada que se compartió, el botón de atrás funciona, y
 * la barra superior la lleva de una página a otra. `conservar` son los demás
 * parámetros que la página quiere mantener al cambiar de año (un filtro de
 * equipo, por ejemplo).
 *
 * Con una sola temporada no se pinta: no hay nada que elegir.
 *
 * Es de cliente solo por una cosa: con catorce temporadas la elegida puede
 * quedar fuera del borde en un teléfono (2012-13 es la última), y al abrir la
 * página se trae a la vista.
 */
export default function SelectorTemporada({
  ruta,
  temporadas,
  activa,
  conservar = {},
}: {
  ruta: string;
  temporadas: string[];
  activa: string;
  conservar?: Record<string, string | undefined>;
}) {
  const barra = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = barra.current?.querySelector<HTMLElement>('[aria-current="page"]');
    const caja = barra.current;
    if (el && caja && (el.offsetLeft < caja.scrollLeft || el.offsetLeft + el.offsetWidth > caja.scrollLeft + caja.clientWidth)) {
      caja.scrollTo({ left: Math.max(0, el.offsetLeft - 16) });
    }
  }, [activa]);

  if (temporadas.length < 2) return null;
  const href = (s: string) => {
    const q = new URLSearchParams();
    q.set("season", s);
    for (const [k, v] of Object.entries(conservar)) if (v) q.set(k, v);
    return `${ruta}?${q.toString()}`;
  };
  return (
    <nav aria-label="Temporada" className="sticky top-14 z-[5] border-b border-line bg-bg/95 backdrop-blur">
      <div ref={barra} className="relative mx-auto flex max-w-5xl overflow-x-auto px-4">
        {temporadas.map((s) => {
          const es = s === activa;
          return (
            <Link
              key={s}
              href={href(s)}
              scroll={false}
              aria-current={es ? "page" : undefined}
              className={`tocable num flex h-11 shrink-0 items-center border-b-2 px-3 text-sm transition-colors ${
                es ? "border-ink font-bold text-fg" : "border-transparent text-dim hover:text-fg"
              }`}
            >
              {etiquetaTemporada(s)}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
