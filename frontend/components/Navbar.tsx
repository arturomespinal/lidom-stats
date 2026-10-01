"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import PlayerSearch from "@/components/PlayerSearch";
import { etiquetaTemporada } from "@/lib/formato";

// "Hoy" es la portada, como la primera pestaña del móvil. Los marcadores en
// vivo (/live) se abren desde ahí cuando hay juegos en curso.
const TABS = [
  { label: "Hoy", href: "/" },
  { label: "Posiciones", href: "/posiciones" },
  { label: "Bateo", href: "/batting" },
  { label: "Pitcheo", href: "/pitching" },
  // Los récords de todos los tiempos (DIGIMETRICS desde 1951 + MLB API).
  { label: "Historia", href: "/historia" },
];

interface Props {
  season: string;
}

export default function Navbar({ season }: Props) {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-10 bg-card border-b border-line">
      <div className="max-w-5xl mx-auto px-4 flex items-center gap-2 h-14">
        {/* Logotipo. El punto verde es la ÚNICA pieza de marca que entra a la
            interfaz, y va pegado al nombre — ver la nota en globals.css sobre
            por qué el verde de Deportiv no baja al contenido. */}
        <Link
          href={`/?season=${season}`}
          className="flex items-baseline gap-1.5 mr-4 shrink-0"
        >
          <span className="font-cond text-[26px] leading-none tracking-[0.02em] text-fg">
            DEPORTIV
          </span>
          <span
            className="w-1.5 h-1.5 rounded-full bg-brand self-center"
            aria-hidden="true"
          />
        </Link>

        {/* Pestañas con SUBRAYADO, como el kit de referencia, en vez de
            píldoras. Ocupan todo el alto de la barra para que la raya caiga
            sobre el borde inferior. min-w-0 + overflow-x-auto: en pantalla
            angosta se desplazan dentro de su franja en vez de empujar la
            temporada fuera de la barra. */}
        <div className="flex h-full min-w-0 items-stretch gap-1 overflow-x-auto">
          {TABS.map((tab) => {
            // Historia tiene páginas debajo (la ficha de un histórico): la
            // pestaña sigue marcada en ellas.
            const isActive =
              tab.href === "/" ? pathname === "/" : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
            return (
              <Link
                key={tab.href}
                href={`${tab.href}?season=${season}`}
                // whitespace-nowrap: sin esto "En Vivo" se parte en dos líneas
                // y desalinea toda la barra en pantallas angostas.
                className={`flex items-center whitespace-nowrap px-3 text-sm font-medium transition-colors ${
                  isActive
                    ? "text-fg shadow-[inset_0_-2px_0_rgb(var(--accent))]"
                    : "text-dim hover:text-fg"
                }`}
                aria-current={isActive ? "page" : undefined}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>

        {/* Buscador y temporada. El buscador es la única puerta a las fichas
            de jugador: con 2.253 nombres en la base no hay listado que sirva
            de índice. */}
        <div className="ml-auto flex shrink-0 items-center gap-2 pl-2">
          <PlayerSearch />
          <span className="num hidden rounded bg-header px-2 py-1 text-xs text-dim sm:inline">
            {etiquetaTemporada(season)}
          </span>
        </div>
      </div>
    </nav>
  );
}
