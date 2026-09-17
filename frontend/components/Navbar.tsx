"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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
    <nav className="sticky top-0 z-10 bg-[#161b22] border-b border-[#30363d]">
      <div className="max-w-5xl mx-auto px-4 flex items-center gap-2 h-14">
        {/* Logo */}
        <Link href={`/?season=${season}`} className="flex items-center gap-2 mr-4">
          <span className="text-xl">⚾</span>
          <span className="font-bold text-white tracking-tight hidden sm:block">
            LIDOM Stats
          </span>
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
                    ? "bg-[#21262d] text-white"
                    : "text-[#8b949e] hover:text-white hover:bg-[#21262d]"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>

        {/* Season label */}
        <div className="ml-auto shrink-0 pl-2">
          <span className="text-xs text-[#8b949e] bg-[#21262d] px-2 py-1 rounded">
            {season}
          </span>
        </div>
      </div>
    </nav>
  );
}
