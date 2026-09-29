"use client";

import { Fragment, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import type { PlayerCurve } from "@/lib/types";
import { TEAM_STYLES } from "@/lib/constants";
import { marcasRedondas, pct3 } from "@/lib/formato";
import { useAncho } from "./useAncho";

const ALTO = 240;
const M = { izq: 40, der: 48, arriba: 14, abajo: 40 };
const LIGA = "#7A879B"; // 3.6:1 sobre blanco: se distingue sin competir
const TINTA = "rgb(var(--ink))";

/**
 * La carrera en una curva: su OPS (o su efectividad) temporada a temporada
 * contra el promedio de la liga. Misma gráfica que la del móvil; lo que se
 * añade aquí es el puntero y la tabla.
 *
 * - **El eje X son SUS temporadas**, de la primera a la última.
 * - **La línea se corta donde no jugó.** Unir 2013-14 con 2016-17 inventaría
 *   dos temporadas que no existen.
 * - **Punto hueco = muestra chica** (menos de 50 AP o 10 entradas).
 * - **Las épocas por equipo van de fondo**, con el código escrito debajo.
 * - **En efectividad el eje va al revés**: más arriba es mejor en las dos.
 * - **El puntero no es la única puerta al dato**: flechas del teclado y la
 *   tabla de "Ver datos".
 */
export default function CurvaCarrera({
  curva,
  equipoPorTemporada,
}: {
  curva: PlayerCurve;
  /** El equipo de más volumen en cada temporada: pinta las épocas. */
  equipoPorTemporada: Record<string, string>;
}) {
  const [ref, ancho] = useAncho<HTMLDivElement>();
  const [sel, setSel] = useState<number | null>(null);
  const esEra = curva.stat === "era";
  const puntos = curva.points;
  if (puntos.length < 2) return null;

  // Temporadas del jugador, sin huecos, de la primera a la última.
  const primera = Number(puntos[0].season_id.slice(0, 4));
  const ultima = Number(puntos[puntos.length - 1].season_id.slice(0, 4));
  const temporadas: string[] = [];
  for (let a = primera; a <= ultima; a++) temporadas.push(`${a}-${String(a + 1).slice(2)}`);
  const idx = (s: string) => temporadas.indexOf(s);
  const puntoDe = new Map(puntos.map((p) => [p.season_id, p]));

  const liga = curva.league.filter((l) => idx(l.season_id) >= 0);
  const ligaDe = new Map(liga.map((l) => [l.season_id, l.value]));
  const valores = [...puntos.map((p) => p.value), ...liga.map((l) => l.value)];
  let lo = Math.min(...valores);
  let hi = Math.max(...valores);
  const pad = (hi - lo) * 0.12 || 0.05;
  lo -= pad;
  hi += pad;

  const pw = Math.max(ancho - M.izq - M.der, 1);
  const ph = ALTO - M.arriba - M.abajo;
  const X = (i: number) => M.izq + (i * pw) / (temporadas.length - 1);
  const Y = (v: number) => M.arriba + (esEra ? (v - lo) / (hi - lo) : (hi - v) / (hi - lo)) * ph;

  // Tramos continuos: se corta donde falta una temporada.
  const tramos: { i: number; v: number }[][] = [];
  let actual: { i: number; v: number }[] = [];
  let anterior = -2;
  for (const p of puntos) {
    const i = idx(p.season_id);
    if (i !== anterior + 1 && actual.length) {
      tramos.push(actual);
      actual = [];
    }
    actual.push({ i, v: p.value });
    anterior = i;
  }
  if (actual.length) tramos.push(actual);

  // Épocas: temporadas seguidas con el mismo equipo.
  const epocas: { code: string; a: number; b: number }[] = [];
  temporadas.forEach((s, i) => {
    const code = equipoPorTemporada[s];
    if (!code) return;
    const u = epocas[epocas.length - 1];
    if (u && u.code === code && u.b === i - 1) u.b = i;
    else epocas.push({ code, a: i, b: i });
  });
  const medio = pw / (temporadas.length - 1) / 2;

  const fmt = (v: number) => (esEra ? v.toFixed(2) : pct3(v));
  const ticks = marcasRedondas(lo, hi, 4);
  const ultimo = puntos[puntos.length - 1];
  const ligaUltima = liga[liga.length - 1];
  const paso = temporadas.length > 12 ? 3 : temporadas.length > 6 ? 2 : 1;
  const etiquetasX = temporadas.map((_, i) => i).filter((i) => i % paso === 0);
  const nombre = esEra ? "EFE" : "OPS";

  // La temporada bajo el puntero, o la que eligió el teclado.
  const elegida = sel != null ? temporadas[sel] : null;
  const pElegido = elegida ? puntoDe.get(elegida) : undefined;
  const lElegida = elegida ? ligaDe.get(elegida) : undefined;

  const alMover = (e: PointerEvent<SVGSVGElement>) => {
    const x = e.clientX - e.currentTarget.getBoundingClientRect().left;
    const i = Math.round(((x - M.izq) / pw) * (temporadas.length - 1));
    setSel(Math.min(Math.max(i, 0), temporadas.length - 1));
  };
  const alTeclear = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const d = e.key === "ArrowLeft" ? -1 : 1;
    setSel((s) => Math.min(Math.max((s ?? temporadas.length - 1) + d, 0), temporadas.length - 1));
  };

  return (
    <div className="rounded-xl border border-line bg-card p-3 sm:p-4">
      {/* La leyenda es también la lectura del puntero: arriba, donde no la
          tapa el cursor ni el dedo. */}
      <div className="flex min-h-6 flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-fg2" aria-live="polite">
        {elegida ? (
          <span className="num">
            <b className="text-fg">{elegida}</b>
            {equipoPorTemporada[elegida] ? ` · ${equipoPorTemporada[elegida]}` : ""}
            {" · "}
            {pElegido ? (
              <>
                <b className="text-fg">
                  {nombre} {fmt(pElegido.value)}
                </b>
                {pElegido.small_sample ? " (muestra chica)" : ""}
              </>
            ) : (
              "no jugó"
            )}
            {lElegida != null ? ` · liga ${fmt(lElegida)}` : ""}
          </span>
        ) : (
          <>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-[3px] w-4 bg-ink" /> El jugador
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4" style={{ backgroundColor: LIGA }} /> Promedio de la liga
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
              `${esEra ? "Efectividad" : "OPS"} por temporada contra la liga. ` +
              `Última: ${fmt(ultimo.value)} en ${ultimo.season_id}. ` +
              "Flechas izquierda y derecha para recorrer las temporadas."
            }
            className="touch-pan-y outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
            onPointerMove={alMover}
            onPointerDown={alMover}
            onPointerLeave={() => setSel(null)}
            onKeyDown={alTeclear}
            onBlur={() => setSel(null)}
          >
            {epocas.map((e, k) => {
              const x0 = Math.max(X(e.a) - medio + 1, M.izq - 6);
              const x1 = Math.min(X(e.b) + medio - 1, M.izq + pw + 6);
              const st = TEAM_STYLES[e.code];
              return (
                <Fragment key={k}>
                  <rect
                    x={x0}
                    y={M.arriba}
                    width={x1 - x0}
                    height={ph}
                    fill={st?.primary ?? "rgb(var(--line))"}
                    opacity={0.1}
                  />
                  {x1 - x0 >= 26 && (
                    <text
                      x={(x0 + x1) / 2}
                      y={ALTO - 4}
                      fontSize={14}
                      className="font-cond"
                      fill={st?.text ?? "rgb(var(--dim))"}
                      textAnchor="middle"
                    >
                      {e.code}
                    </text>
                  )}
                </Fragment>
              );
            })}
            {ticks.map((t) => (
              <Fragment key={t}>
                <line x1={M.izq} x2={M.izq + pw} y1={Y(t)} y2={Y(t)} stroke="rgb(var(--line-soft))" />
                <text x={M.izq - 6} y={Y(t) + 3.5} fontSize={11} fill="rgb(var(--dim))" textAnchor="end" className="num">
                  {fmt(t)}
                </text>
              </Fragment>
            ))}
            {etiquetasX.map((i) => (
              <text key={i} x={X(i)} y={M.arriba + ph + 15} fontSize={11} fill="rgb(var(--dim))" textAnchor="middle" className="num">
                {temporadas[i]}
              </text>
            ))}
            {sel != null && (
              <line x1={X(sel)} x2={X(sel)} y1={M.arriba} y2={M.arriba + ph} stroke="rgb(var(--fg2))" strokeDasharray="3 3" />
            )}
            {liga.length > 1 && (
              <polyline
                points={liga.map((l) => `${X(idx(l.season_id))},${Y(l.value)}`).join(" ")}
                fill="none"
                stroke={LIGA}
                strokeWidth={1.5}
                strokeLinejoin="round"
              />
            )}
            {tramos
              .filter((t) => t.length > 1)
              .map((t, k) => (
                <polyline
                  key={k}
                  points={t.map((p) => `${X(p.i)},${Y(p.v)}`).join(" ")}
                  fill="none"
                  stroke={TINTA}
                  strokeWidth={2.5}
                  strokeLinejoin="round"
                />
              ))}
            {puntos.map((p) => {
              const i = idx(p.season_id);
              const grande = p === ultimo || i === sel;
              return p.small_sample ? (
                <circle key={p.season_id} cx={X(i)} cy={Y(p.value)} r={grande ? 5 : 4} fill="#FFFFFF" stroke={TINTA} strokeWidth={2} />
              ) : (
                <circle
                  key={p.season_id}
                  cx={X(i)}
                  cy={Y(p.value)}
                  r={grande ? 5.5 : 4}
                  fill={TINTA}
                  stroke="#FFFFFF"
                  strokeWidth={2}
                />
              );
            })}
            <text x={X(idx(ultimo.season_id)) + 9} y={Y(ultimo.value) + 4} fontSize={13} fontWeight={700} fill="rgb(var(--fg))" className="num">
              {fmt(ultimo.value)}
            </text>
            {ligaUltima && Math.abs(Y(ligaUltima.value) - Y(ultimo.value)) > 14 && (
              <text x={X(idx(ligaUltima.season_id)) + 9} y={Y(ligaUltima.value) + 4} fontSize={12} fill="rgb(var(--dim))">
                Liga
              </text>
            )}
          </svg>
        )}
        {ancho === 0 && <div style={{ height: ALTO }} />}
      </div>

      <details className="mt-2 text-xs text-dim">
        <summary className="cursor-pointer select-none py-1 hover:text-fg">Ver datos</summary>
        <table className="num mt-2 w-full max-w-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-[0.06em]">
              <th className="py-1 font-medium">Temporada</th>
              <th className="py-1 font-medium">Equipo</th>
              <th className="py-1 text-right font-medium">{nombre}</th>
              <th className="py-1 text-right font-medium">Liga</th>
            </tr>
          </thead>
          <tbody>
            {puntos.map((p) => (
              <tr key={p.season_id} className="border-t border-line-soft text-fg2">
                <td className="py-1">{p.season_id}</td>
                <td className="py-1">{equipoPorTemporada[p.season_id] ?? "—"}</td>
                <td className="py-1 text-right font-medium text-fg">
                  {fmt(p.value)}
                  {p.small_sample ? "*" : ""}
                </td>
                <td className="py-1 text-right">{ligaDe.has(p.season_id) ? fmt(ligaDe.get(p.season_id)!) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-1">* Muestra chica.</p>
      </details>
    </div>
  );
}
