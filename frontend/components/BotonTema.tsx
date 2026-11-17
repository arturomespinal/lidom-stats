"use client";

import { useSyncExternalStore } from "react";
import { escucharTema, fijarTema, temaActual, type Tema } from "@/lib/tema";

/**
 * El interruptor de modo claro / oscuro, en la barra de arriba.
 *
 * Muestra el modo AL QUE LLEVA: el sol en oscuro, la luna en claro. El estado
 * sale de <html> con useSyncExternalStore, no de un useState sembrado en un
 * efecto: el script del <head> ya lo fijó antes de hidratar, y en el servidor
 * siempre es oscuro (el de arranque).
 */
export default function BotonTema() {
  const tema = useSyncExternalStore<Tema>(escucharTema, temaActual, () => "oscuro");
  const otro: Tema = tema === "claro" ? "oscuro" : "claro";
  const etiqueta = otro === "claro" ? "Cambiar a modo claro" : "Cambiar a modo oscuro";

  return (
    <button
      type="button"
      onClick={() => fijarTema(otro)}
      aria-label={etiqueta}
      title={etiqueta}
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-dim transition-colors hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
    >
      {otro === "claro" ? (
        // Sol
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        // Luna
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11Z" />
        </svg>
      )}
    </button>
  );
}
