import { AtBat, PitchLine } from "@/lib/types";

/**
 * La zona de strike con los lanzamientos del turno, vista del receptor (como
 * la transmisión): pX positivo es a la derecha del receptor.
 *
 * Unidades en pies, como las manda la MLB: el plato mide 17 pulgadas (1.417
 * pies) y una bola que roza el borde ya es strike, así que la zona va de
 * −0.83 a 0.83 (medio plato más el radio de la bola). Arriba y abajo, la del
 * bateador (`zone_top`/`zone_bottom`), que cambia con su estatura.
 *
 * El tipo de cada lanzamiento no va solo en el color: strike relleno de
 * navy, bola hueca, en juego en ocre (el mismo de las bases ocupadas). Cada
 * uno lleva su número, y la lista de al lado lo dice en texto: el dibujo
 * ayuda, nunca es la única puerta al dato.
 */

const ANCHO = 168;
const ALTO = 200;
// La ventana que se dibuja, en pies.
const X_MIN = -1.9;
const X_MAX = 1.9;
const Z_MIN = 0.4;
const Z_MAX = 4.6;
const MEDIO_PLATO = 0.83;

const x = (px: number) => ((px - X_MIN) / (X_MAX - X_MIN)) * ANCHO;
const y = (pz: number) => ALTO - ((pz - Z_MIN) / (Z_MAX - Z_MIN)) * ALTO;
const recorta = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

const ESTILO: Record<PitchLine["kind"], { fill: string; stroke: string; texto: string; nombre: string }> = {
  strike: { fill: "rgb(var(--ink))", stroke: "rgb(var(--ink))", texto: "#fff", nombre: "Strike" },
  bola: { fill: "rgb(var(--card))", stroke: "rgb(var(--ink))", texto: "rgb(var(--ink))", nombre: "Bola" },
  en_juego: { fill: "rgb(var(--warn))", stroke: "rgb(var(--warn))", texto: "#fff", nombre: "En juego" },
};

export default function ZonaStrike({ turno }: { turno: AtBat }) {
  const zx0 = x(-MEDIO_PLATO);
  const zx1 = x(MEDIO_PLATO);
  const zy0 = y(turno.zone_top);
  const zy1 = y(turno.zone_bottom);
  const ultimo = turno.pitches[turno.pitches.length - 1];
  const conPosicion = turno.pitches.filter((p) => p.px != null && p.pz != null);

  const resumen = turno.pitches
    .map((p) => `${p.number}: ${p.type_es ?? "lanzamiento"}${p.speed_mph ? ` de ${Math.round(p.speed_mph)} mph` : ""}, ${p.call_es ?? ""}`)
    .join("; ");

  return (
    // En el teléfono la lista va debajo: al lado de la zona, "Curva" quedaba en "C…".
    <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
      <div className="shrink-0">
        <svg
          width={ANCHO}
          height={ALTO}
          viewBox={`0 0 ${ANCHO} ${ALTO}`}
          role="img"
          aria-label={`Zona de strike, vista del receptor. ${resumen || "Sin lanzamientos todavía"}.`}
          className="rounded-lg bg-sunken"
        >
          {/* La zona, en tercios: la cuadrícula que se usa para hablar de
              "arriba y afuera". Recesiva: es referencia, no dato. */}
          <rect
            x={zx0}
            y={zy0}
            width={zx1 - zx0}
            height={zy1 - zy0}
            fill="rgb(var(--card))"
            stroke="rgb(var(--fg2))"
            strokeWidth={1.5}
          />
          {[1, 2].map((i) => (
            <g key={i} stroke="rgb(var(--line))" strokeWidth={1}>
              <line x1={zx0 + ((zx1 - zx0) * i) / 3} x2={zx0 + ((zx1 - zx0) * i) / 3} y1={zy0} y2={zy1} />
              <line x1={zx0} x2={zx1} y1={zy0 + ((zy1 - zy0) * i) / 3} y2={zy0 + ((zy1 - zy0) * i) / 3} />
            </g>
          ))}
          {/* El plato, abajo, para orientar. */}
          <polygon
            points={`${zx0},${ALTO - 14} ${zx1},${ALTO - 14} ${zx1},${ALTO - 9} ${(zx0 + zx1) / 2},${ALTO - 3} ${zx0},${ALTO - 9}`}
            fill="rgb(var(--line))"
          />
          {conPosicion.map((p) => {
            const e = ESTILO[p.kind];
            const cx = recorta(x(p.px as number), 9, ANCHO - 9);
            const cy = recorta(y(p.pz as number), 9, ALTO - 18);
            const esUltimo = p === ultimo;
            return (
              <g key={p.number}>
                {/* El último lleva un anillo: es el que se acaba de ver. */}
                {esUltimo && (
                  <circle cx={cx} cy={cy} r={12.5} fill="none" stroke="rgb(var(--ink))" strokeWidth={1.5} />
                )}
                <circle cx={cx} cy={cy} r={8.5} fill={e.fill} stroke={e.stroke} strokeWidth={1.5} />
                <text
                  x={cx}
                  y={cy + 3.5}
                  textAnchor="middle"
                  fontSize={10}
                  fontWeight={700}
                  fill={e.texto}
                  className="tabular-nums"
                >
                  {p.number}
                </text>
              </g>
            );
          })}
        </svg>
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-dim">
          {(["strike", "bola", "en_juego"] as const).map((k) => (
            <span key={k} className="inline-flex items-center gap-1">
              <svg width="10" height="10" aria-hidden="true">
                <circle cx="5" cy="5" r="4" fill={ESTILO[k].fill} stroke={ESTILO[k].stroke} strokeWidth="1.5" />
              </svg>
              {ESTILO[k].nombre}
            </span>
          ))}
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <p className="mb-1.5 text-[10px] uppercase tracking-wide text-dim">
          {turno.is_current ? "Este turno" : `Turno anterior · ${turno.batter.name ?? ""}`}
        </p>
        {turno.pitches.length === 0 ? (
          <p className="text-xs text-dim">Sin lanzamientos todavía.</p>
        ) : (
          <ol className="space-y-1">
            {[...turno.pitches].reverse().map((p) => (
              <li key={p.number} className="flex items-baseline gap-2 text-xs">
                <span className="w-4 shrink-0 text-right font-bold tabular-nums text-fg">{p.number}</span>
                <span className="min-w-0 flex-1 truncate text-fg2">
                  {p.type_es ?? "—"}
                  {p.speed_mph != null && (
                    <span className="tabular-nums text-dim"> · {Math.round(p.speed_mph)} mph</span>
                  )}
                </span>
                <span className="shrink-0 text-dim">{p.call_es}</span>
                <span className="w-7 shrink-0 text-right tabular-nums text-dim">
                  {p.balls}-{p.strikes}
                </span>
              </li>
            ))}
          </ol>
        )}
        {!turno.is_current && turno.result_es && (
          <p className="mt-2 text-xs font-semibold text-fg">{turno.result_es}</p>
        )}
      </div>
    </div>
  );
}
