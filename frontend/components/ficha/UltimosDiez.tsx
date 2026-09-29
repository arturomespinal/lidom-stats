import type { LastGame } from "@/lib/types";

/**
 * Los últimos diez, del más viejo al más nuevo: se leen de izquierda a
 * derecha como una racha. Ganado relleno de navy, perdido en blanco con
 * borde — y la letra escrita en los dos, porque el relleno solo sería color.
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
          <li key={`${j.date}-${i}`} className="flex flex-col items-center gap-1" title={texto}>
            <span className="sr-only">{texto}</span>
            <span
              aria-hidden="true"
              className={`flex h-9 w-full items-center justify-center rounded font-cond text-xl leading-none ${
                g ? "bg-ink text-ink-fg" : "border border-line bg-card text-dim"
              }`}
            >
              {j.result}
            </span>
            <span aria-hidden="true" className="text-[10px] text-dim">
              {j.opponent}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
