import { notFound } from "next/navigation";
import type { Metadata } from "next";

import Navbar from "@/components/Navbar";
import Seccion from "@/components/ficha/Seccion";
import BoxScore from "@/components/game/BoxScore";
import { Figuras, TarjetaDestacado } from "@/components/hoy/Jornada";
import { fetchGame } from "@/lib/api";
import { DEFAULT_SEASON } from "@/lib/constants";

// En Next 16 `params` es una promesa. Ver CLAUDE.md.
interface Props {
  params: Promise<{ gameId: string }>;
  searchParams: Promise<{ season?: string }>;
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { gameId } = await props.params;
  const j = await fetchGame(gameId);
  if (!j) return { title: "Juego no encontrado · Deportiv" };
  const g = j.game;
  return {
    title: `${g.away.short_name} ${g.away.runs ?? ""}–${g.home.runs ?? ""} ${g.home.short_name} · ${j.label} · Deportiv`,
  };
}

/**
 * Un juego terminado, armado desde la base (GET /games/{id}/detail). Misma
 * pantalla que mobile/src/screens/JuegoScreen.tsx.
 *
 * Es la puerta a los juegos que el motor en vivo no siguió —casi toda la
 * historia—. Trae marcador, decisiones, titular, figuras y el boxscore, con
 * el mismo componente del detalle en vivo. Lo que la base no guarda
 * (errores, línea por entradas, relato) se dice, no se inventa. Si la caché
 * tiene el juego, la franja navy lleva al detalle completo en /live.
 */
export default async function JuegoPage(props: Props) {
  const { gameId } = await props.params;
  const searchParams = await props.searchParams;
  const season = searchParams.season ?? DEFAULT_SEASON;
  const juego = await fetchGame(gameId);
  if (!juego) notFound();

  const g = juego.game;
  const enVivo = g.has_detail && g.game_pk ? `/live/${g.game_pk}` : null;

  return (
    <>
      <Navbar season={season} />
      <main className="mx-auto max-w-5xl space-y-10 px-4 pb-10 pt-6">
        <div className="max-w-2xl">
          <TarjetaDestacado
            juego={g}
            destacado={{ headline: juego.headline, win_prob: juego.win_prob }}
            etiqueta={`${juego.label}${g.season_id ? ` · ${g.season_id}` : ""}`}
            href={enVivo}
            accion="Relato y línea ›"
          />
        </div>

        {juego.figures.length > 0 && (
          <section>
            <Seccion titulo="Figuras del juego" />
            <Figuras figuras={juego.figures} />
          </section>
        )}

        <section>
          <Seccion
            titulo="Boxscore"
            sub={
              juego.boxscore_available
                ? "Sin errores ni línea por entradas: la base guarda lo que hizo cada jugador, y eso solo existe para los juegos seguidos en vivo."
                : undefined
            }
          />
          {juego.boxscore_available ? (
            <BoxScore home={juego.home} away={juego.away} temporada={g.season_id} />
          ) : (
            <p className="rounded-xl border border-line bg-card px-4 py-8 text-center text-sm text-dim">
              Este juego está en el calendario pero no tiene boxscore: se perdió por forfeit, se pospuso o todavía no
              se ha procesado.
            </p>
          )}
        </section>
      </main>
    </>
  );
}
