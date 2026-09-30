import Link from "next/link";
import type { LastGame } from "@/lib/types";

/**
 * Los últimos diez, del más viejo al más nuevo: se leen de izquierda a
 * derecha como una racha. Ganado relleno de navy, perdido en blanco con
 * borde — y la letra escrita en los dos, porque el relleno solo sería color.
 * Cada celda abre su juego (/juegos/{id}).
 */
export default function UltimosDiez({ juegos }: { juegos: LastGame[] }) {
  return (
    <ol className="grid gap-1" style={{ gridTemplateColumns: `repeat(${juegos.length}, minmax(0, 1fr))` }}>
      {juegos.map((j, i) => {
        const g = j.result === "G";
        const texto = `${g ? "Ganó" : "Perdió"} ${j.runs_for}-${j.runs_against} ${
          j.home ? "contra" : "en casa de"
        } ${j.opponent}, ${j.date}`;
        return (
          <li key={`${j.date}-${i}`}>
            {/* Cada celda abre su juego. */}
            <Link
              href={`/juegos/${j.game_id}`}
              className="group flex flex-col items-center gap-1"
              title={texto}
            >
            <span className="sr-only">{texto}. Abrir el juego</span>
            <span
              aria-hidden="true"
              className={`flex h-9 w-full items-center justify-center rounded font-cond text-xl leading-none transition-opacity group-hover:opacity-75 ${
                g ? "bg-ink text-ink-fg" : "border border-line bg-card text-dim"
              }`}
            >
              {j.result}
            </span>
            <span aria-hidden="true" className="text-[10px] text-dim group-hover:underline">
              {j.opponent}
            </span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
