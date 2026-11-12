import type { Metadata } from "next";
import { Archivo, Barlow_Condensed } from "next/font/google";
import "./globals.css";

/**
 * Dos familias con papeles distintos.
 *
 * Archivo lleva el texto y —lo que más importa en una app de estadísticas—
 * los números de las tablas: tiene cifras tabulares de verdad, que es lo que
 * permite comparar una columna de promedios de un vistazo.
 *
 * Barlow Condensed lleva títulos, marcadores, códigos de equipo y estados. Es
 * la letra del look "Pizarra" (12-nov-2026): la de una pizarra de estadio,
 * con pesos de verdad —500, 600 y 700— y cifras tabulares. Reemplaza a Bebas
 * Neue, que sigue en `main`. Condensada, así que "ESTRELLAS ORIENTALES" cabe
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
        // El relleno de abajo, solo en el teléfono, es el alto de la barra
        // de secciones fija al pie (components/Navbar.tsx).
        className={`${archivo.variable} ${cond.variable} font-sans bg-bg text-fg min-h-screen pb-[calc(4rem+env(safe-area-inset-bottom))] sm:pb-0`}
      >
        {children}
      </body>
    </html>
  );
}
