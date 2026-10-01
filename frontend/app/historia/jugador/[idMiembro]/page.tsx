import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";

import Navbar from "@/components/Navbar";
import Heroe, { CifraHeroe, ColumnaHeroe, FilaCifras, NombreHeroe } from "@/components/ficha/Heroe";
import Monograma from "@/components/ficha/Monograma";
import Seccion from "@/components/ficha/Seccion";
import Trayectoria from "@/components/ficha/Trayectoria";
import { BattingSeasons, PitchingSeasons } from "@/components/player/SeasonTable";
import { fetchMiembroHistorico } from "@/lib/api";
import { DEFAULT_SEASON, TEAM_STYLES } from "@/lib/constants";
import { entradas, epocaHistorica, num, pct3 } from "@/lib/formato";

// En Next 16 `params` es una promesa: ver CLAUDE.md.
interface Props {
  params: Promise<{ idMiembro: string }>;
}

async function cargar(props: Props) {
  const { idMiembro } = await props.params;
  const id = Number(idMiembro);
  return Number.isInteger(id) && id > 0 ? fetchMiembroHistorico(id) : null;
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const m = await cargar(props);
  if (!m) return { title: "Jugador no encontrado · Deportiv" };
  return {
    title: `${m.player.name} · Historia · Deportiv`,
    description: `La carrera de ${m.player.name} en LIDOM, temporada por temporada.`,
  };
}

/**
 * La ficha de un jugador que solo existe en DIGIMETRICS (antes de 2012-13):
 * Marichal, los Alou, Tony Peña. Misma cabecera y mismas tablas que la ficha
 * de la MLB API, sin lo que esos años no tienen (contra la liga, juego a
 * juego, biografía).
 *
 * Si el jugador está enlazado a la MLB API, su ficha completa es la otra —ya
 * incluye estos años—, así que se redirige.
 */
export default async function MiembroPage(props: Props) {
  const m = await cargar(props);
  if (!m) notFound();
  if (m.player.player_id) redirect(`/players/${m.player.player_id}`);

  const cb = m.career_batting;
  const cp = m.career_pitching;
  const temporadas = (cb?.seasons ?? 0) || (cp?.seasons ?? 0);
  // El equipo con más temporadas da el color del plano: es por el que se le
  // recuerda. `teams` llega ordenado por la más reciente.
  const principal = [...m.teams].sort((a, b) => b.seasons - a.seasons)[0]?.team_code ?? null;
  const color = (principal && TEAM_STYLES[principal]?.primary) || "#56637A";
  const primera = m.teams.reduce((x, t) => (t.first_season < x ? t.first_season : x), "9999");
  const ultima = m.teams.reduce((x, t) => (t.last_season > x ? t.last_season : x), "0000");

  const bateoRelevante = (cb?.pa ?? 0) >= 10;
  const pitcheoRelevante = (cp?.outs ?? 0) >= 9;
  const regularB = m.batting;
  const regularP = m.pitching;

  return (
    <>
      <Navbar season={DEFAULT_SEASON} />
      <Heroe color={color} lado={<Monograma nombre={m.player.name} />}>
        <ColumnaHeroe>
          <p className="truncate text-[11px] uppercase tracking-[0.08em] text-ink-dim">
            Historia · {m.teams.length ? epocaHistorica(primera, ultima) : ""}
          </p>
          <NombreHeroe>{m.player.name}</NombreHeroe>
          <p className="text-[13px] leading-snug text-ink-dim sm:text-sm">
            {temporadas} {temporadas === 1 ? "temporada" : "temporadas"} en LIDOM
          </p>
        </ColumnaHeroe>
        <FilaCifras titulo="Carrera · serie regular">
          {m.is_pitcher && cp ? (
            <>
              <CifraHeroe valor={num(cp.era, 2)} etiqueta="EFE" />
              <CifraHeroe valor={`${cp.wins}-${cp.losses}`} etiqueta="G-P" />
              <CifraHeroe valor={num(cp.so)} etiqueta="K" />
              <CifraHeroe valor={entradas(cp.innings_pitched)} etiqueta="IP" />
            </>
          ) : cb ? (
            <>
              <CifraHeroe valor={pct3(cb.avg)} etiqueta="AVG" />
              <CifraHeroe valor={num(cb.h)} etiqueta="H" />
              <CifraHeroe valor={num(cb.hr)} etiqueta="HR" />
              <CifraHeroe valor={num(cb.rbi)} etiqueta="CI" />
            </>
          ) : null}
        </FilaCifras>
      </Heroe>

      <main className="mx-auto max-w-5xl space-y-10 px-4 pb-10 pt-6">
        {m.teams.length > 0 && (
          <section>
            <Seccion titulo="Trayectoria" nota={`${m.teams.length} ${m.teams.length === 1 ? "equipo" : "equipos"}`} />
            <Trayectoria equipos={m.teams} />
          </section>
        )}

        {m.is_pitcher && pitcheoRelevante && (
          <PitchingSeasons
            temporadas={[]}
            historicas={regularP}
            separador={null}
            carrera={cp}
            etiquetaCarrera="Carrera"
            postemporada={m.postseason_pitching}
          />
        )}
        {bateoRelevante && (
          <BattingSeasons
            temporadas={[]}
            historicas={regularB}
            separador={null}
            carrera={cb}
            etiquetaCarrera="Carrera"
            postemporada={m.postseason_batting}
          />
        )}
        {!m.is_pitcher && pitcheoRelevante && (
          <PitchingSeasons
            temporadas={[]}
            historicas={regularP}
            separador={null}
            carrera={cp}
            etiquetaCarrera="Carrera"
            postemporada={m.postseason_pitching}
          />
        )}

        <p className="text-[11px] leading-relaxed text-faint">
          Datos: DIGIMETRICS (estadisticas.lidom.com), el portal de estadísticas de la liga. La fila de carrera es
          la serie regular; RR y Final marcan el round robin y la serie final.
        </p>
      </main>
    </>
  );
}
