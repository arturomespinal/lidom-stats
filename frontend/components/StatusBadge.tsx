import { LiveStatus } from "@/lib/types";

interface Props {
  status: LiveStatus;
  /** Texto a mostrar en vez del de por defecto: "FINAL (10)", "Warmup"… */
  label?: string;
}

/**
 * El estado de un juego: EN VIVO, FINAL o PREVIA.
 *
 * ── La esquina cortada es la firma ────────────────────────────────────────
 * Vive en DOS sitios de toda la app: las tejas de equipo (TeamBadge) y esto.
 * Reservada así se vuelve reconocible; repetida en cada tarjeta dejaría de
 * significar algo. Antes había cuatro copias de esta píldora entre la web y
 * el móvil, y cada una con su propio rojo — por eso ahora es un componente.
 *
 * El corte es de 6 px FIJOS (`calc`), no un porcentaje: "FINAL (10)" es el
 * doble de ancho que "FINAL", y con un porcentaje la diagonal crecería con el
 * texto y dejaría de leerse como la misma marca.
 *
 * Sin borde: `clip-path` no recorta el borde, lo corta — la diagonal quedaría
 * sin trazo y las otras tres aristas con él. El relleno solo basta.
 */
const CORTE = "polygon(0 0, 100% 0, 100% 62%, calc(100% - 6px) 100%, 0 100%)";

const ESTILO: Record<LiveStatus, string> = {
  live: "bg-live/[.16] text-live",
  final: "bg-raised text-dim",
  preview: "bg-fg/10 text-fg2",
  other: "bg-raised text-dim",
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
      className={`inline-flex items-center gap-1.5 py-0.5 pl-2 pr-3 font-cond text-[12px] font-bold uppercase leading-4 tracking-[0.1em] ${ESTILO[status]}`}
      style={{ clipPath: CORTE }}
    >
      {status === "live" && (
        // El punto que late. `motion-safe`: quien pidió menos movimiento en su
        // sistema ve el punto quieto, que dice lo mismo.
        <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
          <span className="absolute inline-flex h-full w-full rounded-full bg-live opacity-75 motion-safe:animate-ping" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-live" />
        </span>
      )}
      {label ?? TEXTO[status]}
    </span>
  );
}
