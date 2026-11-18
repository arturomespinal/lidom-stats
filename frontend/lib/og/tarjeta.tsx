import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ReactNode } from "react";

import { TEAM_STYLES } from "@/lib/constants";

/**
 * Las tarjetas que salen al compartir un enlace (WhatsApp, X, iMessage): la
 * imagen de og:image, 1200×630, armada con `ImageResponse` (next/og) en cada
 * `opengraph-image.tsx`.
 *
 * Mismo look "Pizarra" que la página: fondo grafito, Barlow Condensed para
 * cifras y nombres, Archivo para el texto, tejas de club con su código
 * ESCRITO (el color no identifica a nadie solo) y el punto verde solo junto
 * al logotipo. Sin escudos ni fotos: como en toda la app.
 *
 * Siempre en oscuro, aunque quien comparte use el modo claro: la tarjeta se
 * ve en el chat de OTRA persona, y la pizarra oscura es la cara de la marca.
 *
 * Todo lo que importa va en la franja central (margen de 150 px a los lados):
 * WhatsApp en la computadora muestra la imagen recortada al centro.
 *
 * Las fuentes van en el repo (`lib/og/fuentes/`, licencia OFL al lado): el
 * generador de imágenes no lee woff2 ni las de next/font, y bajarlas de
 * Google en cada imagen sería lento y frágil.
 */

export const TAMANO = { width: 1200, height: 630 };
export const TIPO = "image/png";

// Los colores de la pizarra oscura (globals.css, :root). Aquí van en hex:
// la imagen no ve las variables CSS de la página.
export const C = {
  bg: "#0D1014",
  card: "#161A20",
  linea: "#2A313B",
  fg: "#F3F5F7",
  fg2: "#C9D0DA",
  dim: "#A7B0BD",
  marca: "#03DA58",
};

let cache: { name: string; data: Buffer; weight: 400 | 600 | 700; style: "normal" }[] | null = null;

/** Las cuatro fuentes, leídas una vez por proceso. */
export async function fuentes() {
  if (cache) return cache;
  const dir = join(process.cwd(), "lib/og/fuentes");
  const leer = (f: string) => readFile(join(dir, f));
  const [a400, a700, b600, b700] = await Promise.all([
    leer("archivo-latin-400-normal.woff"),
    leer("archivo-latin-700-normal.woff"),
    leer("barlow-condensed-latin-600-normal.woff"),
    leer("barlow-condensed-latin-700-normal.woff"),
  ]);
  cache = [
    { name: "Archivo", data: a400, weight: 400, style: "normal" },
    { name: "Archivo", data: a700, weight: 700, style: "normal" },
    { name: "Barlow", data: b600, weight: 600, style: "normal" },
    { name: "Barlow", data: b700, weight: 700, style: "normal" },
  ];
  return cache;
}

/** La teja de un club: su color con el código escrito encima. */
export function Teja({ code, lado = 96 }: { code: string; lado?: number }) {
  const st = TEAM_STYLES[code];
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: lado,
        height: lado,
        borderRadius: lado * 0.18,
        backgroundColor: st?.primary ?? C.linea,
        color: st?.on ?? C.fg,
        fontFamily: "Barlow",
        fontWeight: 700,
        fontSize: lado * 0.4,
        letterSpacing: 1,
      }}
    >
      {code}
    </div>
  );
}

/** Una cifra grande con su etiqueta debajo, como la fila de la cabecera. */
export function Cifra({ valor, etiqueta }: { valor: string; etiqueta: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
      <div style={{ fontFamily: "Barlow", fontWeight: 700, fontSize: 84, lineHeight: 1, color: C.fg }}>{valor}</div>
      <div style={{ fontSize: 24, color: C.dim, marginTop: 6, letterSpacing: 2, textTransform: "uppercase" }}>
        {etiqueta}
      </div>
    </div>
  );
}

/**
 * El marco común: el logotipo arriba a la izquierda, una etiqueta arriba a la
 * derecha ("LIDOM · 2026-27") y una franja del color del club a la izquierda,
 * si hay un club.
 */
export function Marco({
  etiqueta,
  color,
  children,
}: {
  etiqueta?: string;
  color?: string;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        backgroundColor: C.bg,
        fontFamily: "Archivo",
        color: C.fg,
      }}
    >
      {color && <div style={{ display: "flex", width: 14, height: "100%", backgroundColor: color }} />}
      {/* Margen de 150 px a los lados: WhatsApp en la computadora recorta la
          imagen al centro (unos 920 px de ancho) y lo que quede fuera no se
          ve. Antes el marcador iba pegado a la derecha y salía cortado
          (18-nov-2026). Todo lo que importa va dentro de esa franja. */}
      <div style={{ display: "flex", flexDirection: "column", flex: 1, padding: "52px 150px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <div style={{ fontFamily: "Barlow", fontWeight: 700, fontSize: 44, letterSpacing: 4 }}>DEPORTIV</div>
            <div style={{ display: "flex", width: 12, height: 12, borderRadius: 6, backgroundColor: C.marca, marginLeft: 12 }} />
          </div>
          {etiqueta && <div style={{ fontSize: 26, color: C.dim, letterSpacing: 2, textTransform: "uppercase" }}>{etiqueta}</div>}
        </div>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center" }}>{children}</div>
      </div>
    </div>
  );
}

/** Corta un texto largo para que quepa en una línea de la tarjeta. */
export function corto(texto: string, max: number): string {
  return texto.length > max ? `${texto.slice(0, max - 1).trimEnd()}…` : texto;
}
