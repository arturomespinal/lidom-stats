import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import GameDetail from "@/components/game/GameDetail";
import { fetchLiveGame } from "@/lib/api";
import { TEAM_SHORT_NAMES } from "@/lib/constants";
import { compartir } from "@/lib/metadata";

interface Props {
  params: Promise<{ gamePk: string }>;
  searchParams: Promise<{ season?: string }>;
}

/**
 * El título y la descripción para cuando se comparte el enlace. Esto sí se
 * pide en el servidor: es una sola consulta corta, y WhatsApp no ejecuta el
 * cliente. La imagen sale de opengraph-image.tsx.
 */
export async function generateMetadata(props: Props): Promise<Metadata> {
  const pk = Number((await props.params).gamePk);
  const g = Number.isInteger(pk) && pk > 0 ? await fetchLiveGame(pk) : null;
  if (!g) return compartir("Juego en vivo", "Jugada a jugada en Deportiv.");
  const nombre = (c: string) => TEAM_SHORT_NAMES[c] ?? c;
  const enJuego = g.status === "live" || g.status === "final";
  const marcador = enJuego
    ? `${nombre(g.away.team_code)} ${g.away.runs}–${g.home.runs} ${nombre(g.home.team_code)}`
    : `${nombre(g.away.team_code)} vs ${nombre(g.home.team_code)}`;
  const estado = g.status === "live" ? "En vivo" : g.status === "final" ? "Final" : "Previa";
  return compartir(`${marcador} · ${estado}`, "Jugada a jugada, marcador y boxscore en vivo.");
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

  const season = searchParams.season;

  // Sin <main> aquí: el detalle abre con la cabecera oscura a sangre, como las
  // fichas, y arma su propia columna debajo.
  return (
    <>
      <Navbar season={season} barraInferior={false} />
      <GameDetail gamePk={gamePk} season={season} />
    </>
  );
}
