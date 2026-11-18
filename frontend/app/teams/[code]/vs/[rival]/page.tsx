import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import Navbar from "@/components/Navbar";
import TeamBadge from "@/components/TeamBadge";
import Seccion from "@/components/ficha/Seccion";
import { fetchEnfrentamiento, fetchSeasons } from "@/lib/api";
import { TEAM_FULL_NAMES, TEAM_SHORT_NAMES, TEAM_STYLES } from "@/lib/constants";
import { fechaEs, num, pct3 } from "@/lib/formato";
import { compartir } from "@/lib/metadata";
import type { DestacadoBateoH2H, DestacadoPitcheoH2H, Enfrentamiento } from "@/lib/types";

// En Next 16 `params` y `searchParams` son promesas. Ver CLAUDE.md.
interface Props {
  params: Promise<{ code: string; rival: string }>;
  searchParams: Promise<{ season?: string }>;
}

async function cargar(props: Props) {
  const { code, rival } = await props.params;
  const equipo = code.toUpperCase();
  const otro = rival.toUpperCase();
  if (!TEAM_STYLES[equipo] || !TEAM_STYLES[otro] || equipo === otro) notFound();
  const temporada = (await props.searchParams).season ?? (await fetchSeasons())[0] ?? "2025";
  const h2h = await fetchEnfrentamiento(equipo, otro, temporada);
  return { equipo, otro, temporada, h2h };
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { equipo, otro, h2h } = await cargar(props);
  const titulo = `${TEAM_SHORT_NAMES[equipo]} vs ${TEAM_SHORT_NAMES[otro]}`;
  return compartir(
    h2h?.season_id ? `${titulo} · ${h2h.season_id}` : titulo,
    h2h?.headline ?? "La serie de la temporada entre los dos."
  );
}

/** "Mié 15 oct" no viene en los juegos del h2h: la fecha corta, sin el año. */
function fecha(iso: string): string {
  return fechaEs(iso).replace(/ \d{4}$/, "");
}

function Bateador({ b }: { b: DestacadoBateoH2H }) {
  return (
    <li className="flex items-center gap-3 py-2">
      <div className="min-w-0 flex-1">
        <Link href={`/players/${b.player_id}`} className="block truncate font-semibold hover:underline">
          {b.full_name}
        </Link>
        <p className="text-xs text-dim">
          {b.h}-{b.ab}
          {b.hr > 0 && ` · ${b.hr} HR`}
          {b.rbi > 0 && ` · ${b.rbi} CI`}
        </p>
      </div>
      <div className="text-right">
        <p className="num font-cond text-xl leading-none">{pct3(b.ops)}</p>
        <p className="text-[10px] uppercase tracking-[0.08em] text-dim">OPS</p>
      </div>
    </li>
  );
}

function Lanzador({ p }: { p: DestacadoPitcheoH2H }) {
  return (
    <li className="flex items-center gap-3 py-2">
      <div className="min-w-0 flex-1">
        <Link href={`/players/${p.player_id}`} className="block truncate font-semibold hover:underline">
          {p.full_name}
        </Link>
        <p className="text-xs text-dim">
          {p.ip} IP · {p.er} CL · {p.so} K
        </p>
      </div>
      <div className="text-right">
        <p className="num font-cond text-xl leading-none">{num(p.era, 2)}</p>
        <p className="text-[10px] uppercase tracking-[0.08em] text-dim">EFE</p>
      </div>
    </li>
  );
}

function Destacados({ code, d }: { code: string; d: Enfrentamiento["leaders"]["team"] }) {
  return (
    <div className="rounded-xl border border-line bg-card px-4 py-3">
      <div className="mb-1 flex items-center gap-2">
        <TeamBadge code={code} />
        <h3 className="font-bold">{TEAM_SHORT_NAMES[code]}</h3>
      </div>
      {d.batting.length === 0 && d.pitching.length === 0 ? (
        <p className="py-3 text-sm text-dim">Nadie con el volumen suficiente en la serie.</p>
      ) : (
        <>
          {d.batting.length > 0 && <ul className="divide-y divide-line-soft">{d.batting.map((b) => <Bateador key={b.player_id} b={b} />)}</ul>}
          {d.pitching.length > 0 && (
            <ul className="mt-1 divide-y divide-line-soft border-t border-line">
              {d.pitching.map((p) => <Lanzador key={p.player_id} p={p} />)}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Un equipo contra otro en una temporada: la serie, de local y de visita,
 * sus juegos y quién brilló. Se llega desde "Contra cada rival" en la ficha
 * del equipo. Lo compone el servidor (GET /teams/{code}/h2h/{rival},
 * src/enfrentamiento.py). Misma pantalla que la del móvil (EnfrentamientoScreen).
 */
export default async function EnfrentamientoPage(props: Props) {
  const { equipo, otro, temporada, h2h } = await cargar(props);
  const t = h2h?.season_id ?? temporada;

  return (
    <>
      <Navbar season={temporada} />
      <main className="mx-auto max-w-3xl space-y-8 px-4 pb-10 pt-6">
        <Link href={`/teams/${equipo}?season=${temporada}`} className="text-sm text-dim hover:text-fg">
          ← {TEAM_FULL_NAMES[equipo]}
        </Link>

        <section className="rounded-xl border border-line bg-card p-4 sm:p-6">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <Link href={`/teams/${equipo}?season=${t}`} className="flex min-w-0 flex-col items-center gap-2 text-center">
              <TeamBadge code={equipo} size="md" variant="solid" />
              <span className="truncate text-sm font-bold sm:text-base">{TEAM_SHORT_NAMES[equipo]}</span>
            </Link>
            <div className="text-center">
              <p className="num font-cond text-[64px] leading-none sm:text-[80px]">
                {h2h ? `${h2h.summary.wins}-${h2h.summary.losses}` : "—"}
              </p>
              <p className="text-xs uppercase tracking-[0.08em] text-dim">Serie {t}</p>
            </div>
            <Link href={`/teams/${otro}?season=${t}`} className="flex min-w-0 flex-col items-center gap-2 text-center">
              <TeamBadge code={otro} size="md" variant="solid" />
              <span className="truncate text-sm font-bold sm:text-base">{TEAM_SHORT_NAMES[otro]}</span>
            </Link>
          </div>
          {h2h && (
            <>
              <p className="mt-4 text-center font-semibold">{h2h.headline}</p>
              <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
                {(["home", "away"] as const).map((lado) => {
                  const s = h2h.split[lado];
                  return (
                    <div key={lado}>
                      <dt className="text-[10px] uppercase tracking-[0.08em] text-dim">
                        {lado === "home" ? "De local" : "De visita"}
                      </dt>
                      <dd className="num font-cond text-2xl">{s ? `${s.wins}-${s.games_played - s.wins}` : "0-0"}</dd>
                    </div>
                  );
                })}
                <div>
                  <dt className="text-[10px] uppercase tracking-[0.08em] text-dim">Carreras</dt>
                  <dd className="num font-cond text-2xl">
                    {h2h.summary.runs_for}-{h2h.summary.runs_against}
                  </dd>
                </div>
              </dl>
              <p className="mt-2 text-center text-xs text-dim">Del lado de {TEAM_SHORT_NAMES[equipo]}.</p>
            </>
          )}
        </section>

        {!h2h && (
          <p className="rounded-xl border border-line bg-card px-4 py-8 text-center text-sm text-dim">
            {TEAM_SHORT_NAMES[equipo]} y {TEAM_SHORT_NAMES[otro]} no se han enfrentado en {temporada}.
          </p>
        )}

        {h2h && (
          <>
            <section>
              <Seccion titulo="Los juegos" nota={`${h2h.count}`} />
              <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-card">
                {h2h.games.map((g) => {
                  const ganoVisita = g.away_score > g.home_score;
                  return (
                    <li key={g.game_id}>
                      <Link href={`/juegos/${g.game_id}`} className="flex min-h-12 items-center gap-3 px-4 py-2 hover:bg-raised">
                        <span className="w-16 shrink-0 text-xs text-dim">{fecha(g.game_date)}</span>
                        <span className="flex flex-1 items-center justify-center gap-2 text-sm">
                          <span className={ganoVisita ? "font-bold" : "text-dim"}>{g.away_team_code}</span>
                          <span className={`num font-cond text-lg ${ganoVisita ? "" : "text-dim"}`}>{g.away_score}</span>
                          <span className="text-dim">–</span>
                          <span className={`num font-cond text-lg ${ganoVisita ? "text-dim" : ""}`}>{g.home_score}</span>
                          <span className={ganoVisita ? "text-dim" : "font-bold"}>{g.home_team_code}</span>
                        </span>
                        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 text-dim" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M9 6l6 6-6 6" />
                        </svg>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>

            <section>
              <Seccion
                titulo="Los que brillaron"
                nota="En la serie"
                sub="Bateo por OPS (2 turnos por juego como mínimo) y pitcheo por efectividad (1 entrada por juego)."
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <Destacados code={equipo} d={h2h.leaders.team} />
                <Destacados code={otro} d={h2h.leaders.opponent} />
              </div>
            </section>
          </>
        )}
      </main>
    </>
  );
}
