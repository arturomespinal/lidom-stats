import Link from "next/link";
import { notFound } from "next/navigation";
import Navbar from "@/components/Navbar";
import GameDetail from "@/components/game/GameDetail";
import { DEFAULT_SEASON } from "@/lib/constants";

interface Props {
  params: { gamePk: string };
  searchParams: { season?: string };
}

/* Igual que el listado, esta página no hace fetch en el servidor: el detalle
   cambia cada diez segundos y cualquier cosa renderizada allá nacería vieja.
   El servidor solo valida el gamePk y monta el cliente. */
export default function GamePage({ params, searchParams }: Props) {
  const gamePk = Number(params.gamePk);
  // Un gamePk que no es un entero positivo no es un juego, es una URL mal
  // escrita: 404 antes de montar nada.
  if (!Number.isInteger(gamePk) || gamePk <= 0) notFound();

  const season = searchParams.season ?? DEFAULT_SEASON;

  return (
    <>
      <Navbar season={season} />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <Link
          href={`/live?season=${season}`}
          className="mb-4 inline-flex items-center gap-1 text-xs text-dim transition-colors hover:text-fg"
        >
          <span aria-hidden>←</span> En Vivo
        </Link>

        <GameDetail gamePk={gamePk} />
      </main>
    </>
  );
}
