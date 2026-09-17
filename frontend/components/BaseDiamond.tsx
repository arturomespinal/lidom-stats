import { LiveRunners } from "@/lib/types";

interface Props {
  runners: LiveRunners;
  size?: number;
}

/**
 * El diamante con los corredores, en SVG.
 *
 * Las bases van rotadas 45° como en un diamante real: primera a la derecha,
 * segunda arriba, tercera a la izquierda. Ocupada = rellena y con brillo;
 * vacía = solo contorno.
 */
export default function BaseDiamond({ runners, size = 64 }: Props) {
  const s = size;
  const b = s * 0.20; // lado de cada base
  const occupied = "#facc15";
  const empty = "#30363d";

  // Centros de cada base dentro del lienzo.
  const bases = [
    { key: "second", cx: s / 2, cy: s * 0.22, on: !!runners.second, label: "2ª" },
    { key: "third", cx: s * 0.22, cy: s * 0.52, on: !!runners.third, label: "3ª" },
    { key: "first", cx: s * 0.78, cy: s * 0.52, on: !!runners.first, label: "1ª" },
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
          style={
            base.on ? { filter: `drop-shadow(0 0 3px ${occupied}90)` } : undefined
          }
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
