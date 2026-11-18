import { ImageResponse } from "next/og";

import { fetchPlayerProfile } from "@/lib/api";
import { TEAM_STYLES } from "@/lib/constants";
import { entradas, num, pct3 } from "@/lib/formato";
import { C, Cifra, Marco, TAMANO, TIPO, Teja, corto, fuentes } from "@/lib/og/tarjeta";
import ImagenPorDefecto from "@/app/opengraph-image";

export const size = TAMANO;
export const contentType = TIPO;
export const alt = "Ficha del jugador";

/**
 * La tarjeta de un jugador: su nombre, su equipo y las cifras de la cabecera
 * de su ficha (la última temporada con volumen, equipos sumados: lo compone
 * el servidor en `context.latest`, no se suman aquí).
 */
export default async function Imagen({ params }: { params: Promise<{ playerId: string }> }) {
  const perfil = await fetchPlayerProfile((await params).playerId);
  if (!perfil) return ImagenPorDefecto();
  const ctx = perfil.context;
  const equipo = ctx?.latest.team_code ?? perfil.batting[0]?.team_code ?? perfil.pitching[0]?.team_code ?? null;
  const n = (k: string) => {
    const v = ctx?.latest[k];
    return typeof v === "number" ? v : null;
  };
  const cifras =
    ctx?.role === "pitching"
      ? [
          { valor: num(n("era"), 2), etiqueta: "EFE" },
          { valor: `${num(n("wins"))}-${num(n("losses"))}`, etiqueta: "G-P" },
          { valor: num(n("so")), etiqueta: "K" },
          { valor: entradas(n("innings_pitched")), etiqueta: "IP" },
        ]
      : ctx
        ? [
            { valor: pct3(n("avg")), etiqueta: "AVG" },
            { valor: num(n("hr")), etiqueta: "HR" },
            { valor: num(n("rbi")), etiqueta: "CI" },
            { valor: pct3(n("ops")), etiqueta: "OPS" },
          ]
        : [];
  return new ImageResponse(
    (
      <Marco etiqueta={ctx ? `LIDOM · ${ctx.latest.season_id}` : "LIDOM"} color={equipo ? TEAM_STYLES[equipo]?.primary : undefined}>
        <div style={{ display: "flex", alignItems: "center" }}>
          {equipo && <Teja code={equipo} lado={64} />}
          <div style={{ display: "flex", marginLeft: equipo ? 20 : 0, fontSize: 28, color: C.dim, letterSpacing: 2 }}>
            {ctx?.role === "pitching" ? "LANZADOR" : "BATEADOR"}
          </div>
        </div>
        <div style={{ display: "flex", fontFamily: "Barlow", fontWeight: 700, fontSize: 96, lineHeight: 1.05, marginTop: 18 }}>
          {corto(perfil.player.full_name, 20)}
        </div>
        {cifras.length > 0 && (
          <div style={{ display: "flex", gap: 52, marginTop: 36 }}>
            {cifras.map((c) => (
              <Cifra key={c.etiqueta} valor={c.valor} etiqueta={c.etiqueta} />
            ))}
          </div>
        )}
      </Marco>
    ),
    { ...TAMANO, fonts: await fuentes() }
  );
}
