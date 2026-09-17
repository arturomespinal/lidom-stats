import { fetchBatting } from "@/lib/api";
import { DEFAULT_SEASON } from "@/lib/constants";
import Navbar from "@/components/Navbar";
import BattingTable from "@/components/BattingTable";
import EmptyState from "@/components/EmptyState";

interface Props {
  searchParams: { season?: string; team?: string; min_pa?: string };
}

export default async function BattingPage({ searchParams }: Props) {
  const season = searchParams.season ?? DEFAULT_SEASON;
  const team = searchParams.team;
  const min_pa = parseInt(searchParams.min_pa ?? "0") || 0;

  const batting = await fetchBatting(season, { team, min_pa, limit: 100 });

  return (
    <>
      <Navbar season={season} />
      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-lg font-semibold">Líderes de Bateo</h1>
            <p className="text-xs text-[#8b949e] mt-0.5">
              Clic en columna para ordenar · Datos: MLB Stats API
            </p>
          </div>
          <span className="text-xs text-[#8b949e]">Temporada {season}</span>
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
