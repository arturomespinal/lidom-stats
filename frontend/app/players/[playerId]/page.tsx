import { notFound } from "next/navigation";
import type { Metadata } from "next";

import Navbar from "@/components/Navbar";
import PlayerHeader from "@/components/player/PlayerHeader";
import { BattingSeasons, PitchingSeasons } from "@/components/player/SeasonTable";
import Seccion from "@/components/ficha/Seccion";
import PuestoLiga from "@/components/ficha/PuestoLiga";
import CurvaCarrera from "@/components/ficha/CurvaCarrera";
import Trayectoria from "@/components/ficha/Trayectoria";
import { fetchPlayerProfile } from "@/lib/api";
import { DEFAULT_SEASON } from "@/lib/constants";
import { entradas } from "@/lib/formato";

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

  // El equipo de más volumen en cada temporada: pinta las épocas de la curva.
  // Un jugador cambiado a mitad de campaña tiene dos filas; gana la de más
  // turnos (o outs), que es donde jugó la temporada.
  const ctx = perfil.context;
  const equipoPorTemporada: Record<string, string> = {};
  if (ctx) {
    const filas =
      ctx.role === "batting"
        ? perfil.batting.map((f) => ({ s: f.season_id, t: f.team_code, v: f.pa }))
        : perfil.pitching.map((f) => ({ s: f.season_id, t: f.team_code, v: f.outs }));
    const mejor: Record<string, number> = {};
    for (const { s: temporada, t: code, v } of filas) {
      if (!(temporada in mejor) || v > mejor[temporada]) {
        mejor[temporada] = v;
        equipoPorTemporada[temporada] = code;
      }
    }
  }

  return (
    <>
      <Navbar season={season} />
      <PlayerHeader bio={perfil.player} currentTeam={equipoActual} context={ctx} />
      <main className="mx-auto max-w-5xl space-y-10 px-4 pb-10 pt-6">
        {/* Contra la liga y la curva, lado a lado en pantalla ancha: las dos
            contestan "¿qué tan bueno es?", una este año y otra en el tiempo.
            Los puestos, la curva y las frases los compone el servidor. */}
        {ctx && (ctx.ranking || ctx.curve.points.length > 1) && (
          <div className="grid gap-10 lg:grid-cols-2 lg:gap-6">
            {ctx.ranking && (
              <section>
                <Seccion
                  titulo="Contra la liga"
                  nota={ctx.ranking.season_id}
                  titular={ctx.ranking.headline}
                  sub={
                    `Puesto entre los ${ctx.ranking.pool} calificados ` +
                    (ctx.role === "batting"
                      ? `(${ctx.ranking.minimum}+ AP). En ponches, 1º es quien menos se poncha.`
                      : `(${entradas(ctx.ranking.minimum)}+ IP). En efectividad, WHIP y boletos, 1º es el más bajo.`)
                  }
                />
                <PuestoLiga ranking={ctx.ranking} />
              </section>
            )}
            {ctx.curve.points.length > 1 && (
              <section>
                <Seccion
                  titulo={`${ctx.curve.points.length} temporadas`}
                  nota={ctx.curve.stat === "era" ? "EFE" : "OPS"}
                  titular={ctx.curve.headline}
                  sub={
                    ctx.role === "batting"
                      ? "Punto hueco: menos de 50 AP. Calificada: la que habría entrado en la tabla de líderes."
                      : "Más arriba, mejor. Punto hueco: menos de 10 entradas."
                  }
                />
                <CurvaCarrera curva={ctx.curve} equipoPorTemporada={equipoPorTemporada} />
              </section>
            )}
          </div>
        )}

        {perfil.teams.length > 0 && (
          <section>
            <Seccion
              titulo="Trayectoria"
              nota={`${perfil.teams.length} ${perfil.teams.length === 1 ? "equipo" : "equipos"}`}
            />
            <Trayectoria equipos={perfil.teams} />
          </section>
        )}

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
