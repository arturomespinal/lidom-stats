"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import PlayerSearch from "@/components/PlayerSearch";
import { etiquetaTemporada } from "@/lib/formato";

// "Hoy" es la portada, como la primera pestaña del móvil. Los marcadores en
// vivo (/live) se abren desde ahí cuando hay juegos en curso.
//
// `icono` es el trazo que lleva cada pestaña en la barra del pie del teléfono
// (viewBox 24, trazo 2, sin relleno): los mismos dibujos que la app móvil.
const TABS = [
  { label: "Hoy", href: "/", icono: "M4 7h16v13H4zM4 11h16M8 3v4M16 3v4" },
  { label: "Posiciones", href: "/posiciones", icono: "M5 20V10M12 20V4M19 20v-7" },
  { label: "Bateo", href: "/batting", icono: "M4 20l9-9M13 11l5-5a2 2 0 013 3l-5 5M6 18l-2 2" },
  { label: "Pitcheo", href: "/pitching", icono: "M12 21a9 9 0 100-18 9 9 0 000 18zM7 6c2 3 2 9 0 12M17 6c-2 3-2 9 0 12" },
  // Los récords de todos los tiempos (DIGIMETRICS desde 1951 + MLB API).
  { label: "Historia", href: "/historia", icono: "M12 7v5l3 2M3.5 12a8.5 8.5 0 102.6-6.1L3.5 8.5M3.5 4v4.5H8" },
];

interface Props {
  /**
   * La temporada que se está mirando, si la página tiene una (la elegida en
   * Posiciones, Bateo o Pitcheo, o la que vino en la URL). Viaja en los
   * enlaces de la barra para no perderla al cambiar de pestaña.
   *
   * Sin ella, los enlaces van SIN `?season=` y cada página abre en la
   * temporada en curso. Antes las páginas sin temporada propia (Hoy, En Vivo,
   * Historia, las fichas) mandaban una fija, "2025", y con la 2026-27 ya en
   * marcha tocar "Posiciones" desde la portada abría la tabla del año pasado
   * (11-nov-2026).
   */
  season?: string;
  /**
   * La barra de secciones del pie, en el teléfono. La página de un juego en
   * vivo la apaga: ahí el pie es de las pestañas del juego (Relato, Boxscore,
   * Alineación), y dos barras fijas una sobre otra se comerían la pantalla.
   */
  barraInferior?: boolean;
}

export default function Navbar({ season, barraInferior = true }: Props) {
  const pathname = usePathname();
  const consulta = season ? `?season=${season}` : "";
  const activa = (href: string) =>
    // Historia tiene páginas debajo (la ficha de un histórico): la pestaña
    // sigue marcada en ellas.
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  // Desde `sm`: pestañas de texto con subrayado, dentro de la barra de arriba.
  const pestanas = TABS.map((tab) => {
    const isActive = activa(tab.href);
    return (
      <Link
        key={tab.href}
        href={`${tab.href}${consulta}`}
        // whitespace-nowrap: sin esto una etiqueta de dos palabras se parte
        // en dos líneas y desalinea toda la barra en pantallas angostas.
        className={`flex items-center justify-center whitespace-nowrap px-3 text-sm font-medium transition-colors ${
          isActive
            ? "text-fg shadow-[inset_0_-2px_0_rgb(var(--accent))]"
            : "text-dim hover:text-fg"
        }`}
        aria-current={isActive ? "page" : undefined}
      >
        {tab.label}
      </Link>
    );
  });

  return (
    <>
      {/* Desde `sm`, una sola barra pegada arriba: logotipo, pestañas,
          buscador y temporada. En el teléfono esta fila lleva solo el
          logotipo y el buscador, y se va con el scroll. */}
      <header className="z-10 border-b border-line bg-bg sm:sticky sm:top-0">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-2 px-4">
          {/* Logotipo. El punto verde es la ÚNICA pieza de marca que entra a la
              interfaz, y va pegado al nombre — ver la nota en globals.css sobre
              por qué el verde de Deportiv no baja al contenido. */}
          <Link href={`/${consulta}`} className="mr-4 flex shrink-0 items-baseline gap-1.5">
            <span className="font-cond font-bold text-[26px] leading-none tracking-[0.06em] text-fg">DEPORTIV</span>
            <span className="h-1.5 w-1.5 self-center rounded-full bg-brand" aria-hidden="true" />
          </Link>

          {/* Pestañas con SUBRAYADO, como el kit de referencia, en vez de
              píldoras. Ocupan todo el alto de la barra para que la raya caiga
              sobre el borde inferior. */}
          <nav aria-label="Secciones" className="hidden h-full min-w-0 items-stretch gap-1 sm:flex">
            {pestanas}
          </nav>

          {/* Buscador y temporada. Con 2.253 nombres en la base no hay listado
              que sirva de índice: el buscador es la puerta a las fichas. */}
          <div className="ml-auto flex min-w-0 items-center gap-2 pl-2">
            <PlayerSearch />
            {season && (
              <span className="num hidden rounded bg-header px-2 py-1 text-xs text-dim sm:inline">
                {etiquetaTemporada(season)}
              </span>
            )}
          </div>
        </div>
      </header>

      {/* En el teléfono las secciones van en una barra fija al PIE, con
          icono y nombre, como la app: es donde llega el pulgar, y deja la
          parte de arriba para el contenido (look "Pizarra", 12-nov-2026).
          Antes eran una fila de texto pegada arriba. 64 px de alto, más el
          margen seguro de los teléfonos con gesto de inicio; el <body> reserva
          ese mismo espacio para que la barra no tape el final de la página
          (app/layout.tsx). */}
      {barraInferior && (
        <nav
          aria-label="Secciones"
          className="fixed inset-x-0 bottom-0 z-20 flex border-t border-line bg-bg pb-[env(safe-area-inset-bottom)] sm:hidden"
        >
          {TABS.map((tab) => {
            const isActive = activa(tab.href);
            return (
              <Link
                key={tab.href}
                href={`${tab.href}${consulta}`}
                className={`flex h-16 min-w-0 flex-1 flex-col items-center justify-center gap-1 transition-colors ${
                  isActive ? "text-fg" : "text-faint hover:text-fg"
                }`}
                aria-current={isActive ? "page" : undefined}
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-[22px] w-[22px]"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={isActive ? 2.4 : 2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d={tab.icono} />
                </svg>
                <span className={`text-[10px] tracking-[0.04em] ${isActive ? "font-bold" : "font-semibold"}`}>
                  {tab.label}
                </span>
              </Link>
            );
          })}
        </nav>
      )}
    </>
  );
}
