import Link from "next/link";

/**
 * El nombre de un jugador dentro del detalle de un juego: enlace a su ficha
 * si la tiene, texto quieto si no.
 *
 * `profileId` es el slug que la API pone en cada fila (`profile_id`). El
 * `player_id` de estas filas es el número de la MLB y no sirve para enlazar.
 * Un debutante en su primer juego todavía no está en la base: su nombre se
 * pinta igual, solo que no lleva a ninguna parte.
 */
export default function NombreJugador({
  nombre,
  profileId,
}: {
  nombre: string;
  profileId: string | null | undefined;
}) {
  if (!profileId) return <>{nombre}</>;
  return (
    <Link
      href={`/players/${profileId}`}
      className="underline-offset-2 hover:text-fg hover:underline"
    >
      {nombre}
    </Link>
  );
}
