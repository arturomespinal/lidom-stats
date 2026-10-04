"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { etiquetaTemporada } from "@/lib/formato";

export interface OpcionTemporada {
  /** Lo que se lee: "2015-16". */
  label: string;
  href: string;
  /** Una línea opcional debajo: "32-17 · .653". */
  nota?: string;
}

/**
 * El selector de temporada: un botón que dice cuál se está viendo y abre una
 * lista desplegable con todas. Lo usan Posiciones, Bateo, Pitcheo y la ficha
 * de equipo; el móvil hace lo mismo con una hoja que sube desde abajo.
 *
 * Reemplazó a las pestañas de temporada (30-sep-2026): catorce pestañas no
 * caben en un teléfono y la elegida quedaba cortada por el borde.
 *
 * Las opciones son enlaces: la temporada sigue viviendo en la URL, así un
 * enlace compartido abre en esa temporada y el botón de atrás funciona.
 *
 * Teclado: flecha abajo (o Enter) en el botón abre la lista con el foco en la
 * elegida; flechas, Inicio y Fin se mueven; Escape cierra y devuelve el foco
 * al botón. Un clic fuera también cierra.
 */
export function SelectorOpciones({
  opciones,
  activa,
  titulo = "Temporada",
  resumen,
  icono = true,
  antes,
}: {
  opciones: OpcionTemporada[];
  /** La `label` de la elegida. */
  activa: string;
  titulo?: string;
  /** La línea de arriba de la lista. Por defecto, "N temporadas en la base". */
  resumen?: string;
  /** El calendario a la izquierda: solo tiene sentido para temporadas. */
  icono?: boolean;
  /** Controles que van en la misma franja, a la izquierda del botón. */
  antes?: ReactNode;
}) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const lista = useRef<HTMLDivElement>(null);
  const id = useId();

  const items = () => Array.from(lista.current?.querySelectorAll<HTMLAnchorElement>("a") ?? []);

  // Al abrir, el foco va a la elegida (y la lista se desplaza hasta ella).
  useEffect(() => {
    if (!abierto) return;
    const el = items().find((a) => a.getAttribute("aria-selected") === "true") ?? items()[0];
    el?.focus({ preventScroll: true });
    // Se desplaza la LISTA, no la página: scrollIntoView movía la ventana
    // entera en la ficha de equipo.
    const l = lista.current;
    if (el && l) l.scrollTop = el.offsetTop - l.clientHeight / 2 + el.offsetHeight / 2;
  }, [abierto]);

  // Clic fuera cierra.
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (!caja.current?.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, [abierto]);

  const teclaLista = (e: React.KeyboardEvent) => {
    const todos = items();
    const i = todos.indexOf(document.activeElement as HTMLAnchorElement);
    const ir = (j: number) => {
      e.preventDefault();
      todos[Math.max(0, Math.min(todos.length - 1, j))]?.focus();
    };
    if (e.key === "ArrowDown") ir(i + 1);
    else if (e.key === "ArrowUp") ir(i - 1);
    else if (e.key === "Home") ir(0);
    else if (e.key === "End") ir(todos.length - 1);
    else if (e.key === "Escape") {
      e.preventDefault();
      setAbierto(false);
      boton.current?.focus();
    } else if (e.key === "Tab") setAbierto(false);
  };

  if (opciones.length < 2) return null;

  return (
    <div className="sticky top-14 z-[5] border-b border-line bg-bg/95 backdrop-blur">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-4 py-2">
        {antes}
        <div ref={caja} className="relative inline-block">
          <button
            ref={boton}
            type="button"
            onClick={() => setAbierto((a) => !a)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" && !abierto) {
                e.preventDefault();
                setAbierto(true);
              }
            }}
            aria-haspopup="listbox"
            aria-expanded={abierto}
            aria-controls={id}
            className="tocable inline-flex min-h-11 items-center gap-2.5 rounded-xl border border-line bg-card pl-3 pr-2.5 shadow-[0_1px_2px_rgb(9_28_58/0.06)] hover:border-fg2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            {icono && <Calendario />}
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-dim">{titulo}</span>
            <span className="font-cond text-[22px] leading-none text-fg">{activa}</span>
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              className={`h-4 w-4 text-fg transition-transform duration-150 motion-reduce:transition-none ${abierto ? "rotate-180" : ""}`}
            >
              <path d="M5 7.5 10 12.5 15 7.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {abierto && (
            <div
              ref={lista}
              id={id}
              role="listbox"
              aria-label={titulo}
              onKeyDown={teclaLista}
              className="desplegar absolute left-0 top-full z-20 mt-2 max-h-[min(70vh,520px)] w-[min(18rem,calc(100vw-2rem))] origin-top-left overflow-y-auto rounded-2xl border border-line bg-card p-1.5 shadow-[0_16px_48px_rgb(9_28_58/0.18)]"
            >
              <p className="px-3 pb-1.5 pt-1 text-[11px] uppercase tracking-[0.08em] text-dim">
                {resumen ?? `${opciones.length} temporadas`}
              </p>
              {opciones.map((o, i) => {
                const es = o.label === activa;
                return (
                  <Link
                    key={o.href}
                    href={o.href}
                    scroll={false}
                    role="option"
                    aria-selected={es}
                    onClick={() => setAbierto(false)}
                    className={`flex min-h-12 items-center gap-3 rounded-xl px-3 py-1.5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ink ${
                      es ? "bg-ink text-ink-fg" : "text-fg hover:bg-raised focus-visible:bg-raised"
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block font-cond text-[24px] leading-none">{o.label}</span>
                      {o.nota && (
                        <span className={`num mt-0.5 block text-xs ${es ? "text-ink-dim" : "text-dim"}`}>{o.nota}</span>
                      )}
                    </span>
                    {i === 0 && !es && (
                      <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-dim">Actual</span>
                    )}
                    {es && (
                      <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5">
                        <circle cx="10" cy="10" r="9" fill="currentColor" opacity="0.18" />
                        <path d="M6 10.5 8.7 13 14 7.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Calendario() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-[18px] w-[18px] text-dim">
      <rect x="3" y="4.5" width="14" height="12" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3 8.5h14M7 3v3M13 3v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/**
 * El selector de las tablas planas: temporadas crudas de /seasons ("2015"),
 * con la etiqueta "2015-16". `conservar` son los demás parámetros de la URL
 * que la página quiere mantener al cambiar de año (el filtro de equipo).
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
  const href = (s: string) => {
    const q = new URLSearchParams();
    q.set("season", s);
    for (const [k, v] of Object.entries(conservar)) if (v) q.set(k, v);
    return `${ruta}?${q.toString()}`;
  };
  return (
    <SelectorOpciones
      opciones={temporadas.map((s) => ({ label: etiquetaTemporada(s), href: href(s) }))}
      activa={etiquetaTemporada(activa)}
    />
  );
}
