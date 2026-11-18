import { ImageResponse } from "next/og";

import { fetchSeasons, fetchTeamProfile } from "@/lib/api";
import { TEAM_STYLES } from "@/lib/constants";
import { pct3 } from "@/lib/formato";
import { C, Cifra, Marco, TAMANO, TIPO, Teja, fuentes } from "@/lib/og/tarjeta";
import ImagenPorDefecto from "@/app/opengraph-image";

export const size = TAMANO;
export const contentType = TIPO;
export const alt = "Ficha del equipo";

/** La tarjeta de un equipo: su récord y su puesto en la temporada en curso. */
export default async function Imagen({ params }: { params: Promise<{ code: string }> }) {
  const code = (await params).code.toUpperCase();
  const temporada = (await fetchSeasons())[0];
  const e = temporada && TEAM_STYLES[code] ? await fetchTeamProfile(code, temporada) : null;
  if (!e) return ImagenPorDefecto();
  const actual = e.history.find((f) => f.season_id === e.season_id);
  return new ImageResponse(
    (
      <Marco etiqueta={`LIDOM · ${e.season_id}`} color={TEAM_STYLES[code].primary}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <Teja code={code} lado={120} />
          <div style={{ display: "flex", marginLeft: 36, fontFamily: "Barlow", fontWeight: 700, fontSize: 96, lineHeight: 1 }}>
            {e.team_name}
          </div>
        </div>
        {actual && (
          <div style={{ display: "flex", gap: 72, marginTop: 52 }}>
            <Cifra valor={`${actual.wins}-${actual.losses}`} etiqueta="G-P" />
            <Cifra valor={pct3(actual.win_pct)} etiqueta="PCT" />
            {e.standing && <Cifra valor={e.standing.label.split(" · ")[0]} etiqueta="Puesto" />}
          </div>
        )}
        {e.standing?.label.includes(" · ") && (
          <div style={{ display: "flex", marginTop: 20, fontSize: 30, color: C.fg2 }}>
            {e.standing.label.split(" · ").slice(1).join(" · ")}
          </div>
        )}
      </Marco>
    ),
    { ...TAMANO, fonts: await fuentes() }
  );
}
