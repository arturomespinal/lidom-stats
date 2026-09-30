import { notFound } from "next/navigation";
import Navbar from "@/components/Navbar";
import GameDetail from "@/components/game/GameDetail";
import { DEFAULT_SEASON } from "@/lib/constants";

interface Props {
  params: Promise<{ gamePk: string }>;
  searchParams: Promise<{ season?: string }>;
}

/* Igual que el listado, esta página no hace fetch en el servidor: el detalle
   cambia cada diez segundos y cualquier cosa renderizada allá nacería vieja.
   El servidor solo valida el gamePk y monta el cliente. */
export default async function GamePage(props: Props) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const gamePk = Number(params.gamePk);
  // Un gamePk que no es un entero positivo no es un juego, es una URL mal
  // escrita: 404 antes de montar nada.
  if (!Number.isInteger(gamePk) || gamePk <= 0) notFound();

  const season = searchParams.season ?? DEFAULT_SEASON;

  // Sin <main> aquí: el detalle abre con la cabecera navy a sangre, como las
  // fichas, y arma su propia columna debajo.
  return (
    <>
      <Navbar season={season} />
      <GameDetail gamePk={gamePk} season={season} />
    </>
  );
}
