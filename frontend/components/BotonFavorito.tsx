"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import Estrella from "@/components/Estrella";
import { fijarFavorito } from "@/lib/favorito";

/**
 * La estrella de "mi equipo", en la cabecera de la ficha del equipo.
 *
 * Al marcarla se guarda la cookie (lib/favorito.ts) y se pide la página otra
 * vez al servidor (`router.refresh()`): la portada y la tabla de posiciones
 * ya salen con el favorito. Solo hay uno: marcar otro equipo lo reemplaza.
 */
export default function BotonFavorito({
  code,
  nombre,
  inicial,
}: {
  code: string;
  nombre: string;
  /** El favorito de la cookie, leído por la página en el servidor. */
  inicial: string | null;
}) {
  const router = useRouter();
  const [favorito, setFavorito] = useState(inicial);
  const [, refrescar] = useTransition();
  const es = favorito === code;

  function alternar() {
    const nuevo = es ? null : code;
    fijarFavorito(nuevo);
    setFavorito(nuevo);
    refrescar(() => router.refresh());
  }

  return (
    <button
      type="button"
      onClick={alternar}
      aria-pressed={es}
      aria-label={es ? `Quitar a ${nombre} como tu equipo` : `Marcar a ${nombre} como tu equipo`}
      className="tocable inline-flex min-h-11 items-center gap-2 rounded-lg border border-ink-fg/25 px-3 text-sm font-semibold text-ink-fg hover:bg-ink-fg/10"
    >
      <Estrella rellena={es} className="h-[18px] w-[18px]" />
      {es ? "Tu equipo" : "Mi equipo"}
    </button>
  );
}
