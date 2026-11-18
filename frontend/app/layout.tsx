import type { Metadata } from "next";
import { Archivo, Barlow_Condensed } from "next/font/google";
import "./globals.css";
import { compartir, urlDelSitio } from "@/lib/metadata";
import { SCRIPT_TEMA } from "@/lib/tema";

/**
 * Dos familias con papeles distintos.
 *
 * Archivo lleva el texto y —lo que más importa en una app de estadísticas—
 * los números de las tablas: tiene cifras tabulares de verdad, que es lo que
 * permite comparar una columna de promedios de un vistazo.
 *
 * Barlow Condensed lleva títulos, marcadores, códigos de equipo y estados. Es
 * la letra del look "Pizarra" (12-nov-2026): la de una pizarra de estadio,
 * con pesos de verdad —500, 600 y 700— y cifras tabulares. Reemplazó a Bebas
 * Neue (16-nov-2026). Condensada, así que "ESTRELLAS ORIENTALES" cabe
 * en 390 px y un código de tres letras en una teja de 32.
 *
 * Va siempre en mayúsculas (`.font-cond` en globals.css).
 */
const archivo = Archivo({
  subsets: ["latin"],
  variable: "--font-archivo",
  display: "swap",
});

const cond = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-cond",
  display: "swap",
});

export const metadata: Metadata = {
  // Con URL base, las imágenes de las tarjetas para compartir salen con
  // dirección completa (lib/metadata.ts, app/**/opengraph-image.tsx).
  metadataBase: urlDelSitio(),
  ...compartir("Deportiv", "Béisbol dominicano en números: marcadores en vivo, posiciones y las fichas de LIDOM."),
  title: "Deportiv",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // suppressHydrationWarning: el script del <head> pone data-tema en <html>
    // antes de hidratar, y React vería un atributo que el servidor no mandó.
    <html lang="es" suppressHydrationWarning>
      <head>
        {/* El modo claro, si la persona lo eligió, antes de pintar (lib/tema.ts).
            El único dangerouslySetInnerHTML de la web: una constante nuestra. */}
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
      </head>
      <body
        // El relleno de abajo, solo en el teléfono, es el alto de la barra
        // de secciones fija al pie (components/Navbar.tsx).
        className={`${archivo.variable} ${cond.variable} font-sans bg-bg text-fg min-h-screen pb-[calc(4rem+env(safe-area-inset-bottom))] sm:pb-0`}
      >
        {children}
      </body>
    </html>
  );
}
