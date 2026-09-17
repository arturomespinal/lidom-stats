import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "LIDOM Stats",
  description: "Estadísticas de la Liga de Béisbol Profesional Dominicana",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className={`${inter.className} bg-[#0d1117] text-[#f0f6fc] min-h-screen`}>
        {children}
      </body>
    </html>
  );
}
