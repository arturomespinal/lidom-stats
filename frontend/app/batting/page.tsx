import { fetchBatting } from "@/lib/api";
import { DEFAULT_SEASON } from "@/lib/constants";
import Navbar from "@/components/Navbar";
import BattingTable from "@/components/BattingTable";
import EmptyState from "@/components/EmptyState";

interface Props {
  searchParams: Promise<{ season?: string; team?: string; min_pa?: string }>;
}

export default async function BattingPage(props: Props) {
  const searchParams = await props.searchParams;
  const season = searchParams.season ?? DEFAULT_SEASON;
  const team = searchParams.team;
  // `?? "0"` convertía "el usuario no pidió mínimo" en "mínimo cero", y un
  // min explícito MANDA sobre el que calcula la API. Por eso esta tabla seguía
  // encabezada por un OPS de 4.000 en un turno aunque /batting ya calificaba.
  // undefined = que decida la API.
  const min_pa = searchParams.min_pa ? parseInt(searchParams.min_pa) : undefined;

  const batting = await fetchBatting(season, { team, min_pa, limit: 100 });

  return (
    <>
      <Navbar season={season} />
      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="font-cond text-[30px] leading-none tracking-[0.01em] text-fg">Líderes de Bateo</h1>
            <p className="text-xs text-dim mt-0.5">
              Clic en columna para ordenar · Datos: MLB Stats API
            </p>
          </div>
          <span className="text-xs text-dim">Temporada {season}</span>
        </div>

        {batting.length === 0 ? (
          <EmptyState message="No hay datos de bateo disponibles." />
        ) : (
          <BattingTable data={batting} />
        )}
      </main>
    </>
  );
}
