import Link from "next/link";
import type { Metadata } from "next";

import Navbar from "@/components/Navbar";
import Seccion from "@/components/ficha/Seccion";
import ElegirJugador from "@/components/comparar/ElegirJugador";
import TablaComparacion from "@/components/comparar/TablaComparacion";
import { fetchComparacion, fetchPlayerProfile } from "@/lib/api";
import type { RolComparacion } from "@/lib/types";

export const metadata: Metadata = { title: "Comparar jugadores · Deportiv" };

// En Next 16 `searchParams` es una promesa. Ver CLAUDE.md.
interface Props {
  searchParams: Promise<{ a?: string; b?: string; rol?: string; temporada?: string }>;
}

// En la URL, el papel en español; hacia la API, como lo nombra ella.
const ROL_API: Record<string, RolComparacion> = { bateo: "batting", pitcheo: "pitching" };
const ROL_URL: Record<RolComparacion, string> = { batting: "bateo", pitching: "pitcheo" };

/**
 * Dos jugadores lado a lado: la carrera completa o una temporada que jugaron
 * los dos, en bateo o en pitcheo. Se llega con el botón "Comparar" de la
 * ficha de un jugador (`?a=` ya puesto) y el segundo se elige aquí.
 *
 * Todo lo que se compara lo compone el servidor (GET /players/compare,
 * src/comparar.py): las tasas recompuestas, quién gana cada renglón y la
 * frase. Misma pantalla que la del móvil (CompararScreen).
 */
export default async function CompararPage(props: Props) {
  const sp = await props.searchParams;
  const a = sp.a ?? null;
  const b = sp.b ?? null;
  const rol = sp.rol ? ROL_API[sp.rol] : undefined;
  const temporada = sp.temporada && /^\d{4}-\d{2}$/.test(sp.temporada) ? sp.temporada : undefined;

  const cmp = a && b ? await fetchComparacion(a, b, rol, temporada) : null;
  // Con uno solo elegido, su nombre sale de la ficha.
  const solo = !cmp && (a || b) ? await fetchPlayerProfile((a ?? b)!) : null;
  const elegido = (lado: "a" | "b") => {
    if (cmp) {
      const p = cmp.players[lado === "a" ? 0 : 1];
      return { player_id: p.player_id, full_name: p.full_name, team_code: p.team_code };
    }
    const id = lado === "a" ? a : b;
    if (solo && id === solo.player.player_id) {
      const code = solo.context?.latest.team_code ?? solo.batting[0]?.team_code ?? solo.pitching[0]?.team_code ?? null;
      return { player_id: id, full_name: solo.player.full_name, team_code: code };
    }
    return null;
  };

  const enlace = (cambios: { rol?: RolComparacion; temporada?: string | null }) => {
    const params = new URLSearchParams({ a: a!, b: b! });
    const r = cambios.rol ?? cmp?.role;
    if (r) params.set("rol", ROL_URL[r]);
    const t = "temporada" in cambios ? cambios.temporada : cmp?.season !== "career" ? cmp?.season : null;
    if (t) params.set("temporada", t);
    return `/comparar?${params}`;
  };
  const pastilla = (activa: boolean) =>
    `tocable inline-flex min-h-11 shrink-0 items-center rounded-lg px-3 text-sm font-semibold ${
      activa ? "bg-accent text-accent-on" : "border border-line bg-card text-fg hover:bg-raised"
    }`;

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-3xl space-y-6 px-4 pb-10 pt-6">
        <header className="space-y-1">
          <h1 className="font-cond text-[40px] leading-none tracking-[0.01em] text-fg">Comparar</h1>
          <p className="text-sm text-dim">Dos jugadores lado a lado: la carrera o una temporada que jugaron los dos.</p>
        </header>

        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-xl border border-line bg-card p-3">
          <ElegirJugador lado="a" elegido={elegido("a")} otro={b} />
          <span className="font-cond text-lg text-dim">vs</span>
          <ElegirJugador lado="b" elegido={elegido("b")} otro={a} />
        </div>

        {a && b && !cmp && (
          <p className="rounded-xl border border-line bg-card px-4 py-8 text-center text-sm text-dim">
            {a === b ? "Elige dos jugadores distintos." : "No se pudo armar la comparación. Prueba con otro jugador."}
          </p>
        )}

        {cmp && (
          <>
            <div className="space-y-3">
              {/* El papel solo se elige si los dos tienen cifras en los dos. */}
              {cmp.roles.length > 1 && (
                <nav aria-label="Bateo o pitcheo" className="flex gap-2">
                  {cmp.roles.map((r) => (
                    <Link key={r} href={enlace({ rol: r, temporada: null })} className={pastilla(r === cmp.role)} aria-current={r === cmp.role ? "page" : undefined}>
                      {r === "batting" ? "Bateo" : "Pitcheo"}
                    </Link>
                  ))}
                </nav>
              )}
              {/* La carrera y las temporadas que jugaron los dos, de la más nueva a la más vieja. */}
              <nav aria-label="Temporada" className="table-scroll -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
                {["career", ...cmp.seasons_in_common].map((t) => (
                  <Link
                    key={t}
                    href={enlace({ temporada: t === "career" ? null : t })}
                    className={`num ${pastilla(t === cmp.season)}`}
                    aria-current={t === cmp.season ? "page" : undefined}
                  >
                    {t === "career" ? "Carrera" : t}
                  </Link>
                ))}
              </nav>
            </div>

            <section>
              <Seccion
                titulo={cmp.role === "batting" ? "Bateo" : "Pitcheo"}
                nota={cmp.season_label}
                titular={cmp.headline}
                sub={cmp.note ?? (cmp.season === "career" ? "Carrera completa, con los años anteriores a 2012-13 si los tiene." : undefined)}
              />
              <TablaComparacion cmp={cmp} />
            </section>
          </>
        )}
      </main>
    </>
  );
}
