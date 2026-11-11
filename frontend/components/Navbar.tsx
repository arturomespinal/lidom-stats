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
}

export default function Navbar({ season }: Props) {
  const pathname = usePathname();
  const consulta = season ? `?season=${season}` : "";

  // Las pestañas se pintan en dos sitios (ver abajo); una sola definición.
  const pestanas = (clase: string) =>
    TABS.map((tab) => {
      // Historia tiene páginas debajo (la ficha de un histórico): la
      // pestaña sigue marcada en ellas.
      const isActive =
        tab.href === "/" ? pathname === "/" : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
      return (
        <Link
          key={tab.href}
          href={`${tab.href}${consulta}`}
          // whitespace-nowrap: sin esto una etiqueta de dos palabras se parte
          // en dos líneas y desalinea toda la barra en pantallas angostas.
          className={`flex items-center justify-center whitespace-nowrap text-sm font-medium transition-colors ${clase} ${
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
      <header className="z-10 border-b border-line bg-card sm:sticky sm:top-0">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-2 px-4">
          {/* Logotipo. El punto verde es la ÚNICA pieza de marca que entra a la
              interfaz, y va pegado al nombre — ver la nota en globals.css sobre
              por qué el verde de Deportiv no baja al contenido. */}
          <Link href={`/${consulta}`} className="mr-4 flex shrink-0 items-baseline gap-1.5">
            <span className="font-cond text-[26px] leading-none tracking-[0.02em] text-fg">DEPORTIV</span>
            <span className="h-1.5 w-1.5 self-center rounded-full bg-brand" aria-hidden="true" />
          </Link>

          {/* Pestañas con SUBRAYADO, como el kit de referencia, en vez de
              píldoras. Ocupan todo el alto de la barra para que la raya caiga
              sobre el borde inferior. */}
          <nav aria-label="Secciones" className="hidden h-full min-w-0 items-stretch gap-1 sm:flex">
            {pestanas("px-3")}
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

      {/* En el teléfono las pestañas van en su propia fila, pegada arriba, y
          se reparten el ancho: las cinco a la vista. Antes compartían fila con
          el logotipo y el buscador y a 390 px solo se veía "Hoy"; las otras
          cuatro quedaban detrás de un scroll que nada anunciaba, y la pestaña
          en la que uno estaba ni se veía marcada (11-nov-2026). 44 px de
          alto: el mínimo para el pulgar. */}
      <nav aria-label="Secciones" className="sticky top-0 z-10 flex h-11 border-b border-line bg-card px-2 sm:hidden">
        {pestanas("flex-1 px-1")}
      </nav>
    </>
  );
}
