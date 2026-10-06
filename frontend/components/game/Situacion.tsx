"use client";

import { useEffect, useRef } from "react";
import BaseDiamond, { posicionesDiamante } from "@/components/BaseDiamond";
import { LiveSituation, PlayLine } from "@/lib/types";

/**
 * Lo que está pasando ahora mismo, en la pantalla de un juego: el diamante
 * con los corredores, los outs, la cuenta, quién batea y quién lanza. La
 * misma lectura que la tarjeta del listado en vivo, en grande.
 *
 * ── La jugada que se mueve ──────────────────────────────────────────────────
 * Cuando llega un sencillo, doble, triple, jonrón o ponche nuevo:
 *   - entra una franja navy con corte en diagonal (la firma del kit) con el
 *     nombre de la jugada en Bebas y el bateador, y sale sola a los ~3,5 s;
 *   - en los batazos, un corredor recorre el diamante desde el home hasta la
 *     base a la que llegó; en el jonrón da la vuelta completa.
 *
 * Sin estado ni temporizadores: la franja lleva `key` = el índice de la
 * jugada, así que se monta de nuevo solo cuando hay una jugada nueva y su
 * animación CSS (`.jugada`) entra, se queda y sale sola. El corredor es una
 * animación de la Web Animations API lanzada en un efecto con la misma
 * llave. Con "reducir movimiento" el corredor no corre y la franja aparece
 * sin deslizarse.
 */

const DIAMANTE = 96;

/** Las jugadas que se celebran, y hasta qué base llega el bateador. */
const JUGADAS: Record<string, { titulo: string; bases: number }> = {
  Single: { titulo: "Sencillo", bases: 1 },
  Double: { titulo: "Doble", bases: 2 },
  Triple: { titulo: "Triple", bases: 3 },
  "Home Run": { titulo: "Jonrón", bases: 4 },
  Strikeout: { titulo: "Ponche", bases: 0 },
  "Strikeout Double Play": { titulo: "Ponche", bases: 0 },
};

export function jugadaDestacada(plays: PlayLine[]): PlayLine | null {
  // El relato viene del más reciente al más viejo, y el primero puede ser el
  // turno en curso, todavía sin resultado.
  const ultima = plays.find((p) => p.is_complete);
  return ultima && ultima.event && JUGADAS[ultima.event] ? ultima : null;
}

export default function Situacion({
  situacion,
  jugada,
}: {
  situacion: LiveSituation;
  jugada: PlayLine | null;
}) {
  const corredor = useRef<HTMLSpanElement | null>(null);
  const info = jugada?.event ? JUGADAS[jugada.event] : null;
  const bases = info?.bases ?? 0;
  // Cuánto corre el corredor, y cuándo llega a su base: la base se enciende
  // en ese momento y no antes.
  const duracion = bases > 0 ? 450 * Math.min(bases, 4) + 500 : 0;
  const llegada = Math.round(duracion * 0.9);

  useEffect(() => {
    const el = corredor.current;
    if (!el || bases === 0) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const p = posicionesDiamante(DIAMANTE);
    const ruta = [p.home, p.first, p.second, p.third, p.home].slice(0, bases + 1);
    const r = 5; // radio del corredor
    const paso = (q: { x: number; y: number }) => `translate(${q.x - r}px, ${q.y - r}px)`;
    const n = ruta.length - 1;
    // Mismo ritmo que `duracion`: 450 ms por base, más la entrada y la salida.
    const anim = el.animate(
      [
        { transform: paso(ruta[0]), opacity: 0, offset: 0 },
        { transform: paso(ruta[0]), opacity: 1, offset: 0.06 },
        ...ruta.slice(1).map((q, i) => ({ transform: paso(q), opacity: 1, offset: 0.06 + (0.84 * (i + 1)) / n })),
        { transform: paso(ruta[n]), opacity: 0, offset: 1 },
      ],
      { duration: duracion, easing: "ease-in-out", fill: "forwards" }
    );
    return () => anim.cancel();
  }, [jugada?.index, bases, duracion]);

  const outs = situacion.outs;
  // Entre medias entradas: la cuenta es del turno que ya terminó y el
  // bateador es el que abre la otra mitad. Se dice, en vez de mezclarlas.
  const fin = situacion.half_over_label;
  return (
    <section
      aria-label="Situación del juego"
      className="relative max-w-2xl overflow-hidden rounded-xl border border-line bg-card px-4 py-3"
    >
      {/* En el teléfono los nombres bajan a su propia fila: al lado del
          diamante quedaban cortados ("Al bate N…"). */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <div className="relative shrink-0" style={{ width: DIAMANTE, height: DIAMANTE }}>
          <BaseDiamond runners={situacion.runners} size={DIAMANTE} retrasoLlenado={llegada} />
          <span
            ref={corredor}
            aria-hidden="true"
            className="pointer-events-none absolute left-0 top-0 h-2.5 w-2.5 rounded-full bg-ink opacity-0 ring-2 ring-card"
          />
        </div>

        <div className="shrink-0 space-y-2">
          <div className="flex items-center gap-1.5">
            <span className="w-14 text-[10px] uppercase tracking-wide text-dim">Outs</span>
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className={`h-2.5 w-2.5 rounded-full transition-colors duration-300 ${
                  i < outs ? "bg-warn" : "bg-line"
                }`}
              />
            ))}
            <span className="sr-only">{outs} outs</span>
          </div>
          {fin ? (
            <p className="text-xs font-semibold text-fg2">{fin}</p>
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="w-14 text-[10px] uppercase tracking-wide text-dim">Cuenta</span>
              <span className="num font-cond text-2xl leading-none text-fg">
                {situacion.balls}-{situacion.strikes}
              </span>
            </div>
          )}
        </div>

        <div className="w-full min-w-0 space-y-1 text-sm sm:w-auto sm:flex-1">
          {situacion.batter && (
            <p className="truncate">
              <span className="text-dim">{fin ? "Abre " : "Al bate "}</span>
              <span className="font-semibold text-fg">{situacion.batter}</span>
            </p>
          )}
          {situacion.pitcher && (
            <p className="truncate">
              <span className="text-dim">Lanza </span>
              <span className="font-semibold text-fg">{situacion.pitcher}</span>
            </p>
          )}
          {situacion.on_deck && (
            <p className="truncate text-xs">
              <span className="text-dim">En espera </span>
              <span className="text-fg2">{situacion.on_deck}</span>
            </p>
          )}
        </div>
      </div>

      {jugada && info && (
        <div
          key={jugada.index}
          role="status"
          className="jugada pointer-events-none absolute inset-y-0 right-0 flex w-[66%] flex-col justify-center bg-ink pl-10 pr-4 text-ink-fg sm:w-[55%] sm:pl-12"
          style={{ clipPath: "polygon(36px 0, 100% 0, 100% 100%, 0 100%)" }}
        >
          <p className="font-cond text-[36px] uppercase leading-none tracking-wide sm:text-[44px]">
            {info.titulo}
          </p>
          {jugada.batter && <p className="mt-1 truncate text-sm text-ink-dim">{jugada.batter}</p>}
          {jugada.rbi > 0 && (
            <p className="text-sm font-semibold text-ink-fg">
              {jugada.rbi === 1 ? "1 carrera" : `${jugada.rbi} carreras`}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
