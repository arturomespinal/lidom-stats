import { ImageResponse } from "next/og";

import { fetchEnfrentamiento, fetchSeasons } from "@/lib/api";
import { TEAM_FULL_NAMES, TEAM_SHORT_NAMES, TEAM_STYLES } from "@/lib/constants";
import { TarjetaJuego } from "@/lib/og/juego";
import { TAMANO, TIPO, fuentes } from "@/lib/og/tarjeta";
import ImagenPorDefecto from "@/app/opengraph-image";

export const size = TAMANO;
export const contentType = TIPO;
export const alt = "La serie entre dos equipos";

/**
 * La tarjeta de un enfrentamiento: la serie de la temporada EN CURSO, con la
 * misma forma que la de un juego (teja, ganados, nombre). La imagen no ve el
 * `?season=` de la página, así que la temporada va escrita en la tarjeta.
 */
/** "De local 1-2 · de visita 2-0": lo que el marcador grande no dice. */
function split(h: NonNullable<Awaited<ReturnType<typeof fetchEnfrentamiento>>>): string {
  const r = (lado: "home" | "away") => {
    const s = h.split[lado];
    return s ? `${s.wins}-${s.games_played - s.wins}` : "0-0";
  };
  return `${TEAM_SHORT_NAMES[h.team] ?? h.team}: de local ${r("home")} · de visita ${r("away")}`;
}

export default async function Imagen({ params }: { params: Promise<{ code: string; rival: string }> }) {
  const p = await params;
  const equipo = p.code.toUpperCase();
  const otro = p.rival.toUpperCase();
  const temporada = (await fetchSeasons())[0];
  const h2h =
    TEAM_STYLES[equipo] && TEAM_STYLES[otro] && equipo !== otro && temporada
      ? await fetchEnfrentamiento(equipo, otro, temporada)
      : null;
  if (!h2h) return ImagenPorDefecto();
  return new ImageResponse(
    (
      <TarjetaJuego
        away={{ code: equipo, name: TEAM_FULL_NAMES[equipo], runs: h2h.summary.wins }}
        home={{ code: otro, name: TEAM_FULL_NAMES[otro], runs: h2h.summary.losses }}
        estado={`Serie ${h2h.season_id ?? ""} · ${h2h.count} juegos`}
        titular={split(h2h)}
        temporada={h2h.season_id}
      />
    ),
    { ...TAMANO, fonts: await fuentes() }
  );
}
