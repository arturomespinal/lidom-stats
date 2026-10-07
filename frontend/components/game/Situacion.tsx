"use client";

import Campo from "@/components/game/Campo";
import NombreJugador from "@/components/game/NombreJugador";
import ZonaStrike from "@/components/game/ZonaStrike";
import { AtBat, LiveGameDetail, LiveSituation, PlayLine } from "@/lib/types";

/**
 * Lo que está pasando ahora mismo, en la pantalla de un juego: arriba la
 * media entrada, los outs y la cuenta; el terreno con los corredores en sus
 * bases (game/Campo.tsx); quién batea y quién lanza; y la zona de strike del
 * turno. La misma tarjeta que el móvil (`mobile/src/components/Situacion.tsx`).
 *
 * ── La jugada que se mueve ──────────────────────────────────────────────────
 * Cuando llega un sencillo, doble, triple, jonrón o ponche nuevo:
 *   - entra una franja navy con corte en diagonal (la firma del kit) con el
 *     nombre de la jugada en Bebas, el bateador, las carreras y el batazo,
 *     sobre los jardines del terreno, y sale sola a los ~3,6 s;
 *   - en los batazos, un corredor recorre el terreno desde el home hasta la
 *     base a la que llegó; en el jonrón da la vuelta completa. La franja
 *     ocupa el 42% de arriba del terreno: el corredor corre por debajo.
 *
 * Sin estado ni temporizadores: la franja lleva `key` = el índice de la
 * jugada, así que se monta de nuevo solo cuando hay una jugada nueva y su
 * animación CSS (`.jugada`) entra, se queda y sale sola. El corredor es una
 * animación de la Web Animations API dentro del SVG del terreno, relanzada
 * con la misma llave. Con "reducir movimiento" el corredor no corre y la
 * franja aparece sin deslizarse.
 */

/** Las jugadas que se celebran, y hasta qué base llega el bateador. */
const JUGADAS: Record<string, { titulo: string; bases: number }> = {
  Single: { titulo: "Sencillo", bases: 1 },
  Double: { titulo: "Doble", bases: 2 },
  Triple: { titulo: "Triple", bases: 3 },
  "Home Run": { titulo: "Jonrón", bases: 4 },
  Strikeout: { titulo: "Ponche", bases: 0 },
  "Strikeout Double Play": { titulo: "Ponche", bases: 0 },
};

export function jugadaDestacada(plays: PlayLine[]): PlayLine | null {
  // El relato viene del más reciente al más viejo, y el primero puede ser el
  // turno en curso, todavía sin resultado.
  const ultima = plays.find((p) => p.is_complete);
  return ultima && ultima.event && JUGADAS[ultima.event] ? ultima : null;
}

export default function Situacion({
  situacion,
  jugada,
  turno,
  duelo,
}: {
  situacion: LiveSituation;
  jugada: PlayLine | null;
  /** El turno que se dibuja en la zona de strike. */
  turno?: AtBat | null;
  /** El duelo de ahora, con sus números. */
  duelo?: LiveGameDetail["matchup"];
}) {
  const info = jugada?.event ? JUGADAS[jugada.event] : null;
  const bases = info?.bases ?? 0;
  // Cuánto corre el corredor, y cuándo llega a su base: la base se enciende
  // en ese momento y no antes.
  const duracion = bases > 0 ? 450 * Math.min(bases, 4) + 500 : 0;
  const llegada = Math.round(duracion * 0.9);

  const outs = situacion.outs;
  // Entre medias entradas: la cuenta es del turno que ya terminó y el
  // bateador es el que abre la otra mitad. Se dice, en vez de mezclarlas.
  const fin = situacion.half_over_label;
  // Los números del duelo, solo si son de quien está en el plato ahora: entre
  // medias entradas el bateador de la situación es el que abrirá, y el duelo
  // todavía no existe.
  const bateador = duelo && duelo.batter.name === situacion.batter ? duelo.batter : null;
  const lanzador = duelo && duelo.pitcher.name === situacion.pitcher ? duelo.pitcher : null;
  const hit = jugada?.hit;
  const datosBatazo = hit
    ? [
        hit.speed_mph != null ? `${Math.round(hit.speed_mph)} mph` : null,
        hit.distance_ft ? `${hit.distance_ft} pies` : null,
        hit.angle != null ? `${Math.round(hit.angle)}°` : null,
      ].filter(Boolean)
    : [];
  return (
    <section aria-label="Situación del juego" className="overflow-hidden rounded-xl border border-line bg-card">
      {/* La media entrada, los outs y la cuenta: la barra de arriba, como en
          la transmisión. Entre medias entradas la cuenta es del turno que ya
          terminó, así que se cambia por la frase. */}
      <div className="flex min-h-[44px] items-center gap-4 border-b border-line px-4">
        <p className="min-w-0 flex-1 truncate text-xs font-bold uppercase tracking-wide text-fg">
          {fin ?? situacion.half_label ?? ""}
        </p>
        <div className="flex items-center gap-1.5">
          <span className="mr-0.5 text-[10px] uppercase tracking-wide text-dim">Outs</span>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className={`h-2.5 w-2.5 rounded-full transition-colors duration-300 ${i < outs ? "bg-warn" : "bg-line"}`}
            />
          ))}
          <span className="sr-only">{outs} outs</span>
        </div>
        {!fin && (
          <p className="num font-cond text-[26px] leading-none text-fg">
            <span className="sr-only">Cuenta: </span>
            {situacion.balls}-{situacion.strikes}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0">
          {/* El terreno, con la franja de la jugada encima de los jardines. */}
          <div className="relative mx-auto max-w-[460px] overflow-hidden">
            <Campo
              runners={situacion.runners}
              retrasoLlenado={llegada}
              carrera={jugada && bases > 0 ? { clave: jugada.index, bases, duracion } : null}
            />
            {jugada && info && (
              <div
                key={jugada.index}
                role="status"
                className="jugada pointer-events-none absolute right-0 top-0 flex h-[42%] w-[86%] flex-col justify-center bg-ink pl-10 pr-4 text-ink-fg"
                style={{ clipPath: "polygon(28px 0, 100% 0, 100% 100%, 0 100%)" }}
              >
                <p className="font-cond text-[34px] uppercase leading-none tracking-wide">{info.titulo}</p>
                {jugada.batter && <p className="mt-0.5 truncate text-sm text-ink-dim">{jugada.batter}</p>}
                {(jugada.rbi > 0 || datosBatazo.length > 0) && (
                  <p className="text-xs tabular-nums text-ink-dim">
                    {jugada.rbi > 0 && (
                      <span className="font-semibold text-ink-fg">
                        {jugada.rbi === 1 ? "1 carrera" : `${jugada.rbi} carreras`}
                        {datosBatazo.length > 0 ? " · " : ""}
                      </span>
                    )}
                    {datosBatazo.join(" · ")}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="space-y-1.5 px-4 pb-3 pt-1 text-sm">
            {situacion.batter && (
              <div>
                <p className="truncate">
                  <span className="text-dim">{fin ? "Abre " : "Al bate "}</span>
                  <span className="font-semibold text-fg">
                    <NombreJugador nombre={situacion.batter} profileId={bateador?.profile_id ?? null} />
                  </span>
                </p>
                {bateador && (
                  <p className="text-xs tabular-nums text-dim">
                    {[
                      bateador.today ? `Hoy ${bateador.today}` : null,
                      bateador.avg ? `${bateador.avg} AVG` : null,
                      bateador.ops ? `${bateador.ops} OPS` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
              </div>
            )}
            {situacion.pitcher && (
              <div>
                <p className="truncate">
                  <span className="text-dim">Lanza </span>
                  <span className="font-semibold text-fg">
                    <NombreJugador nombre={situacion.pitcher} profileId={lanzador?.profile_id ?? null} />
                  </span>
                </p>
                {lanzador && (lanzador.pitches > 0 || lanzador.today || lanzador.era) && (
                  <p className="text-xs tabular-nums text-dim">
                    {lanzador.pitches > 0 && (
                      <span className="font-semibold text-fg2">{lanzador.pitches} lanzamientos · </span>
                    )}
                    {[lanzador.today, lanzador.era ? `EFE ${lanzador.era}` : null].filter(Boolean).join(" · ")}
                  </p>
                )}
              </div>
            )}
            {situacion.on_deck && (
              <p className="truncate text-xs">
                <span className="text-dim">En espera </span>
                <span className="text-fg2">{situacion.on_deck}</span>
              </p>
            )}
          </div>
        </div>

        {turno && (
          <div className="border-t border-line px-4 py-3 lg:border-l lg:border-t-0">
            <ZonaStrike turno={turno} />
          </div>
        )}
      </div>
    </section>
  );
}
