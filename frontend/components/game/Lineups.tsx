import TeamBadge from "@/components/TeamBadge";
import { TeamDetail } from "@/lib/types";

/**
 * Quién está en el terreno, quién ya lanzó y quién queda disponible.
 *
 * `bullpen` y `bench` son los que TODAVÍA NO han entrado: la MLB los saca de
 * esas listas cuando entran al juego. Por eso el bullpen encoge a medida que
 * avanza el juego, y eso mismo es la información útil — cuántos brazos le
 * quedan al manager.
 */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="px-4 pb-1.5 pt-4 text-[10px] font-bold uppercase tracking-wider text-dim">
        {title}
      </h4>
      {children}
    </div>
  );
}

function Block({ team }: { team: TeamDetail }) {
  const titulares = team.batters.filter((b) => b.is_starter);

  return (
    <section className="min-w-0">
      <header className="flex items-center gap-2.5 bg-bg px-4 py-2.5">
        <TeamBadge code={team.team_code ?? "—"} />
        <h3 className="flex-1 truncate text-sm font-bold">{team.team_name}</h3>
      </header>

      <Section title="Alineación">
        {titulares.length === 0 ? (
          <p className="px-4 pb-3 text-xs italic text-dim">Sin publicar.</p>
        ) : (
          <ol>
            {titulares.map((b, i) => (
              <li
                key={b.player_id}
                className="flex items-center gap-2 border-t border-line px-4 py-1.5 text-[13px]"
              >
                <span className="w-4 shrink-0 tabular-nums text-xs text-dim">
                  {i + 1}
                </span>
                <span className="w-7 shrink-0 text-[10px] font-bold text-dim">
                  {b.position ?? ""}
                </span>
                <span className="flex-1 truncate text-fg2">{b.name}</span>
                {!!b.summary && (
                  <span className="shrink-0 tabular-nums text-xs text-dim">
                    {b.summary}
                  </span>
                )}
              </li>
            ))}
          </ol>
        )}
      </Section>

      <Section title={`Ya lanzaron (${team.pitchers.length})`}>
        {team.pitchers.length === 0 ? (
          <p className="px-4 pb-3 text-xs italic text-dim">Ninguno todavía.</p>
        ) : (
          <ol>
            {team.pitchers.map((p) => (
              <li
                key={p.player_id}
                className="flex items-center gap-2 border-t border-line px-4 py-1.5 text-[13px]"
              >
                <span className="w-4 shrink-0 tabular-nums text-xs text-dim">
                  {p.order}
                </span>
                <span className="w-7 shrink-0 text-[10px] font-bold text-dim">
                  {p.is_starter ? "AB" : "RL"}
                </span>
                <span className="flex-1 truncate text-fg2">
                  {p.name}
                  {!!p.note && (
                    <span className="text-xs font-bold text-pos"> {p.note}</span>
                  )}
                </span>
                <span className="shrink-0 tabular-nums text-xs text-dim">
                  {p.innings_pitched ?? "—"} IP · {p.pitches} lan.
                </span>
              </li>
            ))}
          </ol>
        )}
      </Section>

      <Section title={`Bullpen disponible (${team.bullpen.length})`}>
        <p className="px-4 pb-2 text-xs leading-relaxed text-dim">
          {team.bullpen.length === 0
            ? "Sin brazos disponibles."
            : team.bullpen.map((a) => a.name).join(" · ")}
        </p>
      </Section>

      <Section title={`Banca (${team.bench.length})`}>
        <p className="px-4 pb-4 text-xs leading-relaxed text-dim">
          {team.bench.length === 0
            ? "Sin sustitutos disponibles."
            : team.bench.map((a) => a.name).join(" · ")}
        </p>
      </Section>
    </section>
  );
}

export default function Lineups({
  home,
  away,
}: {
  home: TeamDetail;
  away: TeamDetail;
}) {
  return (
    <div className="grid gap-2 lg:grid-cols-2">
      <Block team={away} />
      <Block team={home} />
    </div>
  );
}
