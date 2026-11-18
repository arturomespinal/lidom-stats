import { ImageResponse } from "next/og";

import { fetchGame } from "@/lib/api";
import { TarjetaJuego } from "@/lib/og/juego";
import { TAMANO, TIPO, fuentes } from "@/lib/og/tarjeta";
import ImagenPorDefecto from "@/app/opengraph-image";

export const size = TAMANO;
export const contentType = TIPO;
export const alt = "Marcador del juego";

/**
 * La tarjeta de un juego al compartir /juegos/{id}: el marcador, el estado y
 * el titular del servidor. WhatsApp guarda la imagen la primera vez que ve el
 * enlace: un juego compartido en vivo seguirá mostrando aquel marcador.
 */
export default async function Imagen({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;
  const j = await fetchGame(gameId);
  if (!j) return ImagenPorDefecto();
  const g = j.game;
  const estado =
    g.status === "final"
      ? `${g.status_label} · ${j.label}`
      : g.status === "live"
        ? `En vivo · ${g.status_label}`
        : `${j.label} · ${g.status_label}`;
  return new ImageResponse(
    (
      <TarjetaJuego
        away={{ code: g.away.code, name: g.away.name, runs: g.away.runs }}
        home={{ code: g.home.code, name: g.home.name, runs: g.home.runs }}
        estado={estado}
        titular={j.headline}
        temporada={g.season_id}
      />
    ),
    { ...TAMANO, fonts: await fuentes() }
  );
}
