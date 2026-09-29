import type { PlayerRanking } from "@/lib/types";
import { valorPuesto } from "@/lib/formato";

/**
 * El jugador contra la liga: una fila por categoría con su valor, una barra y
 * su puesto entre los calificados. Los puestos los calcula el servidor
 * (src/contexto.py), con empates compartidos.
 *
 * ── Puesto, no percentil ───────────────────────────────────────────────────
 * Con 16 calificados un percentil ("81") esconde lo que pasó: fue 3º. El
 * puesto se lee sin explicación y es honesto con lo chica que es la liga. La
 * barra lo traduce a longitud —1º llena, el último vacía—.
 *
 * ── Una sola tinta ─────────────────────────────────────────────────────────
 * Navy en el podio (1º a 3º), gris del 4º en adelante, y el puesto escrito
 * siempre. Nada de verde "bueno" y rojo "malo": en deuteranopia son el mismo.
 */
/**
 * "3º" con el ordinal en Archivo: Bebas no trae el glifo "º" y el navegador
 * lo rellenaba con otra fuente, subrayado y a otra altura.
 */
function Rango({ n }: { n: number }) {
  return (
    <>
      {n}
      <span className="ml-px align-[0.45em] font-sans text-[10px] font-semibold">º</span>
    </>
  );
}

export default function PuestoLiga({ ranking }: { ranking: PlayerRanking }) {
  const n = ranking.pool;
  return (
    <ul className="rounded-xl border border-line bg-card px-4 py-1">
      {ranking.items.map((it) => {
        const podio = it.rank <= 3;
        const lleno = n > 1 ? ((n - it.rank) / (n - 1)) * 100 : 100;
        const valor = valorPuesto(it.value, it.format);
        return (
          <li
            key={it.stat}
            className="flex min-h-11 items-center gap-3 border-b border-line-soft last:border-0"
            aria-label={`${it.label}: ${valor}, ${it.rank}º de ${n}`}
          >
            <span className="w-24 shrink-0 truncate text-sm text-fg2">{it.label}</span>
            <span className="num w-14 shrink-0 text-right text-sm font-bold text-fg">{valor}</span>
            <span className="h-2 flex-1 overflow-hidden rounded bg-sunken" aria-hidden="true">
              <span
                className="block h-full rounded"
                style={{
                  width: `${Math.max(lleno, 3)}%`,
                  backgroundColor: podio ? "rgb(var(--ink))" : "#7A879B",
                }}
              />
            </span>
            {podio ? (
              // El podio en teja navy con la esquina cortada: la firma
              // reservada a tejas y estados, aquí marca un estado.
              <span
                aria-hidden="true"
                className="flex h-7 min-w-[34px] items-center justify-center bg-ink px-1 font-cond text-xl leading-none text-ink-fg"
                style={{
                  borderRadius: 5,
                  clipPath: "polygon(0 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%)",
                }}
              >
                <Rango n={it.rank} />
              </span>
            ) : (
              <span aria-hidden="true" className="min-w-[34px] text-center font-cond text-xl leading-none text-fg2">
                <Rango n={it.rank} />
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
