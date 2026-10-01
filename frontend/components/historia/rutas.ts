import type { LiderHistorico } from "@/lib/types";

/**
 * A dónde lleva un nombre de la historia: a la ficha de la MLB API si está
 * enlazado (su carrera ya incluye los años viejos), o a la ficha histórica
 * si solo existe en DIGIMETRICS.
 */
export function rutaJugador(l: Pick<LiderHistorico, "player_id" | "id_miembro">): string | null {
  if (l.player_id) return `/players/${l.player_id}`;
  if (l.id_miembro != null) return `/historia/jugador/${l.id_miembro}`;
  return null;
}
