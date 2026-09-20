import { notFound } from "next/navigation";
import type { Metadata } from "next";

import Navbar from "@/components/Navbar";
import PlayerHeader from "@/components/player/PlayerHeader";
import { BattingSeasons, PitchingSeasons } from "@/components/player/SeasonTable";
import { fetchPlayerProfile } from "@/lib/api";
import { DEFAULT_SEASON } from "@/lib/constants";

// En Next 16 `params` es una promesa. Declararlo sin `Promise` compila y falla
// en ejecución, así que el tipo es parte del contrato. Ver CLAUDE.md.
interface Props {
  params: Promise<{ playerId: string }>;
  searchParams: Promise<{ season?: string }>;
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { playerId } = await props.params;
  const perfil = await fetchPlayerProfile(playerId);
  if (!perfil) return { title: "Jugador no encontrado · Deportiv" };
  return {
    title: `${perfil.player.full_name} · Deportiv`,
    description: `Estadísticas de ${perfil.player.full_name} en LIDOM: ${
      perfil.career_batting?.seasons ?? perfil.career_pitching?.seasons ?? 0
    } temporadas.`,
  };
}

export default async function PlayerPage(props: Props) {
  const { playerId } = await props.params;
  const searchParams = await props.searchParams;
  const season = searchParams.season ?? DEFAULT_SEASON;

  const perfil = await fetchPlayerProfile(playerId);
  if (!perfil) notFound();

  // El equipo de la temporada más reciente da el color de la cabecera. Las dos
  // listas llegan de la más nueva a la más vieja, así que basta el primer
  // elemento de la que exista: un lanzador puro no tiene filas de bateo.
  const equipoActual =
    perfil.batting[0]?.team_code ?? perfil.pitching[0]?.team_code ?? null;

  // Un lanzador con tres turnos al bate no necesita una tabla de bateo de
  // dieciséis columnas, y un bateador que lanzó una entrada en un juego roto
  // tampoco una de pitcheo. El umbral evita que la ficha abra con una tabla
  // de una fila llena de ceros.
  const bateoRelevante =
    perfil.batting.length > 0 && (perfil.career_batting?.pa ?? 0) >= 10;
  const pitcheoRelevante =
    perfil.pitching.length > 0 && (perfil.career_pitching?.outs ?? 0) >= 9;

  return (
    <>
      <Navbar season={season} />
      <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
        <PlayerHeader
          bio={perfil.player}
          teams={perfil.teams}
          currentTeam={equipoActual}
        />

        {/* Un lanzador abre con su pitcheo; todos los demás, con su bateo. */}
        {perfil.is_pitcher && pitcheoRelevante && (
          <PitchingSeasons
            temporadas={perfil.pitching}
            carrera={perfil.career_pitching}
          />
        )}

        {bateoRelevante && (
          <BattingSeasons
            temporadas={perfil.batting}
            carrera={perfil.career_batting}
          />
        )}

        {!perfil.is_pitcher && pitcheoRelevante && (
          <PitchingSeasons
            temporadas={perfil.pitching}
            carrera={perfil.career_pitching}
          />
        )}

        {!bateoRelevante && !pitcheoRelevante && (
          <p className="rounded-xl border border-line bg-card px-4 py-8 text-center text-sm text-dim">
            Este jugador aparece en la base pero no acumula suficientes turnos
            ni entradas para una tabla.
          </p>
        )}

        <p className="text-[11px] text-faint">
          Datos: MLB Stats API · {perfil.batting.length + perfil.pitching.length}{" "}
          temporadas-equipo registradas
        </p>
      </main>
    </>
  );
}
