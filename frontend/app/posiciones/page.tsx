import { fetchSeasons, fetchStandings } from "@/lib/api";
import { etiquetaTemporada } from "@/lib/formato";
import { DEFAULT_SEASON } from "@/lib/constants";
import Navbar from "@/components/Navbar";
import StandingsTable from "@/components/StandingsTable";
import EmptyState from "@/components/EmptyState";
import SelectorTemporada from "@/components/SelectorTemporada";

interface Props {
  searchParams: Promise<{ season?: string }>;
}

export default async function PosicionesPage(props: Props) {
  const searchParams = await props.searchParams;
  // Sin `?season=` manda la más reciente que tenga la API; DEFAULT_SEASON
  // queda de respaldo por si /seasons no responde.
  const temporadas = await fetchSeasons();
  const season = searchParams.season ?? temporadas[0] ?? DEFAULT_SEASON;
  const standings = await fetchStandings(season);

  return (
    <>
      <Navbar season={season} />
      <SelectorTemporada ruta="/posiciones" temporadas={temporadas} activa={season} />
      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-5">
          <h1 className="font-cond text-[30px] leading-none tracking-[0.01em] text-fg">Tabla de Posiciones</h1>
          <span className="shrink-0 whitespace-nowrap text-xs text-dim">Temporada regular · {etiquetaTemporada(season)}</span>
        </div>

        {standings.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <StandingsTable data={standings} season={season} />
            {/* Una columna nueva sin explicación es una columna que nadie usa. */}
            <p className="mt-3 text-xs leading-relaxed text-dim">
              <span className="font-bold text-fg">GB</span> — juegos de
              atraso contra el líder.{" "}
              <span className="font-bold text-fg">CLAS</span> — juegos de
              ventaja sobre el primer equipo fuera, o de atraso contra el último
              clasificado al round robin.
            </p>
          </>
        )}
      </main>
    </>
  );
}
