"use client";

import { useMemo, useState, KeyboardEvent, PointerEvent } from "react";
import { TEAM_STYLES } from "@/lib/constants";
import { WinProbPoint } from "@/lib/types";

interface Props {
  points: WinProbPoint[];
  /** La probabilidad de ahora. `null` cuando el juego terminó. */
  current: number | null;
  homeCode: string;
  awayCode: string;
  /** El titular del juego terminado, ya compuesto por el backend. */
  headline: string | null;
}

/**
 * La franja de probabilidad de ganar — la firma de la pantalla de juego.
 *
 * Es el único dato que ningún otro producto de LIDOM tiene: un modelo
 * calibrado con 14 temporadas de esta liga (src/winprob.py), no una tabla
 * importada de Grandes Ligas. Por eso va arriba y grande.
 *
 * ── La forma ──────────────────────────────────────────────────────────────
 * UNA serie —la probabilidad del local— contra la línea del 50%. El área
 * entre la curva y esa línea se tiñe al 16% con el color del equipo que va
 * favorecido en ese tramo. La primera maqueta pintaba toda la franja con los
 * dos colores a saturación completa; la skill de visualización lo marca como
 * anti-patrón (bloques saturados grandes) y tenía razón: gritaba más que el
 * marcador. Un lavado deja que el color diga de quién es el tramo sin tapar
 * la curva, que es el dato.
 *
 * ── El color refuerza, no identifica ──────────────────────────────────────
 * Toros, Escogido y Gigantes caen los tres en la familia roja-magenta
 * (Gigantes↔Toros ΔE 7.4, validado). En un Toros–Gigantes los dos lavados
 * serían casi iguales. No importa: el local va SIEMPRE arriba y el visitante
 * abajo, y los dos llevan su código escrito. La posición identifica; el color
 * acompaña.
 *
 * ── El eje X es el juego, no el reloj ─────────────────────────────────────
 * Los puntos llegan cuando la probabilidad se mueve, no a intervalos fijos.
 * Cada uno se coloca en su media entrada, repartido dentro de ella, y el eje
 * mide nueve entradas aunque el juego vaya por la tercera: la curva avanza de
 * izquierda a derecha y el hueco que queda es lo que falta por jugar.
 *
 * El SVG se estira con `preserveAspectRatio="none"` para llenar cualquier
 * ancho; por eso los trazos llevan `vector-effect: non-scaling-stroke` y los
 * puntos y la mira van en HTML encima — un círculo dentro de un SVG estirado
 * se dibujaría como un óvalo.
 */

const VB_W = 1000;
const VB_H = 100;
const LAVADO = 0.16;

/** Posición de cada punto en medias entradas: 0 = alta del 1ro. */
function posicionesX(points: WinProbPoint[]): number[] {
  const porMitad = new Map<number, number[]>();
  points.forEach((p, i) => {
    const mitad = (p.inning - 1) * 2 + (p.is_top ? 0 : 1);
    porMitad.set(mitad, [...(porMitad.get(mitad) ?? []), i]);
  });
  const xs = new Array<number>(points.length);
  porMitad.forEach((indices, mitad) => {
    indices.forEach((i, j) => {
      // j / k y no (j + .5) / k: el primer punto del juego tiene que tocar el
      // borde izquierdo, o la curva arranca flotando.
      xs[i] = mitad + j / indices.length;
    });
  });
  return xs;
}

/**
 * Los dos porcentajes del par, que SIEMPRE suman 100.
 *
 * Redondear cada uno por su lado da 89% + 12% = 101% cuando la probabilidad
 * es 0.885 (88.5 → 89 y 11.5 → 12). En un resultado con dos salidas eso se
 * lee como un error, así que el visitante es el complemento del local, no un
 * segundo redondeo. Mismo cálculo que en el móvil.
 */
function par(wp: number): { local: string; visita: string } {
  const n = Math.round(wp * 100);
  return { local: `${n}%`, visita: `${100 - n}%` };
}

export default function WinProbBand({
  points,
  current,
  homeCode,
  awayCode,
  headline,
}: Props) {
  const [sel, setSel] = useState<number | null>(null);

  const geo = useMemo(() => {
    const xs = posicionesX(points);
    const ultimaMitad = Math.max(...xs.map(Math.floor));
    // Nueve entradas como mínimo; más si hubo extra.
    const dominio = Math.max(18, ultimaMitad + 1);
    const X = (x: number) => (x / dominio) * VB_W;
    const Y = (wp: number) => (1 - wp) * VB_H;
    const coords = points.map((p, i) => [X(xs[i]), Y(p.wp)] as const);

    const curva = coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(2)}`);
    const linea = `M${curva.join(" L")}`;
    const [x0] = coords[0];
    const [xN] = coords[coords.length - 1];
    const area = `${linea} L${xN.toFixed(1)},50 L${x0.toFixed(1)},50 Z`;

    // Entradas del eje: 1, 3, 5, 7, 9 y cada extra. Números, no ordinales:
    // un número no hay que traducirlo.
    const entradas = Math.ceil(dominio / 2);
    const ticks = Array.from({ length: entradas }, (_, k) => k + 1)
      .filter((n) => n % 2 === 1 || n > 9)
      .map((n) => ({ n, left: ((n - 1) * 2) / dominio }));

    return { xs, dominio, coords, linea, area, ticks };
  }, [points]);

  const home = TEAM_STYLES[homeCode]?.primary ?? "rgb(var(--dim))";
  const away = TEAM_STYLES[awayCode]?.primary ?? "rgb(var(--dim))";
  
  const ultimo = points[points.length - 1];
  // En final `current` es null a propósito —ya no hay probabilidad, hay
  // resultado— y el último punto del recorrido es el 100% / 0% real.
  const ahora = current ?? ultimo.wp;

  function elegirPorPuntero(e: PointerEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * geo.dominio;
    let mejor = 0;
    geo.xs.forEach((xi, i) => {
      if (Math.abs(xi - x) < Math.abs(geo.xs[mejor] - x)) mejor = i;
    });
    setSel(mejor);
  }

  function teclado(e: KeyboardEvent<HTMLDivElement>) {
    const n = points.length;
    const actual = sel ?? n - 1;
    const mover: Record<string, number> = {
      ArrowLeft: Math.max(0, actual - 1),
      ArrowRight: Math.min(n - 1, actual + 1),
      Home: 0,
      End: n - 1,
    };
    if (e.key in mover) {
      e.preventDefault();
      setSel(mover[e.key]);
    } else if (e.key === "Escape") {
      setSel(null);
    }
  }

  const marcado = sel ?? points.length - 1;
  const [mx, my] = geo.coords[marcado];
  const p = points[marcado];
  const izq = mx / VB_W;

  return (
    <section aria-label="Probabilidad de ganar" className="mt-4">
      {/* Leyenda con los valores delante: el lector ya sabe qué equipo es cada
          color; lo que quiere es el número. Texto en tinta, nunca en el color
          del equipo — el cuadrito lleva la identidad. */}
      <div className="mb-2 flex items-baseline gap-4">
        <span className="text-[10px] uppercase tracking-[0.1em] text-faint">
          Prob. de ganar
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: away }} />
          <span className="font-cond text-[13px] font-bold tracking-[0.04em] text-fg2">
            {awayCode}
          </span>
          <span className="num text-sm font-semibold text-fg">{par(ahora).visita}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: home }} />
          <span className="font-cond text-[13px] font-bold tracking-[0.04em] text-fg2">
            {homeCode}
          </span>
          <span className="num text-sm font-semibold text-fg">{par(ahora).local}</span>
        </span>
      </div>

      <div
        role="group"
        tabIndex={0}
        aria-label={`Recorrido de la probabilidad. ${homeCode} arriba, ${awayCode} abajo. Flechas para recorrerlo.`}
        onPointerMove={elegirPorPuntero}
        onPointerDown={elegirPorPuntero}
        onPointerLeave={() => setSel(null)}
        onKeyDown={teclado}
        onBlur={() => setSel(null)}
        className="relative h-28 cursor-crosshair touch-pan-y rounded-md bg-sunken/60 outline-none focus-visible:ring-2 focus-visible:ring-fg/60 sm:h-32"
      >
        {/* Etiquetas de lado: quién está arriba y quién abajo. Es lo que hace
            que el color no tenga que identificar solo. */}
        <span className="pointer-events-none absolute left-2 top-1.5 font-cond text-[11px] font-bold tracking-[0.06em] text-dim">
          {homeCode}
        </span>
        <span className="pointer-events-none absolute bottom-1.5 left-2 font-cond text-[11px] font-bold tracking-[0.06em] text-dim">
          {awayCode}
        </span>

        <svg
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full"
          aria-hidden="true"
        >
          <defs>
            <clipPath id="wp-arriba">
              <rect x="0" y="0" width={VB_W} height="50" />
            </clipPath>
            <clipPath id="wp-abajo">
              <rect x="0" y="50" width={VB_W} height="50" />
            </clipPath>
          </defs>

          {/* El lavado de cada lado: la misma área, recortada a su mitad. */}
          <path d={geo.area} fill={home} fillOpacity={LAVADO} clipPath="url(#wp-arriba)" />
          <path d={geo.area} fill={away} fillOpacity={LAVADO} clipPath="url(#wp-abajo)" />

          {/* La línea del 50%: sólida y recesiva. Punteada es ruido. */}
          <line
            x1="0"
            y1="50"
            x2={VB_W}
            y2="50"
            stroke="rgb(var(--line))"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />

          {/* La mira */}
          {sel !== null && (
            <line
              x1={mx}
              y1="0"
              x2={mx}
              y2={VB_H}
              stroke="rgb(var(--fg) / .35)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          )}

          {/* La curva: una serie, en tinta, 2 px. */}
          <path
            d={geo.linea}
            fill="none"
            stroke="rgb(var(--fg))"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {/* El punto marcado: en HTML para que sea redondo. Anillo del color
            de la superficie para que se lea encima de la curva. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-fg ring-2 ring-sunken"
          style={{ left: `${izq * 100}%`, top: `${my}%` }}
        />

        {sel !== null && (
          <div
            className="pointer-events-none absolute top-1 z-10 w-max rounded-md border border-line bg-raised px-2.5 py-1.5 shadow-lg"
            // Se ancla al lado que tiene sitio: a la derecha del punto en la
            // primera mitad, a la izquierda en la segunda.
            style={
              izq < 0.55
                ? { left: `calc(${izq * 100}% + 10px)` }
                : { right: `calc(${(1 - izq) * 100}% + 10px)` }
            }
          >
            <div className="text-[10px] uppercase tracking-[0.08em] text-faint">
              {p.label}
            </div>
            <div className="num mt-0.5 text-[11px] text-fg2">
              {awayCode} {p.away} – {p.home} {homeCode}
            </div>
            <div className="mt-1 flex items-center gap-3">
              <span className="flex items-center gap-1.5">
                <span className="h-0.5 w-2.5" style={{ background: home }} />
                <span className="num text-sm font-semibold text-fg">{par(p.wp).local}</span>
                <span className="text-[11px] text-dim">{homeCode}</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-0.5 w-2.5" style={{ background: away }} />
                <span className="num text-sm font-semibold text-fg">{par(p.wp).visita}</span>
                <span className="text-[11px] text-dim">{awayCode}</span>
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Eje: números de entrada. */}
      <div className="relative mt-1 h-4" aria-hidden="true">
        {geo.ticks.map((t) => (
          <span
            key={t.n}
            className="num absolute text-[10px] text-faint"
            style={{ left: `${t.left * 100}%` }}
          >
            {t.n}
          </span>
        ))}
      </div>

      {/* El titular lo escribe el dato y lo compone el backend
          (titular_recorrido), para que la web y el teléfono digan lo mismo. */}
      {headline && <p className="mt-2 text-sm text-fg2">{headline}</p>}

      {/* Lo que dice el lector de pantalla al recorrer con las flechas. */}
      <p className="sr-only" aria-live="polite">
        {sel !== null
          ? `${p.label}: ${awayCode} ${p.away}, ${homeCode} ${p.home}. ${homeCode} ${par(p.wp).local}, ${awayCode} ${par(p.wp).visita}.`
          : ""}
      </p>

      {/* La tabla: el tooltip mejora, nunca es la única puerta al dato. */}
      <details className="mt-2 text-xs">
        <summary className="cursor-pointer select-none text-dim hover:text-fg">
          Ver datos ({points.length} momentos)
        </summary>
        <table className="mt-2 w-full">
          <thead>
            <tr className="text-[10px] uppercase tracking-[0.08em] text-faint">
              <th className="py-1 text-left font-medium">Momento</th>
              <th className="py-1 text-right font-medium">Marcador</th>
              <th className="py-1 text-right font-medium">{homeCode}</th>
              <th className="py-1 text-right font-medium">{awayCode}</th>
            </tr>
          </thead>
          <tbody>
            {points.map((q, i) => (
              <tr key={i} className="border-t border-line-soft">
                <td className="py-1 text-fg2">{q.label}</td>
                <td className="num py-1 text-right text-fg2">
                  {q.away}–{q.home}
                </td>
                <td className="num py-1 text-right text-fg">{par(q.wp).local}</td>
                <td className="num py-1 text-right text-fg">{par(q.wp).visita}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}
