"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import TeamBadge from "@/components/TeamBadge";
import { searchPlayers } from "@/lib/api";
import { PlayerSearchHit } from "@/lib/types";

/**
 * Buscador de jugadores de la barra superior.
 *
 * Es la única puerta a las fichas: con catorce temporadas y 2.253 jugadores en
 * la base, no hay listado que sirva de índice.
 *
 * Tres decisiones:
 *
 * - **Espera 250 ms antes de consultar.** Escribiendo "munguia" a velocidad
 *   normal salen siete peticiones sin esto, y solo la última importa.
 * - **Cancela la anterior con AbortController.** Sin eso, una respuesta lenta
 *   de "mun" puede llegar después de la de "munguia" y pisar los resultados
 *   con los de una consulta que el usuario ya abandonó.
 * - **El fallo de red no vacía la lista.** Un resultado de hace un segundo es
 *   más útil que un panel en blanco.
 */
export default function PlayerSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  // Los resultados y la consulta a la que pertenecen viajan JUNTOS, en un solo
  // estado. Con dos estados separados haría falta un setState síncrono dentro
  // del efecto para mantenerlos a la par —cascada de renders, y el linter de
  // React 19 lo marca—; así basta con comparar al pintar.
  const [res, setRes] = useState<{ q: string; data: PlayerSearchHit[] }>({
    q: "",
    data: [],
  });
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const termino = q.trim();
    // Se sale sin tocar el estado: lo que se muestra se deriva abajo.
    if (termino.length < 2) return;

    const control = new AbortController();
    const temporizador = setTimeout(async () => {
      const data = await searchPlayers(termino, 8);
      // El guard es lo que impide que la respuesta lenta de "mun" pise a la
      // de "munguia": para cuando llega, su efecto ya fue limpiado.
      if (!control.signal.aborted) setRes({ q: termino, data });
    }, 250);

    return () => {
      control.abort();
      clearTimeout(temporizador);
    };
  }, [q]);

  // Cerrar al tocar fuera. Sin esto el panel se queda abierto sobre la página
  // y hay que borrar el texto para quitarlo.
  useEffect(() => {
    function fuera(e: MouseEvent) {
      if (caja.current && !caja.current.contains(e.target as Node)) {
        setAbierto(false);
      }
    }
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, []);

  // Todo lo de pintar se DERIVA. `buscando` es simplemente "lo que tengo no
  // corresponde a lo que hay escrito", y los resultados viejos se siguen
  // mostrando mientras llega lo nuevo: un panel en blanco entre pulsación y
  // pulsación se lee como si la búsqueda no funcionara.
  const termino = q.trim();
  const visibles = termino.length < 2 ? [] : res.data;
  const buscando = termino.length >= 2 && res.q !== termino;

  function abrir(playerId: string) {
    setAbierto(false);
    setQ("");
    router.push(`/players/${playerId}`);
  }

  return (
    <div ref={caja} className="relative">
      <input
        type="search"
        value={q}
        placeholder="Buscar jugador"
        aria-label="Buscar jugador"
        onChange={(e) => {
          setQ(e.target.value);
          setAbierto(true);
        }}
        onFocus={() => setAbierto(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setAbierto(false);
          // Enter con un solo resultado abre directo: es lo que espera quien
          // escribió el nombre completo.
          if (e.key === "Enter" && visibles.length === 1)
            abrir(visibles[0].player_id);
        }}
        className="w-32 rounded border border-line bg-header px-2.5 py-1.5 text-sm text-fg placeholder:text-faint focus:w-48 focus:border-fg2 focus:outline-none sm:w-40 sm:focus:w-56"
      />

      {abierto && q.trim().length >= 2 && (
        <div className="absolute right-0 top-full z-20 mt-1.5 max-h-80 w-72 overflow-y-auto rounded-lg border border-line bg-card shadow-xl">
          {visibles.length === 0 ? (
            <p className="px-3 py-3 text-xs text-dim">
              {buscando ? "Buscando…" : "Sin coincidencias"}
            </p>
          ) : (
            visibles.map((h) => {
              // Los equipos vienen como CSV de un GROUP_CONCAT; se pintan las
              // tres primeras tejas para distinguir homónimos de un vistazo.
              const equipos = [
                ...new Set(
                  `${h.batting_teams ?? ""},${h.pitching_teams ?? ""}`
                    .split(",")
                    .filter(Boolean)
                ),
              ].slice(0, 3);

              return (
                <button
                  key={h.player_id}
                  onClick={() => abrir(h.player_id)}
                  className="flex w-full items-center gap-2 border-b border-line-soft px-3 py-2 text-left last:border-0 hover:bg-raised"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-fg">
                      {h.full_name}
                    </span>
                    {h.birth_date && (
                      <span className="num block text-[10px] text-faint">
                        {h.birth_date}
                      </span>
                    )}
                  </span>
                  <span className="flex shrink-0 gap-1">
                    {equipos.map((code) => (
                      <TeamBadge key={code} code={code} size="sm" />
                    ))}
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
