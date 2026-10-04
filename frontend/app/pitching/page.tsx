import { fetchSeasons, fetchPitching } from "@/lib/api";
import { etiquetaTemporada } from "@/lib/formato";
import { DEFAULT_SEASON } from "@/lib/constants";
import Navbar from "@/components/Navbar";
import PitchingTable from "@/components/PitchingTable";
import EmptyState from "@/components/EmptyState";
import SelectorTemporada from "@/components/SelectorTemporada";

interface Props {
  searchParams: Promise<{ season?: string; team?: string; min_ip?: string }>;
}

export default async function PitchingPage(props: Props) {
  const searchParams = await props.searchParams;
  // Sin `?season=` manda la más reciente que tenga la API.
  const temporadas = await fetchSeasons();
  const season = searchParams.season ?? temporadas[0] ?? DEFAULT_SEASON;
  const team = searchParams.team;
  // `?? "0"` convertía "el usuario no pidió mínimo" en "mínimo cero", y un
  // min explícito MANDA sobre el que calcula la API. Por eso esta tabla seguía
  // encabezada por efectividades de 0.00 en un tercio de entrada aunque /pitching ya calificaba.
  // undefined = que decida la API.
  const min_ip = searchParams.min_ip ? parseFloat(searchParams.min_ip) : undefined;

  const pitching = await fetchPitching(season, { team, min_ip, limit: 100 });

  return (
    <>
      <Navbar season={season} />
      {/* El filtro de equipo se conserva al cambiar de año; el mínimo no: un
          mínimo de 2025 no tiene sentido en la temporada corta de 2020. */}
      <SelectorTemporada ruta="/pitching" temporadas={temporadas} activa={season} conservar={{ team }} />
      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="font-cond text-[30px] leading-none tracking-[0.01em] text-fg">Líderes de Pitcheo</h1>
            <p className="text-xs text-dim mt-0.5">
              Fuente: MLB Stats API
            </p>
          </div>
          <span className="shrink-0 whitespace-nowrap text-xs text-dim">Temporada {etiquetaTemporada(season)}</span>
        </div>

        {pitching.length === 0 ? (
          <EmptyState message="No hay datos de pitcheo disponibles." />
        ) : (
          <PitchingTable data={pitching} />
        )}
      </main>
    </>
  );
}
