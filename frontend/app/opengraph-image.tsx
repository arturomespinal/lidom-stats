import { ImageResponse } from "next/og";

import { C, Marco, TAMANO, TIPO, Teja, fuentes } from "@/lib/og/tarjeta";

// La tarjeta por defecto: la heredan las páginas sin una propia (Hoy,
// Posiciones, Bateo, Pitcheo, Historia…). Ver lib/og/tarjeta.tsx.
export const size = TAMANO;
export const contentType = TIPO;
export const alt = "Deportiv: béisbol dominicano en números";

export default async function Imagen() {
  return new ImageResponse(
    (
      <Marco etiqueta="LIDOM">
        <div style={{ fontFamily: "Barlow", fontWeight: 700, fontSize: 132, lineHeight: 1, color: C.fg }}>
          Béisbol dominicano
        </div>
        <div style={{ fontFamily: "Barlow", fontWeight: 700, fontSize: 132, lineHeight: 1, color: C.dim }}>
          en números
        </div>
        <div style={{ display: "flex", marginTop: 48, gap: 18 }}>
          {["AGU", "EST", "ESC", "GIG", "LIC", "TOR"].map((c) => (
            <Teja key={c} code={c} lado={72} />
          ))}
        </div>
      </Marco>
    ),
    { ...TAMANO, fonts: await fuentes() }
  );
}
