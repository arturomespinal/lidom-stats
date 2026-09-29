"use client";

import { Fragment, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import { useRouter } from "next/navigation";
import type { TeamSeasonRow } from "@/lib/types";
import { conSigno } from "@/lib/formato";
import { useAncho } from "./useAncho";

const ALTO = 190;
const M = { arriba: 22, abajo: 24 };
const GRIS = "#9AA6B8";

/**
 * El diferencial de carreras de cada temporada, de la más vieja a la más
 * nueva, en barras que suben o bajan desde el cero. Misma gráfica que la del
 * móvil.
 *
 * La dirección ya dice el signo; el tono lo refuerza (navy arriba, gris
 * abajo) sin cargar juicio de verde y rojo. Etiquetas solo donde importan: la
 * mejor, la peor y la temporada elegida, que va con la barra más ancha. Tocar
 * una barra abre esa temporada.
 */
export default function BarrasDiferencial({
  historial,
  elegida,
  equipo,
}: {
  historial: TeamSeasonRow[];
  elegida: string;
  equipo: string;
}) {
  const [ref, ancho] = useAncho<HTMLDivElement>();
  const [sel, setSel] = useState<number | null>(null);
  const router = useRouter();
  if (historial.length < 2) return null;

  const filas = [...historial].sort((a, b) => a.season_id.localeCompare(b.season_id));
  const difs = filas.map((f) => f.run_diff);
  const hi = Math.max(...difs, 5);
  const lo = Math.min(...difs, -5);
  const ph = ALTO - M.arriba - M.abajo;
  const Y = (v: number) => M.arriba + ((hi - v) / (hi - lo)) * ph;
  const paso = ancho / filas.length;
  const mejor = filas.reduce((a, b) => (b.run_diff > a.run_diff ? b : a));
  const peor = filas.reduce((a, b) => (b.run_diff < a.run_diff ? b : a));
  const marcadas = new Set([mejor.season_id, peor.season_id, elegida]);
  const f = sel != null ? filas[sel] : null;

  const abrir = (s: string) => router.push(`/teams/${equipo}?season=${s}`);
  const alMover = (e: PointerEvent<SVGSVGElement>) => {
    const x = e.clientX - e.currentTarget.getBoundingClientRect().left;
    setSel(Math.min(Math.max(Math.floor(x / paso), 0), filas.length - 1));
  };
  const alTeclear = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key === "Enter" && sel != null) return abrir(filas[sel].season_id);
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const d = e.key === "ArrowLeft" ? -1 : 1;
    const i = filas.findIndex((r) => r.season_id === elegida);
    setSel((s) => Math.min(Math.max((s ?? i) + d, 0), filas.length - 1));
  };

  return (
    <div className="rounded-xl border border-line bg-card p-3 sm:p-4">
      <div className="num min-h-6 text-[11px] text-fg2" aria-live="polite">
        {f ? (
          <>
            <b className="text-fg">{f.season_id}</b> · {f.wins}-{f.losses} ·{" "}
            <b className="text-fg">{conSigno(f.run_diff)}</b> ({f.runs_for} anotadas, {f.runs_against} permitidas)
            {f.season_id !== elegida && " · clic para abrirla"}
          </>
        ) : (
          "Anotadas menos permitidas, por temporada."
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
              `Diferencial de carreras por temporada. La mejor, ${conSigno(mejor.run_diff)} en ${mejor.season_id}; ` +
              `la peor, ${conSigno(peor.run_diff)} en ${peor.season_id}. ` +
              "Flechas para recorrer, Enter para abrir la temporada."
            }
            className="cursor-pointer touch-pan-y outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
            onPointerMove={alMover}
            onPointerLeave={() => setSel(null)}
            onClick={(e) => {
              const x = e.clientX - e.currentTarget.getBoundingClientRect().left;
              const i = Math.min(Math.max(Math.floor(x / paso), 0), filas.length - 1);
              if (filas[i].season_id !== elegida) abrir(filas[i].season_id);
            }}
            onKeyDown={alTeclear}
            onBlur={() => setSel(null)}
          >
            {filas.map((r, i) => {
              const esElegida = r.season_id === elegida;
              const bw = paso * (esElegida ? 0.78 : 0.56);
              const x = i * paso + (paso - bw) / 2;
              const y0 = Math.min(Y(0), Y(r.run_diff));
              const h = Math.max(Math.abs(Y(r.run_diff) - Y(0)), 1);
              return (
                <Fragment key={r.season_id}>
                  {sel === i && <rect x={i * paso} y={M.arriba - 18} width={paso} height={ph + 18} fill="rgb(var(--raised))" />}
                  <rect x={x} y={y0} width={bw} height={h} rx={3} fill={r.run_diff > 0 ? "rgb(var(--ink))" : GRIS} />
                  {marcadas.has(r.season_id) && (
                    <text
                      x={x + bw / 2}
                      y={r.run_diff >= 0 ? Y(r.run_diff) - 6 : Y(r.run_diff) + 14}
                      fontSize={12}
                      fontWeight={700}
                      fill="rgb(var(--fg))"
                      textAnchor="middle"
                      className="num"
                    >
                      {conSigno(r.run_diff)}
                    </text>
                  )}
                </Fragment>
              );
            })}
            <line x1={0} x2={ancho} y1={Y(0)} y2={Y(0)} stroke={GRIS} />
            <text x={0} y={ALTO - 5} fontSize={11} fill="rgb(var(--dim))" className="num">
              {filas[0].season_id}
            </text>
            <text x={ancho} y={ALTO - 5} fontSize={11} fill="rgb(var(--dim))" textAnchor="end" className="num">
              {filas[filas.length - 1].season_id}
            </text>
          </svg>
        )}
        {ancho === 0 && <div style={{ height: ALTO }} />}
      </div>
    </div>
  );
}
