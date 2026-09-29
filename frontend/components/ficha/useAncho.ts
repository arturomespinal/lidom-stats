"use client";

import { useEffect, useRef, useState } from "react";

/**
 * El ancho real de un contenedor, para dibujar el SVG a su medida.
 *
 * Un `viewBox` fijo con `width: 100%` escalaría también las letras: en un
 * teléfono los ejes quedarían en 7 px. Midiendo, el texto se queda en su
 * tamaño y lo que se estira es la gráfica.
 */
export function useAncho<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [ancho, setAncho] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setAncho(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, ancho] as const;
}
