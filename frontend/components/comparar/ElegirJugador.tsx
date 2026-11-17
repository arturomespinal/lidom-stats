"use client";

import { useRouter } from "next/navigation";

import PlayerSearch from "@/components/PlayerSearch";
import TeamBadge from "@/components/TeamBadge";

/**
 * Un lado de la comparación: el jugador elegido con "Cambiar", o el buscador
 * si todavía no hay nadie.
 *
 * La elección vive en la URL (`/comparar?a=…&b=…`): se puede compartir el
 * enlace y el botón de volver deshace el último cambio. Al cambiar a uno de
 * los dos se sueltan la temporada y el papel: la temporada elegida puede no
 * ser común con el nuevo, y el papel por defecto depende de los dos.
 */
export default function ElegirJugador({
  lado,
  elegido,
  otro,
}: {
  lado: "a" | "b";
  /** El de este lado, si ya hay uno. */
  elegido: { player_id: string; full_name: string; team_code: string | null } | null;
  /** El player_id del otro lado, para conservarlo en la URL. */
  otro: string | null;
}) {
  const router = useRouter();

  function ir(playerId: string | null) {
    const params = new URLSearchParams();
    const yo = lado === "a" ? playerId : otro;
    const el = lado === "a" ? otro : playerId;
    if (yo) params.set("a", yo);
    if (el) params.set("b", el);
    router.push(`/comparar${params.size ? `?${params}` : ""}`);
  }

  if (!elegido) {
    return (
      <PlayerSearch
        alElegir={(j) => ir(j.player_id)}
        placeholder={lado === "a" ? "Primer jugador" : "Segundo jugador"}
        claseInput="h-11 w-full"
        // El panel abre hacia adentro de la pantalla: el de la derecha,
        // alineado a la derecha, para no salirse en un teléfono.
        clasePanel={`${lado === "a" ? "left-0" : "right-0"} w-full min-w-64`}
        autoFocus={lado === "b"}
      />
    );
  }

  return (
    <div className={`flex min-w-0 items-center gap-2 ${lado === "b" ? "flex-row-reverse text-right" : ""}`}>
      {elegido.team_code && <TeamBadge code={elegido.team_code} variant="solid" />}
      <div className="min-w-0">
        <p className="truncate text-[15px] font-bold text-fg">{elegido.full_name}</p>
        <button
          type="button"
          onClick={() => ir(null)}
          className="tocable -my-2 min-h-11 text-xs font-semibold text-dim underline-offset-2 hover:text-fg hover:underline"
        >
          Cambiar
        </button>
      </div>
    </div>
  );
}
