import { fetchPitching } from "@/lib/api";
import { DEFAULT_SEASON } from "@/lib/constants";
import Navbar from "@/components/Navbar";
import PitchingTable from "@/components/PitchingTable";
import EmptyState from "@/components/EmptyState";

interface Props {
  searchParams: Promise<{ season?: string; team?: string; min_ip?: string }>;
}

export default async function PitchingPage(props: Props) {
  const searchParams = await props.searchParams;
  const season = searchParams.season ?? DEFAULT_SEASON;
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
      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-lg font-semibold">Líderes de Pitcheo</h1>
            <p className="text-xs text-dim mt-0.5">
              Clic en columna para ordenar · ERA/WHIP: menor es mejor
            </p>
          </div>
          <span className="text-xs text-dim">Temporada {season}</span>
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
