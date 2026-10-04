import Link from "next/link";
import type { Metadata } from "next";

import Navbar from "@/components/Navbar";
import EmptyState from "@/components/EmptyState";
import Seccion from "@/components/ficha/Seccion";
import Refresco from "@/components/hoy/Refresco";
import { Figuras, FranjaFechas, Proximos, TarjetaDestacado, TarjetaJuego } from "@/components/hoy/Jornada";
import { fetchDay } from "@/lib/api";
import { DEFAULT_SEASON } from "@/lib/constants";

export const metadata: Metadata = { title: "Hoy · Deportiv" };

// En Next 16 `searchParams` es una promesa. Ver CLAUDE.md.
interface Props {
  searchParams: Promise<{ season?: string; fecha?: string }>;
}

/**
 * La portada: lo que pasó (o pasa) hoy en LIDOM. Misma pantalla que la
 * primera pestaña del móvil (mobile/src/screens/HoyScreen.tsx).
 *
 * La fecha vive en la URL (`?fecha=YYYY-MM-DD`); sin ella, hoy en República
 * Dominicana. Fuera de temporada el servidor devuelve la última jornada y
 * `is_requested: false`, y la página lo dice en vez de llamarla "hoy".
 *
 * La tabla de posiciones, que era la portada, vive en /posiciones.
 */
export default async function HoyPage(props: Props) {
  const searchParams = await props.searchParams;
  const season = searchParams.season ?? DEFAULT_SEASON;
  const fecha = searchParams.fecha;
  const jornada = await fetchDay(fecha);

  if (!jornada) {
    return (
      <>
        <Navbar season={season} />
        <main className="mx-auto max-w-5xl px-4 py-8">
          <EmptyState />
        </main>
      </>
    );
  }

  const destacado = jornada.featured
    ? jornada.games.find((g) => g.game_id === jornada.featured!.game_id)
    : undefined;
  const resto = jornada.games.filter((g) => g !== destacado);
  const temporada = jornada.season_id ? ` de la temporada ${jornada.season_id}` : "";
  const nota = !jornada.is_requested
    ? `${fecha ? "No hubo juegos ese día." : "No hay juegos hoy."} ` +
      (jornada.next ? "Esta es la jornada anterior." : `Esta fue la última jornada${temporada}.`)
    : `${jornada.games.length} ${jornada.games.length === 1 ? "juego" : "juegos"}${
        jornada.season_id ? ` · temporada ${jornada.season_id}` : ""
      }`;
  const prox = jornada.next;
  const tituloProx = prox && prox.days_ahead === 1 && jornada.is_today ? "Mañana" : prox?.label;

  return (
    <>
      <Navbar season={season} />
      <FranjaFechas dias={jornada.strip} activa={jornada.date} />
      {jornada.poll_seconds && <Refresco segundos={jornada.poll_seconds} />}
      <main className="mx-auto max-w-5xl space-y-10 px-4 pb-10 pt-6">
        <header className="space-y-1">
          <div className="flex items-center justify-between gap-3">
            <h1 className="font-cond text-[40px] leading-none tracking-[0.01em] text-fg">
              {jornada.is_today ? "Hoy" : jornada.label}
            </h1>
            {/* Saltar a cualquier fecha: la franja solo camina de siete en siete. */}
            <Link
              href={`/calendario?temporada=${jornada.season_id ?? ""}&activa=${jornada.date}`}
              className="tocable inline-flex min-h-11 items-center gap-2 rounded-lg border border-line bg-card px-3 text-sm font-semibold text-fg hover:bg-raised"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="5" width="18" height="16" rx="2" />
                <path d="M3 10h18M8 3v4M16 3v4" />
              </svg>
              Calendario
            </Link>
          </div>
          <p className="text-sm text-dim">{nota}</p>
          {jornada.any_live && (
            <Link
              href="/live"
              className="tocable mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg border border-line bg-card px-4 text-sm font-semibold text-fg hover:bg-raised"
            >
              <span className="h-2 w-2 rounded-full bg-live" aria-hidden="true" />
              Marcadores en vivo ›
            </Link>
          )}
        </header>

        {/* El destacado y el resto, lado a lado en pantalla ancha. */}
        <div className="grid gap-10 lg:grid-cols-[3fr_2fr] lg:gap-6">
          {destacado && jornada.featured && (
            <TarjetaDestacado juego={destacado} destacado={jornada.featured} />
          )}
          {resto.length > 0 && (
            <section>
              <Seccion
                titulo={jornada.games.every((g) => g.status === "final") ? "Resultados" : "Juegos"}
                nota={`${resto.length} más`}
              />
              <div className="space-y-2">
                {resto.map((g) => (
                  <TarjetaJuego key={g.game_id} juego={g} />
                ))}
              </div>
            </section>
          )}
        </div>

        {jornada.figures.length > 0 && (
          <section>
            <Seccion
              titulo="Figuras de la jornada"
            />
            <Figuras figuras={jornada.figures} />
          </section>
        )}

        {prox && (
          <section className="max-w-xl">
            <Seccion titulo={tituloProx ?? prox.label} nota={tituloProx === "Mañana" ? prox.label : undefined} />
            <Proximos juegos={prox.games} />
          </section>
        )}
      </main>
    </>
  );
}
