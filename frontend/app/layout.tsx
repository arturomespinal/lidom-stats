import type { Metadata } from "next";
import { Archivo, Bebas_Neue } from "next/font/google";
import "./globals.css";

/**
 * Dos familias con papeles distintos.
 *
 * Archivo lleva el texto y —lo que más importa en una app de estadísticas—
 * los números: tiene cifras tabulares de verdad, que es lo que permite
 * comparar una columna de promedios de un vistazo.
 *
 * Bebas Neue lleva títulos, marcadores, códigos de equipo y estados. Viene
 * del kit de referencia del tema claro, y reemplazó a Barlow Condensed: es la
 * pieza que más carácter le da a la app. Condensada, así que "ESTRELLAS
 * ORIENTALES" cabe en 390 px y un código de tres letras en una teja de 32.
 *
 * Tiene UN solo peso y solo mayúsculas. Un `font-bold` encima haría que el
 * navegador sintetizara una negrita falsa; `font-synthesis: none` en
 * globals.css lo impide para toda la app.
 */
const archivo = Archivo({
  subsets: ["latin"],
  variable: "--font-archivo",
  display: "swap",
});

const bebas = Bebas_Neue({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-cond",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Deportiv",
  description: "Béisbol dominicano en números",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body
        className={`${archivo.variable} ${bebas.variable} font-sans bg-bg text-fg min-h-screen`}
      >
        {children}
      </body>
    </html>
  );
}
