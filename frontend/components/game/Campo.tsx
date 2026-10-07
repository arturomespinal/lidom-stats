"use client";

import { useEffect, useRef } from "react";
import { LiveRunners } from "@/lib/types";

/**
 * El terreno visto desde arriba, con los corredores en sus bases y su
 * apellido al lado. Ocupa el lugar del diamante chico en la tarjeta de
 * situación (pedido de Arturo con una captura de SofaScore, 6-oct). El mismo
 * dibujo que el móvil (`mobile/src/components/Campo.tsx`), con las mismas
 * cuentas sobre un lienzo de 320×220 que se escala al ancho.
 *
 * El corredor de la jugada va DENTRO del SVG: un círculo que la Web
 * Animations API mueve con `translate` en unidades del lienzo (en un elemento
 * SVG, los px de una transformación CSS son unidades del viewBox), así corre
 * justo por las bases a cualquier ancho. La base se enciende cuando llega:
 * su relleno tiene la transición retrasada `retrasoLlenado` ms solo al
 * ocuparse; al vaciarse no espera. Con "reducir movimiento" no hay corredor.
 */

export const LIENZO_ANCHO = 320;
export const LIENZO_ALTO = 220;

const HOME = { x: 160, y: 206 };
const BASE = 72;
const D = BASE * Math.SQRT1_2;
const PUNTOS = {
  home: HOME,
  first: { x: HOME.x + D, y: HOME.y - D },
  second: { x: HOME.x, y: HOME.y - 2 * D },
  third: { x: HOME.x - D, y: HOME.y - D },
};
const CERCA = 196;
const FOUL = CERCA * Math.SQRT1_2;
const ABANICO = `M${HOME.x},${HOME.y} L${HOME.x - FOUL},${HOME.y - FOUL} A${CERCA},${CERCA} 0 0 1 ${HOME.x + FOUL},${HOME.y - FOUL} Z`;
const MONTICULO = { x: HOME.x, y: HOME.y - D };

const C = {
  pasto: "rgb(var(--campo-pasto))",
  franja: "rgb(var(--campo-franja))",
  tierra: "rgb(var(--campo-tierra))",
  linea: "rgb(var(--campo-linea))",
  base: "rgb(var(--faint))",
  ocupada: "rgb(var(--warn))",
  texto: "rgb(var(--fg))",
  corredor: "rgb(var(--ink))",
  anillo: "rgb(var(--card))",
};

const rombo = (x: number, y: number, r: number) => `${x},${y - r} ${x + r},${y} ${x},${y + r} ${x - r},${y}`;

/** "Marco Luciano" → "Luciano". */
const apellido = (nombre: string | null) => (nombre ? nombre.trim().split(/\s+/).slice(-1)[0] : "");

export default function Campo({
  runners,
  retrasoLlenado = 0,
  carrera,
}: {
  runners: LiveRunners;
  retrasoLlenado?: number;
  /** El corredor de la jugada: `clave` (el índice de la jugada) lo relanza. */
  carrera?: { clave: number; bases: number; duracion: number } | null;
}) {
  const corredor = useRef<SVGCircleElement | null>(null);
  const clave = carrera?.clave;
  const bases = carrera?.bases ?? 0;
  const duracion = carrera?.duracion ?? 0;

  useEffect(() => {
    const el = corredor.current;
    if (!el || bases === 0) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ruta = [PUNTOS.home, PUNTOS.first, PUNTOS.second, PUNTOS.third, PUNTOS.home].slice(0, bases + 1);
    const n = ruta.length - 1;
    const paso = (q: { x: number; y: number }) => `translate(${q.x}px, ${q.y}px)`;
    // 450 ms por base, más la entrada y la salida: el mismo ritmo del móvil.
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
  }, [clave, bases, duracion]);

  const lista = [
    { clave: "first" as const, p: PUNTOS.first, nombre: runners.first, dx: 12, dy: 4, ancla: "start" as const },
    { clave: "second" as const, p: PUNTOS.second, nombre: runners.second, dx: 0, dy: -12, ancla: "middle" as const },
    { clave: "third" as const, p: PUNTOS.third, nombre: runners.third, dx: -12, dy: 4, ancla: "end" as const },
  ];
  const ocupadas = lista.filter((b) => b.nombre);
  const lectura =
    ocupadas.length === 0
      ? "Bases limpias"
      : ocupadas.length === 3
        ? "Bases llenas"
        : ocupadas
            .map((b) => `${b.nombre} en ${b.clave === "first" ? "primera" : b.clave === "second" ? "segunda" : "tercera"}`)
            .join(", ");

  return (
    <svg viewBox={`0 0 ${LIENZO_ANCHO} ${LIENZO_ALTO}`} role="img" aria-label={lectura} className="block h-auto w-full">
      <defs>
        <clipPath id="campo-abanico">
          <path d={ABANICO} />
        </clipPath>
      </defs>
      <g clipPath="url(#campo-abanico)">
        <rect x={0} y={0} width={LIENZO_ANCHO} height={LIENZO_ALTO} fill={C.pasto} />
        {/* El corte de la grama, en franjas: textura, no dato. */}
        {Array.from({ length: 6 }, (_, i) => (
          <rect key={i} x={0} y={i * 40} width={LIENZO_ANCHO} height={20} fill={C.franja} />
        ))}
        <circle cx={MONTICULO.x} cy={MONTICULO.y} r={BASE + 2} fill={C.tierra} />
      </g>
      <polygon points={rombo(MONTICULO.x, MONTICULO.y, D - 11)} fill={C.pasto} />
      <circle cx={MONTICULO.x} cy={MONTICULO.y} r={8} fill={C.tierra} />
      <circle cx={HOME.x} cy={HOME.y - 2} r={13} fill={C.tierra} />
      <line x1={HOME.x} y1={HOME.y} x2={HOME.x - FOUL} y2={HOME.y - FOUL} stroke={C.linea} strokeWidth={1.5} />
      <line x1={HOME.x} y1={HOME.y} x2={HOME.x + FOUL} y2={HOME.y - FOUL} stroke={C.linea} strokeWidth={1.5} />
      <polygon
        points={`${PUNTOS.home.x},${PUNTOS.home.y} ${PUNTOS.first.x},${PUNTOS.first.y} ${PUNTOS.second.x},${PUNTOS.second.y} ${PUNTOS.third.x},${PUNTOS.third.y}`}
        fill="none"
        stroke={C.linea}
        strokeWidth={1.5}
      />
      <polygon
        points={`${HOME.x - 5},${HOME.y - 4} ${HOME.x + 5},${HOME.y - 4} ${HOME.x + 5},${HOME.y} ${HOME.x},${HOME.y + 4} ${HOME.x - 5},${HOME.y}`}
        fill={C.linea}
        stroke={C.base}
        strokeWidth={1}
      />

      {lista.map((b) => {
        const on = !!b.nombre;
        // La transición espera al corredor solo al ocuparse.
        const espera = on ? retrasoLlenado : 0;
        return (
          <g key={b.clave}>
            <polygon
              points={rombo(b.p.x, b.p.y, 8)}
              fill={on ? C.ocupada : C.linea}
              stroke={on ? C.ocupada : C.base}
              strokeWidth={1}
              style={{ transition: `fill 250ms ease ${espera}ms, stroke 250ms ease ${espera}ms` }}
            />
            <text
              x={b.p.x + b.dx}
              y={b.p.y + b.dy}
              textAnchor={b.ancla}
              fontSize={12}
              fontWeight={600}
              fill={C.texto}
              style={{ opacity: on ? 1 : 0, transition: `opacity 250ms ease ${espera}ms` }}
            >
              {apellido(b.nombre)}
            </text>
          </g>
        );
      })}

      {/* El corredor de la jugada: invisible hasta que la animación corre. */}
      <circle ref={corredor} cx={0} cy={0} r={6} fill={C.corredor} stroke={C.anillo} strokeWidth={2} opacity={0} />
    </svg>
  );
}
