import Link from "next/link";
import type { Metadata } from "next";

import Navbar from "@/components/Navbar";
import EmptyState from "@/components/EmptyState";
import Seccion from "@/components/ficha/Seccion";
import { fetchCalendar } from "@/lib/api";
import { DEFAULT_SEASON } from "@/lib/constants";

export const metadata: Metadata = { title: "Calendario · Deportiv" };

// En Next 16 `searchParams` es una promesa. Ver CLAUDE.md.
interface Props {
  searchParams: Promise<{ season?: string; temporada?: string; activa?: string }>;
}

const DIAS = ["L", "M", "M", "J", "V", "S", "D"];

/**
 * Las jornadas de una temporada, para saltar a cualquier fecha desde la
 * portada. Misma pantalla que mobile/src/screens/CalendarioScreen.tsx.
 *
 * Los meses llegan con las semanas ya armadas (GET /calendar). Cada día con
 * juegos es un enlace a `/?fecha=`; los días sin juegos se pintan atenuados y
 * no son enlace. La temporada va en la URL (`?temporada=`), no en estado.
 */
export default async function CalendarioPage(props: Props) {
  const sp = await props.searchParams;
  const season = sp.season ?? DEFAULT_SEASON;
  const cal = await fetchCalendar(sp.temporada);
  const activa = sp.activa;

  return (
    <>
      <Navbar season={season} />
      {!cal ? (
        <main className="mx-auto max-w-5xl px-4 py-8">
          <EmptyState />
        </main>
      ) : (
        <>
          <nav aria-label="Temporada" className="sticky top-14 z-[5] border-b border-line bg-bg/95 backdrop-blur">
            <div className="mx-auto flex max-w-5xl overflow-x-auto px-4">
              {cal.seasons.map((s) => {
                const es = s === cal.season_id;
                return (
                  <Link
                    key={s}
                    href={`/calendario?temporada=${s}${activa ? `&activa=${activa}` : ""}`}
                    aria-current={es ? "page" : undefined}
                    className={`num flex h-11 shrink-0 items-center border-b-2 px-3 text-sm ${
                      es ? "border-ink font-bold text-fg" : "border-transparent text-dim hover:text-fg"
                    }`}
                  >
                    {s}
                  </Link>
                );
              })}
            </div>
          </nav>
          <main className="mx-auto max-w-5xl space-y-8 px-4 pb-10 pt-6">
            <header className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="font-cond text-[40px] leading-none text-fg">Calendario</h1>
                <p className="num mt-1 text-sm text-dim">
                  Temporada {cal.season_id} · {cal.game_days} jornadas · {cal.games} juegos
                </p>
              </div>
              {cal.first_date && (
                <Link
                  href={`/?fecha=${cal.first_date}`}
                  className="inline-flex min-h-11 items-center rounded-lg border border-line bg-card px-4 text-sm font-semibold text-fg hover:bg-raised"
                >
                  Ir al inaugural ›
                </Link>
              )}
            </header>

            <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3 lg:gap-6">
              {cal.months.map((m) => (
                <section key={m.key}>
                  <Seccion titulo={m.label} nota={`${m.games} juegos`} />
                  <div className="rounded-xl border border-line bg-card p-2">
                    <div className="grid grid-cols-7 gap-1">
                      {DIAS.map((d, i) => (
                        <span key={i} className="py-1 text-center text-[11px] text-dim">
                          {d}
                        </span>
                      ))}
                      {m.weeks.flat().map((c, i) => {
                        if (!c) return <span key={i} />;
                        const hay = c.games > 0;
                        const es = c.date === activa;
                        const cuerpo = (
                          <>
                            <span className={`font-cond text-xl leading-none ${es ? "text-ink-fg" : hay ? "text-fg" : "text-dim opacity-45"}`}>
                              {c.day}
                            </span>
                            {hay && (
                              <span className={`num text-[10px] ${es ? "text-ink-dim" : "text-dim"}`}>{c.games}</span>
                            )}
                          </>
                        );
                        const clase = `flex min-h-11 flex-col items-center justify-center rounded-lg ${
                          es ? "bg-ink" : c.is_today ? "ring-[1.5px] ring-inset ring-ink" : ""
                        }`;
                        if (!hay) {
                          return (
                            <span key={i} className={clase} aria-label={`${c.day}, sin juegos`}>
                              {cuerpo}
                            </span>
                          );
                        }
                        return (
                          <Link
                            key={i}
                            href={`/?fecha=${c.date}`}
                            className={`${clase} ${es ? "" : "hover:bg-raised"}`}
                            aria-label={`${c.day} de ${m.label}, ${c.games} ${c.games === 1 ? "juego" : "juegos"}`}
                            aria-current={es ? "date" : undefined}
                          >
                            {cuerpo}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                </section>
              ))}
            </div>
          </main>
        </>
      )}
    </>
  );
}
