"use client";

import { Fragment, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import type { RaceSeries } from "@/lib/types";
import { TEAM_STYLES } from "@/lib/constants";
import { marcasRedondas } from "@/lib/formato";
import { useAncho } from "./useAncho";

const ALTO = 280;
const M = { izq: 36, der: 76, arriba: 20, abajo: 26 };
// 3.0:1 sobre blanco: el mínimo para una marca gráfica. Contexto, no dato.
const RESTO = "#8A96A9";

function signo(n: number): string {
  return n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0";
}

/** Juegos sobre .500 tras `i` juegos → récord. g − p = v, g + p = i. */
function record(i: number, v: number): string {
  return `${(i + v) / 2}-${(i - v) / 2}`;
}

/**
 * La carrera por el banderín: juegos sobre .500 de los seis, partido a
 * partido, con el equipo de la ficha resaltado y los otros cinco de contexto.
 * Misma gráfica que la del móvil (`mobile/src/components/CarreraBanderin.tsx`).
 *
 * - **Un solo color con significado.** Los seis en sus colores serían seis
 *   rojos-magentas-azules imposibles de separar (Toros y Gigantes a ΔE 7.4).
 *   El equipo va en su tinta, 3 px; el resto en gris, 1.5 px.
 * - **Cada línea lleva su código al final**: sin leyenda de colores.
 * - **La línea de .500 es la referencia**, sólida y recesiva.
 * - **El pico del equipo va marcado** con su récord: es el punto del que
 *   habla el titular.
 * - **El puntero lee a los seis en ese juego**, ordenados como iban. Es la
 *   pregunta que la gráfica provoca: "¿y quién iba segundo ahí?".
 */
export default function CarreraBanderin({ carrera, equipo }: { carrera: RaceSeries[]; equipo: string }) {
  const [ref, ancho] = useAncho<HTMLDivElement>();
  const [sel, setSel] = useState<number | null>(null);
  const propia = carrera.find((c) => c.team_code === equipo);
  if (!propia || propia.series.length < 3) return null;

  const tinta = TEAM_STYLES[equipo]?.text ?? "rgb(var(--ink))";
  const todos = carrera.flatMap((c) => c.series);
  const hi = Math.max(...todos, 1) + 1;
  const lo = Math.min(...todos, -1) - 1;
  const n = Math.max(...carrera.map((c) => c.series.length - 1));
  const pw = Math.max(ancho - M.izq - M.der, 1);
  const ph = ALTO - M.arriba - M.abajo;
  const X = (g: number) => M.izq + (g / n) * pw;
  const Y = (v: number) => M.arriba + ((hi - v) / (hi - lo)) * ph;

  const pico = Math.max(...propia.series);
  const ip = propia.series.indexOf(pico);

  // Etiquetas al final, separadas al menos 13 px: se ordenan por altura y se
  // empujan hacia abajo cuando chocan.
  const etiquetas = carrera
    .map((c) => ({
      code: c.team_code,
      fin: c.series[c.series.length - 1],
      x: X(c.series.length - 1),
      y: Y(c.series[c.series.length - 1]),
    }))
    .sort((a, b) => a.y - b.y);
  for (let k = 1; k < etiquetas.length; k++) {
    if (etiquetas[k].y - etiquetas[k - 1].y < 13) etiquetas[k].y = etiquetas[k - 1].y + 13;
  }

  // Marcas redondas (−5, 0, +5…) y el cero siempre: es la línea de .500.
  const ticks = Array.from(new Set([...marcasRedondas(lo, hi, 6), 0])).sort((a, b) => b - a);
  const orden = [...carrera.filter((c) => c.team_code !== equipo), propia];
  const marcasX = [10, 20, 30, 40, 50, 60].filter((x) => x <= n);

  // Los seis en el juego elegido, del mejor al peor.
  const enJuego =
    sel != null
      ? carrera
          .filter((c) => sel < c.series.length)
          .map((c) => ({ code: c.team_code, v: c.series[sel] }))
          .sort((a, b) => b.v - a.v)
      : [];

  const alMover = (e: PointerEvent<SVGSVGElement>) => {
    const x = e.clientX - e.currentTarget.getBoundingClientRect().left;
    setSel(Math.min(Math.max(Math.round(((x - M.izq) / pw) * n), 0), n));
  };
  const alTeclear = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const d = e.key === "ArrowLeft" ? -1 : 1;
    setSel((s) => Math.min(Math.max((s ?? n) + d, 0), n));
  };

  return (
    <div className="rounded-xl border border-line bg-card p-3 sm:p-4">
      <div className="flex min-h-6 flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-fg2" aria-live="polite">
        {sel != null ? (
          <span className="num">
            <b className="text-fg">Juego {sel}</b>
            {enJuego.map((t) => (
              <span key={t.code} className={t.code === equipo ? "font-bold" : ""} style={t.code === equipo ? { color: tinta } : undefined}>
                {" · "}
                {t.code} {record(sel, t.v)}
              </span>
            ))}
          </span>
        ) : (
          <>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-[3px] w-4" style={{ backgroundColor: tinta }} /> {equipo}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4" style={{ backgroundColor: RESTO }} /> Resto de la liga
            </span>
          </>
        )}
      </div>

      <div ref={ref} className="mt-2">
        {ancho > 0 && (
          <svg
            width={ancho}
            height={ALTO}
            role="img"
            tabIndex={0}
            aria-label={
              `Juegos sobre .500 partido a partido. ${equipo} llegó a ${record(ip, pico)} y terminó en ` +
              `${signo(propia.series[propia.series.length - 1])}. ` +
              etiquetas.map((e) => `${e.code} ${signo(e.fin)}`).join(", ") +
              ". Flechas izquierda y derecha para recorrer los juegos."
            }
            className="touch-pan-y outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
            onPointerMove={alMover}
            onPointerDown={alMover}
            onPointerLeave={() => setSel(null)}
            onKeyDown={alTeclear}
            onBlur={() => setSel(null)}
          >
            {ticks.map((t) => (
              <Fragment key={t}>
                <line
                  x1={M.izq}
                  x2={M.izq + pw}
                  y1={Y(t)}
                  y2={Y(t)}
                  stroke={t === 0 ? "#9AA6B8" : "rgb(var(--line-soft))"}
                />
                <text x={M.izq - 6} y={Y(t) + 3.5} fontSize={11} fill="rgb(var(--dim))" textAnchor="end" className="num">
                  {t === 0 ? ".500" : signo(t)}
                </text>
              </Fragment>
            ))}
            {marcasX.map((x) => (
              <text key={x} x={X(x)} y={ALTO - 6} fontSize={11} fill="rgb(var(--dim))" textAnchor="middle" className="num">
                {x}
              </text>
            ))}
            <text x={M.izq} y={ALTO - 6} fontSize={11} fill="rgb(var(--dim))" className="num">
              Juego
            </text>
            {sel != null && (
              <line x1={X(sel)} x2={X(sel)} y1={M.arriba} y2={M.arriba + ph} stroke="rgb(var(--fg2))" strokeDasharray="3 3" />
            )}
            {orden.map((c) => (
              <polyline
                key={c.team_code}
                points={c.series.map((v, i) => `${X(i)},${Y(v)}`).join(" ")}
                fill="none"
                stroke={c.team_code === equipo ? tinta : RESTO}
                strokeWidth={c.team_code === equipo ? 3 : 1.5}
                strokeLinejoin="round"
              />
            ))}
            {sel != null && sel < propia.series.length && (
              <circle cx={X(sel)} cy={Y(propia.series[sel])} r={5} fill={tinta} stroke="#FFFFFF" strokeWidth={2} />
            )}
            {pico > 0 && (
              <>
                <circle cx={X(ip)} cy={Y(pico)} r={5} fill={tinta} stroke="#FFFFFF" strokeWidth={2} />
                <text x={X(ip)} y={Y(pico) - 10} fontSize={13} fontWeight={700} fill={tinta} textAnchor="middle" className="num">
                  {record(ip, pico)}
                </text>
              </>
            )}
            {etiquetas.map((e) => (
              <text
                key={e.code}
                x={e.x + 7}
                y={e.y + 4}
                fontSize={e.code === equipo ? 13 : 12}
                fontWeight={e.code === equipo ? 700 : 400}
                fill={e.code === equipo ? tinta : "rgb(var(--dim))"}
                className="num"
              >
                {`${e.code} ${signo(e.fin)}`}
              </text>
            ))}
          </svg>
        )}
        {ancho === 0 && <div style={{ height: ALTO }} />}
      </div>

      {/* La tabla: el récord de cada uno cada diez juegos y al final. */}
      <details className="mt-2 text-xs text-dim">
        <summary className="cursor-pointer select-none py-1 hover:text-fg">Ver datos</summary>
        <div className="overflow-x-auto">
          <table className="num mt-2 w-full min-w-[360px]">
            <thead>
              <tr className="text-[11px] uppercase tracking-[0.06em]">
                <th className="py-1 text-left font-medium">Equipo</th>
                {marcasX.map((x) => (
                  <th key={x} className="py-1 text-right font-medium">
                    J{x}
                  </th>
                ))}
                <th className="py-1 text-right font-medium">Final</th>
              </tr>
            </thead>
            <tbody>
              {[...carrera]
                .sort((a, b) => b.series[b.series.length - 1] - a.series[a.series.length - 1])
                .map((c) => (
                  <tr key={c.team_code} className={`border-t border-line-soft ${c.team_code === equipo ? "font-bold text-fg" : "text-fg2"}`}>
                    <td className="py-1">{c.team_code}</td>
                    {marcasX.map((x) => (
                      <td key={x} className="py-1 text-right">
                        {x < c.series.length ? record(x, c.series[x]) : "—"}
                      </td>
                    ))}
                    <td className="py-1 text-right">{record(c.series.length - 1, c.series[c.series.length - 1])}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
