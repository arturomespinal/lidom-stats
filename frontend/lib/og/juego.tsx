import { C, Marco, Teja, corto } from "@/lib/og/tarjeta";

export interface LadoTarjeta {
  code: string;
  name: string;
  /** null antes del primer lanzamiento: 0-0 a las 5 de la tarde sería mentira. */
  runs: number | null;
}

/**
 * La tarjeta de un juego: visitante arriba y local abajo, como el marcador
 * de la página; el que va ganando (o ganó) en blanco y el otro en gris. Abajo
 * el estado ("FINAL", "EN VIVO · Baja del 7mo", "HOY · 7:30 p. m.") y, si
 * el servidor lo escribió, el titular.
 */
export function TarjetaJuego({
  away,
  home,
  estado,
  titular,
  temporada,
}: {
  away: LadoTarjeta;
  home: LadoTarjeta;
  estado: string;
  titular?: string | null;
  temporada?: string | null;
}) {
  const hayCarreras = away.runs != null && home.runs != null;
  const adelante = hayCarreras && away.runs !== home.runs ? (away.runs! > home.runs! ? "away" : "home") : null;
  const fila = (l: LadoTarjeta, lado: "away" | "home") => {
    const atenuado = adelante !== null && adelante !== lado;
    return (
      <div style={{ display: "flex", alignItems: "center", height: 120 }}>
        <Teja code={l.code} lado={92} />
        <div
          style={{
            display: "flex",
            flex: 1,
            marginLeft: 32,
            fontFamily: "Barlow",
            fontWeight: 600,
            fontSize: 64,
            color: atenuado ? C.dim : C.fg,
          }}
        >
          {corto(l.name, 24)}
        </div>
        {hayCarreras && (
          <div
            style={{
              fontFamily: "Barlow",
              fontWeight: 700,
              fontSize: 112,
              lineHeight: 1,
              color: atenuado ? C.dim : C.fg,
            }}
          >
            {String(l.runs)}
          </div>
        )}
      </div>
    );
  };

  return (
    <Marco etiqueta={temporada ? `LIDOM · ${temporada}` : "LIDOM"}>
      {fila(away, "away")}
      <div style={{ display: "flex", height: 2, backgroundColor: C.linea, margin: "6px 0" }} />
      {fila(home, "home")}
      <div style={{ display: "flex", marginTop: 26, fontSize: 30, letterSpacing: 2, color: C.fg, fontWeight: 700 }}>
        {estado.toUpperCase()}
      </div>
      {titular && (
        <div style={{ display: "flex", marginTop: 10, fontSize: 30, color: C.fg2, lineHeight: 1.3 }}>
          {corto(titular, 95)}
        </div>
      )}
    </Marco>
  );
}
