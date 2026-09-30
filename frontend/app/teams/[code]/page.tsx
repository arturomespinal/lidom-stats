import { notFound } from "next/navigation";
import type { Metadata } from "next";

import Navbar from "@/components/Navbar";
import { pct3 } from "@/lib/formato";
import TeamHeader from "@/components/team/TeamHeader";
import { SelectorOpciones } from "@/components/SelectorTemporada";
import Seccion from "@/components/ficha/Seccion";
import UltimosDiez from "@/components/ficha/UltimosDiez";
import CarreraBanderin from "@/components/ficha/CarreraBanderin";
import BarrasDiferencial from "@/components/ficha/BarrasDiferencial";
import TeamHistory from "@/components/team/TeamHistory";
import Leaders from "@/components/team/Leaders";
import { Batters, Pitchers } from "@/components/team/Roster";
import { fetchTeamProfile } from "@/lib/api";
import { DEFAULT_SEASON } from "@/lib/constants";

interface Props {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ season?: string }>;
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { code } = await props.params;
  return { title: `${code.toUpperCase()} · Deportiv` };
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

  const ganados = equipo.last10.filter((j) => j.result === "G").length;

  return (
    <>
      <Navbar season={season} />
      <TeamHeader equipo={equipo} />
      {/* Cada opción lleva el récord de esa campaña: se elige sabiendo qué
          se va a ver. */}
      <SelectorOpciones
        opciones={equipo.history.map((f) => ({
          label: f.season_id,
          href: `/teams/${codigo}?season=${f.season_id}`,
          nota: `${f.wins}-${f.losses}${f.win_pct != null ? ` · ${pct3(f.win_pct)}` : ""}`,
        }))}
        activa={equipo.season_id}
      />
      <main className="mx-auto max-w-5xl space-y-10 px-4 pb-10 pt-6">
        {/* Lo que depende de la temporada: la racha, la carrera por el
            banderín, los destacados y la plantilla. Las frases las compone
            el servidor (src/banderin.py). */}
        {equipo.last10.length > 0 && (
          <section className="max-w-xl">
            <Seccion
              titulo={`Últimos ${equipo.last10.length}`}
              nota={`${ganados}-${equipo.last10.length - ganados}`}
              sub="El más reciente, a la derecha. Cada uno abre su juego."
            />
            <UltimosDiez juegos={equipo.last10} />
          </section>
        )}

        {equipo.race.length > 0 && (
          <section>
            <Seccion
              titulo="La carrera"
              nota={equipo.season_id}
              titular={equipo.race_headline}
              sub="Juegos sobre .500, partido a partido. Por encima de la línea, más ganados que perdidos."
            />
            <CarreraBanderin carrera={equipo.race} equipo={codigo} />
          </section>
        )}

        <Leaders
          leaders={equipo.leaders}
          minPa={equipo.min_pa}
          minIp={equipo.min_ip}
          seasonId={equipo.season_id}
        />

        <section>
          <Seccion titulo="Plantilla" nota={`${equipo.season_id} · ordenada por uso`} />
          <div className="space-y-6">
            {equipo.batters.length > 0 && <Batters data={equipo.batters} />}
            {equipo.pitchers.length > 0 && <Pitchers data={equipo.pitchers} />}
            {equipo.batters.length === 0 && equipo.pitchers.length === 0 && (
              <p className="rounded-xl border border-line bg-card px-4 py-8 text-center text-sm text-dim">
                No hay plantilla registrada para {equipo.season_id}.
              </p>
            )}
          </div>
        </section>

        {/* Temporada a temporada: el diferencial en barras y la tabla. */}
        <section>
          <Seccion
            titulo={`${equipo.seasons_count} temporadas`}
            nota="Solo temporada regular"
            titular={equipo.history_headline}
          />
          <div className="space-y-4">
            <BarrasDiferencial historial={equipo.history} elegida={equipo.season_id} equipo={codigo} />
            <TeamHistory history={equipo.history} teamCode={codigo} elegida={equipo.season_id} />
          </div>
        </section>
      </main>
    </>
  );
}
