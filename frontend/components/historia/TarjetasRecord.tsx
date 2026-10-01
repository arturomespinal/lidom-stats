import Link from "next/link";

import type { GrupoHistorico, ResumenHistorico } from "@/lib/types";
import { valorHistorico } from "@/lib/formato";

/**
 * Los dueños de los récords: una tarjeta por categoría principal con su líder
 * de todos los tiempos. Es la portada de /historia y el índice para cambiar de
 * categoría sin abrir el desplegable.
 *
 * En el teléfono es un carrusel horizontal (regla 3 de diseño móvil: tarjetas
 * desplazables para navegación categórica); desde `sm`, una rejilla.
 */
export default function TarjetasRecord({
  resumen,
  grupo,
  stat,
}: {
  resumen: ResumenHistorico;
  grupo: GrupoHistorico;
  stat: string;
}) {
  const todas = (["bateo", "pitcheo"] as const).flatMap((g) => resumen[g].map((c) => ({ ...c, grupo: g })));
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:overflow-visible sm:px-0">
      <ul className="flex gap-2 sm:grid sm:grid-cols-3 lg:grid-cols-5">
        {todas.map((c) => {
          const activa = c.grupo === grupo && c.stat === stat;
          return (
            <li key={`${c.grupo}-${c.stat}`} className="w-40 shrink-0 sm:w-auto">
              <Link
                href={`/historia?grupo=${c.grupo}&stat=${c.stat}`}
                scroll={false}
                aria-current={activa ? "true" : undefined}
                className={`tocable block h-full rounded-xl border px-3 py-2.5 ${
                  activa ? "border-ink bg-ink text-ink-fg" : "border-line bg-card text-fg hover:border-fg2"
                }`}
              >
                <span className={`block truncate text-[10px] font-semibold uppercase tracking-[0.08em] ${activa ? "text-ink-dim" : "text-dim"}`}>
                  {c.label}
                </span>
                <span className="num mt-1 block font-cond text-[34px] leading-none">
                  {c.leader ? valorHistorico(c.stat, c.leader.value) : "—"}
                </span>
                <span className={`mt-1 block truncate text-xs ${activa ? "text-ink-dim" : "text-fg2"}`}>
                  {c.leader?.name ?? "Sin datos"}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
