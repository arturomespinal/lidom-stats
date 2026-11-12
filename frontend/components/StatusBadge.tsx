import { LiveStatus } from "@/lib/types";

interface Props {
  status: LiveStatus;
  /** Texto a mostrar en vez del de por defecto: "FINAL (10)", "Warmup"… */
  label?: string;
}

/**
 * El estado de un juego: EN VIVO, FINAL o PREVIA.
 *
 * Antes había cuatro copias de esta etiqueta entre la web y el móvil, y cada
 * una con su propio rojo — por eso es un componente.
 *
 * ── Look "Pizarra": una etiqueta de 6 px de radio ─────────────────────────
 * La esquina cortada del look anterior (sigue en `main`) se fue con la de las
 * tejas. Sin borde: el relleno solo basta.
 */

// EN VIVO va SÓLIDO, con el texto GRAFITO encima: 6.2:1. El blanco sobre este
// rojo daría 3.3:1.
const ESTILO: Record<LiveStatus, string> = {
  live: "bg-live text-accent-on",
  final: "bg-line text-fg",
  preview: "bg-fg/10 text-fg2",
  other: "bg-line text-dim",
};

const TEXTO: Record<LiveStatus, string> = {
  live: "EN VIVO",
  final: "FINAL",
  preview: "PREVIA",
  other: "—",
};

export default function StatusBadge({ status, label }: Props) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-[3px] font-cond text-[14px] leading-4 tracking-[0.08em] ${ESTILO[status]}`}
    >
      {status === "live" && (
        // El punto que late. `motion-safe`: quien pidió menos movimiento en su
        // sistema ve el punto quieto, que dice lo mismo.
        <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
          <span className="absolute inline-flex h-full w-full rounded-full bg-accent-on opacity-75 motion-safe:animate-ping" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent-on" />
        </span>
      )}
      {label ?? TEXTO[status]}
    </span>
  );
}
