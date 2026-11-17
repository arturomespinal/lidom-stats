import Link from "next/link";

/**
 * "Comparar", sobre la franja de una ficha: abre /comparar con este jugador
 * ya puesto a la izquierda. `id` es su player_id, o "h" + id_miembro si solo
 * está en DIGIMETRICS (la ficha histórica).
 */
export default function BotonComparar({ id }: { id: string }) {
  return (
    <div className="pt-1">
      <Link
        href={`/comparar?a=${encodeURIComponent(id)}`}
        className="tocable inline-flex min-h-11 items-center gap-2 rounded-lg border border-ink-fg/25 px-3 text-sm font-semibold text-ink-fg hover:bg-ink-fg/10"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M8 4v16M16 4v16M3 9h5M16 15h5" />
        </svg>
        Comparar
      </Link>
    </div>
  );
}
