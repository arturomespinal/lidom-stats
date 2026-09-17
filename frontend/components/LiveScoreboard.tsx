import { LiveGameState, LiveTeamLine } from "@/lib/types";
import TeamBadge from "@/components/TeamBadge";
import BaseDiamond from "@/components/BaseDiamond";

interface Props {
  state: LiveGameState;
  /* El juego está en curso pero hace rato que no llega un evento. */
  stale?: boolean;
}

function StatusPill({ state }: { state: LiveGameState }) {
  if (state.status === "live") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold bg-[#da363320] text-[#ff6b6b] border border-[#da363350]">
        <span className="relative flex h-1.5 w-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#ff6b6b] opacity-75" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#ff6b6b]" />
        </span>
        EN VIVO
      </span>
    );
  }
  if (state.status === "final") {
    return (
      <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-[#21262d] text-[#8b949e] border border-[#30363d]">
        FINAL
        {state.inning && state.inning !== state.scheduled_innings
          ? ` (${state.inning})`
          : ""}
      </span>
    );
  }
  return (
    <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-[#1f6feb20] text-[#58a6ff] border border-[#1f6feb50]">
      {state.detailed_status || "PREVIA"}
    </span>
  );
}

function TeamRow({
  team,
  batting,
  won,
}: {
  team: LiveTeamLine;
  batting: boolean;
  won: boolean;
}) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      {/* La flecha marca quién batea; ocupa espacio siempre para que las dos
          filas queden alineadas aunque nadie esté bateando. */}
      <span className="w-2 text-[10px] text-[#facc15]">{batting ? "▸" : ""}</span>
      <TeamBadge code={team.team_code} />
      <span
        className={`flex-1 text-sm truncate ${
          won ? "text-white font-semibold" : "text-[#c9d1d9]"
        }`}
      >
        {team.team_name}
      </span>
      <span
        className={`w-7 text-right tabular-nums font-bold ${
          won ? "text-white" : "text-[#c9d1d9]"
        }`}
      >
        {team.runs}
      </span>
      <span className="w-6 text-right tabular-nums text-xs text-[#8b949e]">
        {team.hits}
      </span>
      <span className="w-6 text-right tabular-nums text-xs text-[#8b949e]">
        {team.errors}
      </span>
    </div>
  );
}

function LineScore({ state }: { state: LiveGameState }) {
  if (!state.line_score.length) return null;

  const cell = (v: number | null) => (
    <span className="tabular-nums">{v === null ? "-" : v}</span>
  );

  return (
    <div className="table-scroll overflow-x-auto -mx-1 px-1">
      <table className="text-[11px] tabular-nums">
        <thead>
          <tr className="text-[#8b949e]">
            <th className="w-9" />
            {state.line_score.map((i) => (
              <th key={i.inning} className="w-6 font-medium text-center">
                {i.inning}
              </th>
            ))}
            <th className="w-7 text-center font-semibold text-[#c9d1d9] pl-2">R</th>
            <th className="w-6 text-center font-medium">H</th>
            <th className="w-6 text-center font-medium">E</th>
          </tr>
        </thead>
        <tbody>
          {[
            { t: state.away, runs: (i: typeof state.line_score[0]) => i.away_runs },
            { t: state.home, runs: (i: typeof state.line_score[0]) => i.home_runs },
          ].map(({ t, runs }) => (
            <tr key={t.team_code} className="text-[#c9d1d9]">
              <td className="font-semibold text-[#8b949e]">{t.team_code}</td>
              {state.line_score.map((i) => (
                <td key={i.inning} className="text-center">
                  {cell(runs(i))}
                </td>
              ))}
              <td className="text-center font-bold text-white pl-2">{t.runs}</td>
              <td className="text-center">{t.hits}</td>
              <td className="text-center">{t.errors}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Situation({ state }: { state: LiveGameState }) {
  return (
    <div className="flex items-center gap-4">
      <BaseDiamond runners={state.runners} />

      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wide text-[#8b949e] w-12 shrink-0">
            Outs
          </span>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className={`w-2 h-2 rounded-full ${
                i < state.outs ? "bg-[#facc15]" : "bg-[#30363d]"
              }`}
            />
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wide text-[#8b949e] w-12 shrink-0">
            Cuenta
          </span>
          <span className="text-sm font-bold tabular-nums text-white">
            {state.balls}-{state.strikes}
          </span>
        </div>
      </div>

      <div className="flex-1 min-w-0 space-y-1 text-xs">
        {state.batter && (
          <div className="truncate">
            <span className="text-[#8b949e]">Al bate </span>
            <span className="text-white font-medium">{state.batter}</span>
          </div>
        )}
        {state.pitcher && (
          <div className="truncate">
            <span className="text-[#8b949e]">Lanza </span>
            <span className="text-white font-medium">{state.pitcher}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function LiveScoreboard({ state, stale }: Props) {
  const isLive = state.status === "live";
  const homeWon = state.status === "final" && state.home.runs > state.away.runs;
  const awayWon = state.status === "final" && state.away.runs > state.home.runs;
  const battingHome = isLive && state.is_top_inning === false;
  const battingAway = isLive && state.is_top_inning === true;

  return (
    <article className="bg-[#161b22] border border-[#30363d] rounded-lg overflow-hidden">
      <header className="flex items-center gap-2 px-4 py-2 border-b border-[#30363d] bg-[#0d1117]">
        <StatusPill state={state} />
        {/* inning_ordinal_es, no inning_ordinal: el crudo de la MLB viene en
            inglés y dentro de esta frase daba "Baja del 1st". */}
        {isLive && (state.inning_ordinal_es ?? state.inning_ordinal) && (
          <span className="text-xs text-[#c9d1d9]">
            {state.is_top_inning ? "Alta" : "Baja"} del{" "}
            {state.inning_ordinal_es ?? state.inning_ordinal}
          </span>
        )}
        {stale && (
          <span
            className="text-[10px] text-[#d29922]"
            title="Hace rato que no llega una actualización"
          >
            sin señal
          </span>
        )}
        <span className="ml-auto text-[11px] text-[#8b949e] truncate max-w-[45%]">
          {state.venue}
        </span>
      </header>

      <div className="px-4 pt-2 pb-3">
        <div className="flex items-center gap-3 text-[10px] uppercase tracking-wide text-[#8b949e] pb-1 border-b border-[#21262d]">
          <span className="w-2" />
          <span className="w-8" />
          <span className="flex-1" />
          <span className="w-7 text-right">R</span>
          <span className="w-6 text-right">H</span>
          <span className="w-6 text-right">E</span>
        </div>
        <TeamRow team={state.away} batting={battingAway} won={awayWon} />
        <TeamRow team={state.home} batting={battingHome} won={homeWon} />
      </div>

      {isLive && (
        <div className="px-4 py-3 border-t border-[#30363d] bg-[#0d111780]">
          <Situation state={state} />
        </div>
      )}

      {state.line_score.length > 0 && state.status !== "preview" && (
        <div className="px-4 py-2.5 border-t border-[#30363d]">
          <LineScore state={state} />
        </div>
      )}

      {state.last_play && state.status !== "preview" && (
        <div
          className={`px-4 py-2 border-t border-[#30363d] text-xs ${
            state.last_play_is_scoring
              ? "bg-[#23863620] text-[#7ee787]"
              : "text-[#8b949e]"
          }`}
        >
          {state.last_play_is_scoring && <span className="mr-1">⚾</span>}
          {state.last_play}
        </div>
      )}

      {state.decisions && (state.decisions.winner || state.decisions.loser) && (
        <div className="px-4 py-2 border-t border-[#30363d] text-[11px] text-[#8b949e] flex flex-wrap gap-x-4 gap-y-1">
          {state.decisions.winner && (
            <span>
              G: <span className="text-[#c9d1d9]">{state.decisions.winner}</span>
            </span>
          )}
          {state.decisions.loser && (
            <span>
              P: <span className="text-[#c9d1d9]">{state.decisions.loser}</span>
            </span>
          )}
          {state.decisions.save && (
            <span>
              S: <span className="text-[#c9d1d9]">{state.decisions.save}</span>
            </span>
          )}
        </div>
      )}
    </article>
  );
}
