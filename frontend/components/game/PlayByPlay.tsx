import { Fragment } from "react";
import { LiveGameDetail, PlayLine } from "@/lib/types";

/**
 * El relato, del más reciente al más viejo — que es como se lee un juego en
 * curso: lo último que pasó, arriba.
 *
 * El titular sale de `event_es`, compuesto en el backend desde campos
 * estructurados. `description` es texto libre de la MLB y viene EN INGLÉS, así
 * que no se pinta.
 */

function Play({ play, away, home }: { play: PlayLine; away: string; home: string }) {
  const anota = play.is_scoring_play;
  // El turno EN CURSO también viaja en allPlays, todavía sin resultado:
  // `event` llega en null. Es la jugada que está pasando ahora mismo, no una
  // que salió mal, y pintarla como una más la dejaba con un guion.
  const enCurso = !play.is_complete;

  return (
    <li
      className={`flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0 ${
        enCurso ? "bg-raised" : anota ? "bg-pos/10" : "bg-card"
      }`}
    >
      <span
        aria-hidden
        className={`h-2 w-2 shrink-0 rounded-full ${
          enCurso ? "bg-warn" : anota ? "bg-pos" : "bg-line"
        }`}
      />

      <div className="min-w-0 flex-1">
        <p
          className={`text-sm font-semibold ${
            enCurso ? "text-warn" : anota ? "text-pos" : "text-fg"
          }`}
        >
          {enCurso ? "En turno" : play.event_es ?? "—"}
          {enCurso && (
            <span className="ml-2 font-normal tabular-nums text-dim">
              {play.balls}-{play.strikes} · {play.outs}{" "}
              {play.outs === 1 ? "out" : "outs"}
            </span>
          )}
          {!enCurso && play.rbi > 0 && (
            <span className="text-xs font-bold text-pos">
              {" · "}
              {play.rbi} {play.rbi === 1 ? "carrera" : "carreras"}
            </span>
          )}
        </p>
        {!!play.batter && (
          <p className="truncate text-xs text-dim">
            {play.batter}
            {!!play.pitcher && <span className="text-faint"> ante </span>}
            {play.pitcher}
          </p>
        )}
      </div>

      <div className="shrink-0 text-right">
        <p
          className={`text-sm font-bold tabular-nums ${
            anota ? "text-pos" : "text-fg2"
          }`}
        >
          {play.away_score}-{play.home_score}
        </p>
        <p className="text-[9px] text-dim">
          {away}-{home}
        </p>
      </div>
    </li>
  );
}

export default function PlayByPlay({ detail }: { detail: LiveGameDetail }) {
  if (detail.plays.length === 0) {
    return (
      <p className="px-4 py-10 text-center text-sm text-dim">
        {detail.status === "preview"
          ? "El juego no ha comenzado."
          : "Todavía no hay jugadas."}
      </p>
    );
  }

  const away = detail.away.team_code ?? "VIS";
  const home = detail.home.team_code ?? "LOC";

  // El corte de media entrada se calcula ANTES de renderizar, no mutando una
  // variable dentro del .map(). Con React 19 eso último es un error de verdad
  // y no una manía del linter: el render se puede interrumpir y reiniciar, y
  // el acumulador quedaría con el valor de la pasada abortada. Aquí el reduce
  // termina antes de que se devuelva un solo elemento.
  const filas = detail.plays.reduce<{ play: PlayLine; abreMedia: boolean }[]>(
    (acc, p) => {
      const anterior = acc[acc.length - 1]?.play.half_label ?? null;
      acc.push({
        play: p,
        abreMedia: !!p.half_label && p.half_label !== anterior,
      });
      return acc;
    },
    []
  );

  return (
    <>
      <ul>
        {filas.map(({ play: p, abreMedia }) => (
          <Fragment key={p.index}>
            {abreMedia && (
              <li className="flex items-center gap-3 bg-bg px-4 py-2">
                <span className="h-px flex-1 bg-line" />
                <span className="whitespace-nowrap text-[10px] font-bold uppercase tracking-wider text-dim">
                  {p.half_label}
                </span>
                <span className="h-px flex-1 bg-line" />
              </li>
            )}
            <Play play={p} away={away} home={home} />
          </Fragment>
        ))}
      </ul>
      {detail.plays_returned < detail.plays_total && (
        <p className="px-4 py-4 text-center text-xs text-dim">
          Mostrando las {detail.plays_returned} jugadas más recientes de{" "}
          {detail.plays_total}.
        </p>
      )}
    </>
  );
}
