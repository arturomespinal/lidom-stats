import { ImageResponse } from "next/og";

import { fetchLiveGame } from "@/lib/api";
import { etiquetaTemporada } from "@/lib/formato";
import { TarjetaJuego } from "@/lib/og/juego";
import { TAMANO, TIPO, fuentes } from "@/lib/og/tarjeta";
import ImagenPorDefecto from "@/app/opengraph-image";

export const size = TAMANO;
export const contentType = TIPO;
export const alt = "Marcador del juego en vivo";

/**
 * La tarjeta de un juego al compartir /live/{gamePk}: el marcador en el
 * momento de compartir. Si el motor en vivo ya no lo sigue, la de Deportiv.
 */
export default async function Imagen({ params }: { params: Promise<{ gamePk: string }> }) {
  const pk = Number((await params).gamePk);
  const g = Number.isInteger(pk) && pk > 0 ? await fetchLiveGame(pk) : null;
  if (!g) return ImagenPorDefecto();
  const enJuego = g.status === "live" || g.status === "final";
  const entrada =
    g.inning_ordinal_es && g.is_top_inning != null
      ? `${g.is_top_inning ? "Alta" : "Baja"} del ${g.inning_ordinal_es}`
      : g.detailed_status;
  const estado =
    g.status === "live"
      ? `En vivo · ${entrada}`
      : g.status === "final"
        ? (g.inning ?? 9) > g.scheduled_innings
          ? `Final (${g.inning})`
          : "Final"
        : g.detailed_status;
  return new ImageResponse(
    (
      <TarjetaJuego
        away={{ code: g.away.team_code, name: g.away.team_name, runs: enJuego ? g.away.runs : null }}
        home={{ code: g.home.team_code, name: g.home.team_name, runs: enJuego ? g.home.runs : null }}
        estado={estado}
        temporada={g.season ? etiquetaTemporada(g.season) : null}
      />
    ),
    { ...TAMANO, fonts: await fuentes() }
  );
}
