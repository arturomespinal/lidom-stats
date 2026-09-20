"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import PlayerSearch from "@/components/PlayerSearch";

const TABS = [
  { label: "En Vivo", href: "/live" },
  { label: "Posiciones", href: "/" },
  { label: "Bateo", href: "/batting" },
  { label: "Pitcheo", href: "/pitching" },
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
          <span className="font-cond text-xl font-bold tracking-[0.015em] text-fg">
            DEPORTIV
          </span>
          <span
            className="w-1.5 h-1.5 rounded-full bg-brand self-center"
            aria-hidden="true"
          />
        </Link>

        {/* Tabs. min-w-0 + overflow-x-auto: en pantalla angosta las pestañas
            se desplazan dentro de su propia franja en vez de empujar la
            temporada fuera de la barra. */}
        <div className="flex min-w-0 items-center gap-1 overflow-x-auto">
          {TABS.map((tab) => {
            const isActive = pathname === tab.href;
            return (
              <Link
                key={tab.href}
                href={`${tab.href}?season=${season}`}
                // whitespace-nowrap: sin esto "En Vivo" se parte en dos líneas
                // y desalinea toda la barra en pantallas angostas.
                className={`whitespace-nowrap rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-header text-white"
                    : "text-dim hover:text-white hover:bg-header"
                }`}
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
          <span className="hidden rounded bg-header px-2 py-1 text-xs text-dim sm:inline">
            {season}
          </span>
        </div>
      </div>
    </nav>
  );
}
