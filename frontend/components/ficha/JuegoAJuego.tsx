import Link from "next/link";
import type { FilaJuegoBateo, FilaJuegoPitcheo } from "@/lib/types";

type Fila = FilaJuegoBateo | FilaJuegoPitcheo;

/** Cuántas filas se ven antes de "Ver los N": una temporada son ~50. */
const VISIBLES = 10;

function FilaJuego({ f }: { f: Fila }) {
  const g = f.result === "G";
  const donde = f.side === "home" ? "vs" : "en";
  return (
    <li className="border-b border-line-soft last:border-0">
      <Link
        href={`/juegos/${f.game_id}`}
        className="group flex min-h-14 items-center gap-3 px-4 hover:bg-raised"
        aria-label={`${f.date_label}, ${donde} ${f.opponent}. ${g ? "Ganó" : f.result === "P" ? "Perdió" : "Empate"} ${f.runs_for}-${f.runs_against}. ${f.line}. Abrir el juego`}
      >
        <span className="w-24 shrink-0">
          <span className="block text-[13px] font-semibold text-fg">{f.date_label}</span>
          <span className="block text-[11px] text-dim">
            {donde} {f.opponent}
          </span>
        </span>
        {/* El resultado es el del EQUIPO: un relevista que no decidió no
            tiene "G" propia. Por eso va en su teja, aparte de la línea. */}
        <span
          aria-hidden="true"
          className={`num flex h-7 min-w-[60px] items-center justify-center rounded px-1.5 font-cond text-[17px] leading-none tracking-[0.02em] ${
            g ? "bg-ink text-ink-fg" : "border border-line text-dim"
          }`}
        >
          {f.result ?? "—"} {f.runs_for}-{f.runs_against}
        </span>
        <span aria-hidden="true" className="num min-w-0 flex-1 text-[13px] text-fg">
          {f.line}
        </span>
        <span aria-hidden="true" className="text-dim group-hover:text-fg">
          ›
        </span>
      </Link>
    </li>
  );
}

/**
 * El juego a juego de un jugador: una fila por juego, del más reciente al
 * más viejo, con la fecha, el rival, cómo le fue al equipo y su línea. Cada
 * fila abre el juego. Misma pieza que la del móvil.
 *
 * La línea la compone el servidor con las funciones de la portada: un
 * jugador se lee igual en su ficha, en Hoy y en el boxscore.
 */
export default function JuegoAJuego({ filas }: { filas: Fila[] }) {
  const primeras = filas.slice(0, VISIBLES);
  const resto = filas.slice(VISIBLES);
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-card">
      <ul>
        {primeras.map((f) => (
          <FilaJuego key={f.game_id} f={f} />
        ))}
      </ul>
      {resto.length > 0 && (
        // <details> y no estado de cliente: la ficha sigue siendo un
        // componente de servidor, y el navegador ya sabe abrir y cerrar.
        <details className="group/mas border-t border-line-soft">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-center text-sm font-semibold text-fg hover:bg-raised group-open/mas:hidden">
            Ver los {filas.length} juegos
          </summary>
          <ul>
            {resto.map((f) => (
              <FilaJuego key={f.game_id} f={f} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
