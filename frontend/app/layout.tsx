import type { Metadata } from "next";
import { Archivo, Barlow_Condensed } from "next/font/google";
import "./globals.css";

/**
 * Dos familias con papeles distintos.
 *
 * Archivo lleva el texto y —lo que más importa en una app de estadísticas—
 * los números: tiene cifras tabulares de verdad, que es lo que permite
 * comparar una columna de promedios de un vistazo.
 *
 * Barlow Condensed lleva los códigos de equipo y las micro-etiquetas en
 * versalitas. Condensada porque "ESTRELLAS ORIENTALES" en mayúsculas tiene que
 * caber en 390 px, y porque un código de tres letras en una teja de 32 px
 * necesita ancho estrecho para no salirse.
 */
const archivo = Archivo({
  subsets: ["latin"],
  variable: "--font-archivo",
  display: "swap",
});

const barlow = Barlow_Condensed({
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
        className={`${archivo.variable} ${barlow.variable} font-sans bg-bg text-fg min-h-screen`}
      >
        {children}
      </body>
    </html>
  );
}
