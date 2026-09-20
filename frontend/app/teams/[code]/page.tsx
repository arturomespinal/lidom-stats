import { notFound } from "next/navigation";
import type { Metadata } from "next";

import Navbar from "@/components/Navbar";
import TeamBadge from "@/components/TeamBadge";
import TeamHistory from "@/components/team/TeamHistory";
import Leaders from "@/components/team/Leaders";
import { Batters, Pitchers } from "@/components/team/Roster";
import { fetchTeamProfile } from "@/lib/api";
import { DEFAULT_SEASON, TEAM_STYLES } from "@/lib/constants";

interface Props {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ season?: string }>;
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { code } = await props.params;
  return { title: `${code.toUpperCase()} · Deportiv` };
}

/** Un número grande con su etiqueta debajo, para la cabecera. */
function Cifra({
  valor,
  etiqueta,
  tono,
}: {
  valor: string;
  etiqueta: string;
  tono?: string;
}) {
  return (
    <div>
      <div className={`num font-cond text-2xl font-bold ${tono ?? "text-fg"}`}>
        {valor}
      </div>
      <div className="mt-0.5 text-[10px] uppercase tracking-[0.08em] text-faint">
        {etiqueta}
      </div>
    </div>
  );
}

export default async function TeamPage(props: Props) {
  const { code } = await props.params;
  const searchParams = await props.searchParams;
  const season = searchParams.season ?? DEFAULT_SEASON;

  // La URL puede venir en minúsculas de un enlace escrito a mano; la API
  // valida contra el catálogo y responde 400, así que se normaliza aquí.
  const codigo = code.toUpperCase();
  const equipo = await fetchTeamProfile(codigo, season);
  if (!equipo) notFound();

  const color = TEAM_STYLES[codigo]?.primary;

  // El total histórico se compone de lo que ya vino: pedirle al servidor otra
  // agregación para sumar catorce filas que el cliente tiene delante sería un
  // viaje de más. Las TASAS son otra cosa —esas nunca se promedian aquí— pero
  // G y P son conteos y se suman sin peligro.
  const totalG = equipo.history.reduce((a, f) => a + f.wins, 0);
  const totalP = equipo.history.reduce((a, f) => a + f.losses, 0);
  const pctHistorico = totalG + totalP > 0 ? totalG / (totalG + totalP) : null;
  const ultima = equipo.history[0];

  return (
    <>
      <Navbar season={season} />
      <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
        <header className="relative overflow-hidden rounded-xl border border-line bg-card">
          {color && (
            <span
              className="absolute inset-y-0 left-0 w-1"
              style={{ backgroundColor: color }}
              aria-hidden="true"
            />
          )}
          <div className="p-5 pl-6">
            <div className="flex items-start gap-4">
              <TeamBadge code={codigo} size="md" variant="solid" />
              <div>
                <h1 className="font-cond text-3xl font-bold leading-none tracking-[0.01em] text-fg">
                  {equipo.team_name.toUpperCase()}
                </h1>
                <p className="mt-1.5 text-xs text-dim">
                  {[equipo.city, equipo.founded_year && `fundado en ${equipo.founded_year}`]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-x-10 gap-y-4 border-t border-line-soft pt-4">
              <Cifra
                valor={`${totalG}-${totalP}`}
                etiqueta={`${equipo.seasons_count} temporadas`}
              />
              {pctHistorico != null && (
                <Cifra
                  valor={pctHistorico.toFixed(3).slice(1)}
                  etiqueta="PCT histórico"
                />
              )}
              {ultima && (
                <>
                  <Cifra
                    valor={`${ultima.wins}-${ultima.losses}`}
                    etiqueta={ultima.season_id}
                  />
                  <Cifra
                    valor={
                      ultima.run_diff > 0 ? `+${ultima.run_diff}` : String(ultima.run_diff)
                    }
                    etiqueta="Diferencial"
                    tono={
                      ultima.run_diff > 0
                        ? "text-pos"
                        : ultima.run_diff < 0
                          ? "text-neg"
                          : "text-fg2"
                    }
                  />
                </>
              )}
            </div>
          </div>
        </header>

        <Leaders
          leaders={equipo.leaders}
          minPa={equipo.min_pa}
          minIp={equipo.min_ip}
          seasonId={equipo.season_id}
        />

        <TeamHistory history={equipo.history} teamCode={codigo} />

        <div>
          <p className="mb-3 text-xs text-dim">
            Plantilla de {equipo.season_id} · ordenada por uso
          </p>
          <div className="space-y-6">
            {equipo.batters.length > 0 && <Batters data={equipo.batters} />}
            {equipo.pitchers.length > 0 && <Pitchers data={equipo.pitchers} />}
            {equipo.batters.length === 0 && equipo.pitchers.length === 0 && (
              <p className="rounded-xl border border-line bg-card px-4 py-8 text-center text-sm text-dim">
                No hay plantilla registrada para {equipo.season_id}.
              </p>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
