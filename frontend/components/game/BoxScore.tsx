import TeamBadge from "@/components/TeamBadge";
import { BatterLine, PitcherLine, TeamDetail } from "@/lib/types";

/**
 * Boxscore: los números de HOY, no el acumulado de temporada.
 *
 * Los bateadores vienen ya ordenados por turno al bate desde el backend, con
 * cada sustituto justo debajo del titular al que relevó (100, 101, 200, …).
 * La sangría solo hace visible un orden que el dato ya trae.
 *
 * En pantalla ancha los dos equipos van lado a lado; en angosta, apilados.
 */

const BAT_COLS = ["VB", "C", "H", "CI", "BB", "K"];
const PIT_COLS = ["H", "CL", "BB", "K"];

function BatterRow({ b }: { b: BatterLine }) {
  return (
    <tr className="border-t border-line">
      <td className="py-1.5 pr-2">
        <span className={`flex items-center gap-2 ${b.is_starter ? "" : "pl-3"}`}>
          <span className="w-7 shrink-0 text-[10px] font-bold text-dim">
            {b.position ?? ""}
          </span>
          <span className={`truncate ${b.is_starter ? "text-fg2" : "text-dim"}`}>
            {b.name}
          </span>
        </span>
      </td>
      <td className="px-1.5 py-1.5 text-right tabular-nums text-dim">{b.at_bats}</td>
      <td className="px-1.5 py-1.5 text-right tabular-nums text-dim">{b.runs}</td>
      <td className="px-1.5 py-1.5 text-right font-bold tabular-nums text-fg">
        {b.hits}
      </td>
      <td className="px-1.5 py-1.5 text-right tabular-nums text-dim">{b.rbi}</td>
      <td className="px-1.5 py-1.5 text-right tabular-nums text-dim">{b.walks}</td>
      <td className="px-1.5 py-1.5 text-right tabular-nums text-dim">
        {b.strikeouts}
      </td>
    </tr>
  );
}

function PitcherRow({ p }: { p: PitcherLine }) {
  return (
    <tr className="border-t border-line">
      <td className="py-1.5 pr-2">
        <span className="flex items-center gap-2">
          <span className="w-7 shrink-0 text-[10px] font-bold text-dim">
            {p.is_starter ? "AB" : "RL"}
          </span>
          <span className="truncate text-fg2">
            {p.name}
            {!!p.note && <span className="text-xs font-bold text-pos"> {p.note}</span>}
          </span>
        </span>
      </td>
      {/* Texto y no número: "0.2" son dos outs, no dos décimas. */}
      <td className="px-1.5 py-1.5 text-right font-bold tabular-nums text-fg">
        {p.innings_pitched ?? "—"}
      </td>
      <td className="px-1.5 py-1.5 text-right tabular-nums text-dim">{p.hits}</td>
      <td className="px-1.5 py-1.5 text-right tabular-nums text-dim">
        {p.earned_runs}
      </td>
      <td className="px-1.5 py-1.5 text-right tabular-nums text-dim">{p.walks}</td>
      <td className="px-1.5 py-1.5 text-right tabular-nums text-dim">
        {p.strikeouts}
      </td>
    </tr>
  );
}

function TeamBlock({ team }: { team: TeamDetail }) {
  return (
    <section className="min-w-0">
      <header className="flex items-center gap-2.5 bg-bg px-4 py-2.5">
        <TeamBadge code={team.team_code ?? "—"} />
        <h3 className="flex-1 truncate text-sm font-bold">{team.team_name}</h3>
        <span className="shrink-0 text-xs tabular-nums text-dim">
          {team.runs} C · {team.hits} H · {team.errors} E
        </span>
      </header>

      <div className="overflow-x-auto table-scroll px-4 pb-4">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-[10px] uppercase tracking-wide text-dim">
              <th className="pb-1 text-left font-bold">Bateadores</th>
              {BAT_COLS.map((c) => (
                <th key={c} className="px-1.5 pb-1 text-right font-bold">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {team.batters.map((b) => (
              <BatterRow key={`${b.player_id}-${b.batting_order}`} b={b} />
            ))}
          </tbody>

          <thead>
            <tr className="text-[10px] uppercase tracking-wide text-dim">
              <th className="pb-1 pt-4 text-left font-bold">Lanzadores</th>
              <th className="px-1.5 pb-1 pt-4 text-right font-bold">IP</th>
              {PIT_COLS.map((c) => (
                <th key={c} className="px-1.5 pb-1 pt-4 text-right font-bold">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {team.pitchers.map((p) => (
              <PitcherRow key={p.player_id} p={p} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function BoxScore({
  home,
  away,
}: {
  home: TeamDetail;
  away: TeamDetail;
}) {
  if (away.batters.length === 0 && home.batters.length === 0) {
    return (
      <p className="px-4 py-10 text-center text-sm text-dim">
        Todavía no hay boxscore.
      </p>
    );
  }
  // El visitante primero, como en el cuadro por entradas y en cualquier
  // boxscore impreso.
  return (
    <div className="grid gap-2 lg:grid-cols-2">
      <TeamBlock team={away} />
      <TeamBlock team={home} />
    </div>
  );
}
