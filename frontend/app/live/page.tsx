import Navbar from "@/components/Navbar";
import LiveGames from "@/components/LiveGames";
import { DEFAULT_SEASON } from "@/lib/constants";

interface Props {
  searchParams: { season?: string };
}

/* Esta página no hace fetch en el servidor a propósito: el estado en vivo
   cambia cada diez segundos y cualquier cosa renderizada en el servidor
   nacería vieja. El componente cliente carga el estado actual al montarse y
   después se queda escuchando el flujo SSE. */
export default function LivePage({ searchParams }: Props) {
  const season = searchParams.season ?? DEFAULT_SEASON;

  return (
    <>
      <Navbar season={season} />
      <main className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-lg font-semibold">En Vivo</h1>
          <span className="text-xs text-[#8b949e]">
            Actualización automática
          </span>
        </div>

        <LiveGames />
      </main>
    </>
  );
}
