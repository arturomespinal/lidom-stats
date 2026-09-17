import { fetchStandings } from "@/lib/api";
import { DEFAULT_SEASON } from "@/lib/constants";
import Navbar from "@/components/Navbar";
import StandingsTable from "@/components/StandingsTable";
import EmptyState from "@/components/EmptyState";

interface Props {
  searchParams: { season?: string };
}

export default async function StandingsPage({ searchParams }: Props) {
  const season = searchParams.season ?? DEFAULT_SEASON;
  const standings = await fetchStandings(season);

  return (
    <>
      <Navbar season={season} />
      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-lg font-semibold">Tabla de Posiciones</h1>
          <span className="text-xs text-[#8b949e]">Temporada regular · {season}</span>
        </div>

        {standings.length === 0 ? (
          <EmptyState />
        ) : (
          <StandingsTable data={standings} />
        )}
      </main>
    </>
  );
}
