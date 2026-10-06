import { LiveRunners } from "@/lib/types";

interface Props {
  runners: LiveRunners;
  size?: number;
  /** Milisegundos que espera una base para encenderse al ocuparse: el tiempo
   *  que tarda en llegar el corredor animado de la pantalla de juego. Al
   *  vaciarse no espera. */
  retrasoLlenado?: number;
}

/**
 * Dónde cae cada base en un lienzo de `s` px. Una sola definición: el
 * diamante la dibuja y el corredor animado de la pantalla de juego
 * (`game/Situacion.tsx`) la recorre.
 */
export function posicionesDiamante(s: number) {
  return {
    home: { x: s / 2, y: s * 0.85 },
    first: { x: s * 0.78, y: s * 0.52 },
    second: { x: s / 2, y: s * 0.22 },
    third: { x: s * 0.22, y: s * 0.52 },
  };
}

/**
 * El diamante con los corredores, en SVG.
 *
 * Las bases van rotadas 45° como en un diamante real: primera a la derecha,
 * segunda arriba, tercera a la izquierda. Ocupada = rellena y con brillo;
 * vacía = solo contorno.
 */
export default function BaseDiamond({ runners, size = 64, retrasoLlenado = 0 }: Props) {
  const s = size;
  const b = s * 0.20; // lado de cada base
  // Desde los tokens CSS, no literales: el SVG va en el DOM, así que
  // rgb(var(--x)) resuelve igual que en una clase de Tailwind.
  const occupied = "rgb(var(--warn))";
  const empty = "rgb(var(--line))";

  // Centros de cada base dentro del lienzo.
  const pos = posicionesDiamante(s);
  const bases = [
    { key: "second", cx: pos.second.x, cy: pos.second.y, on: !!runners.second, label: "2ª" },
    { key: "third", cx: pos.third.x, cy: pos.third.y, on: !!runners.third, label: "3ª" },
    { key: "first", cx: pos.first.x, cy: pos.first.y, on: !!runners.first, label: "1ª" },
  ];

  return (
    <svg
      width={s}
      height={s}
      viewBox={`0 0 ${s} ${s}`}
      role="img"
      aria-label={
        [
          runners.first && "corredor en primera",
          runners.second && "corredor en segunda",
          runners.third && "corredor en tercera",
        ]
          .filter(Boolean)
          .join(", ") || "bases limpias"
      }
    >
      {bases.map((base) => (
        <rect
          key={base.key}
          x={base.cx - b / 2}
          y={base.cy - b / 2}
          width={b}
          height={b}
          transform={`rotate(45 ${base.cx} ${base.cy})`}
          fill={base.on ? occupied : "transparent"}
          stroke={base.on ? occupied : empty}
          strokeWidth={1.5}
          // La base que se llena o se vacía lo hace con una transición corta:
          // con el corredor de la pantalla de juego, se ve llegar.
          // La transición la decide el estado NUEVO: al encenderse lleva el
          // retraso; al apagarse, no.
          style={{
            transition: `fill 300ms ease-out ${base.on ? retrasoLlenado : 0}ms, stroke 300ms ease-out ${base.on ? retrasoLlenado : 0}ms`,
            ...(base.on ? { filter: `drop-shadow(0 0 3px ${occupied}90)` } : {}),
          }}
        />
      ))}

      {/* El home, siempre presente y más tenue: es referencia, no estado. */}
      <polygon
        points={`${s / 2},${s * 0.90} ${s / 2 - b * 0.45},${s * 0.80} ${s / 2 + b * 0.45},${s * 0.80}`}
        fill={empty}
      />
    </svg>
  );
}
