"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Con juegos en curso, vuelve a pedir la portada cada `segundos`.
 *
 * `router.refresh()` rehace el render del servidor sin recargar la página ni
 * perder el desplazamiento: la portada sigue siendo un componente de servidor
 * y esto es todo lo que tiene de cliente. Se programa de nuevo en cada render
 * —no con setInterval— para que las peticiones no se apilen, y se detiene
 * cuando la pestaña del navegador no se ve.
 */
export default function Refresco({ segundos }: { segundos: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setTimeout(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, segundos * 1000);
    return () => clearTimeout(t);
  });
  return null;
}
