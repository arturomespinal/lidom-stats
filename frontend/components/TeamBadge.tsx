"use client";

import { useState } from "react";
import { TEAM_STYLES } from "@/lib/constants";
import { crestUrl } from "@/lib/api";

interface Props {
  code: string;
  size?: "sm" | "md";
}

/**
 * El distintivo del equipo: escudo si lo hay, siglas si no.
 *
 * El escudo lo sirve el backend desde `/static/crests/{CODIGO}.png`. `onError`
 * es lo que hace que esto funcione con la carpeta vacía: si da 404 se pintan
 * las siglas, que es exactamente lo que la app mostraba antes.
 *
 * Es `<img>` y no `next/image` a propósito: next/image exige declarar el host
 * en next.config, y el backend cambia de dirección entre desarrollo (localhost),
 * la red local (la IP de la máquina) y producción. Un `<img>` de 40 px no gana
 * nada con la optimización y sí pierde con la configuración.
 */
export default function TeamBadge({ code, size = "sm" }: Props) {
  const [sinEscudo, setSinEscudo] = useState(false);

  // Respaldo para un código que no esté en el catálogo: gris de la paleta,
  // nunca un color inventado que parezca de equipo.
  const style = TEAM_STYLES[code] ?? {
    primary: "rgb(var(--dim))",
    bg: "rgb(var(--dim) / .10)",
    text: "rgb(var(--dim))",
  };

  const dim = size === "sm" ? "w-8 h-8 text-xs" : "w-10 h-10 text-sm";
  const muestraEscudo = !!TEAM_STYLES[code] && !sinEscudo;

  if (muestraEscudo) {
    return (
      // Sin fondo ni borde: el color ya lo pone el escudo, y un recuadro de
      // color alrededor lo ensucia.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={crestUrl(code)}
        alt={code}
        onError={() => setSinEscudo(true)}
        ref={(el) => {
          // `onError` NO basta. El HTML llega renderizado desde el servidor, así
          // que el navegador empieza a cargar la imagen antes de que React
          // hidrate: si da 404 en esa ventana, el evento se dispara sin que
          // haya un manejador escuchando y se pierde. El resultado era el icono
          // de imagen rota en vez del respaldo.
          //
          // Al montar, una imagen ya terminada con naturalWidth 0 es una imagen
          // que falló. Es la única forma de enterarse de ese caso.
          if (el && el.complete && el.naturalWidth === 0) setSinEscudo(true);
        }}
        className={`shrink-0 object-contain ${dim}`}
      />
    );
  }

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded font-bold ${dim}`}
      style={{
        backgroundColor: style.bg,
        color: style.text,
        // color-mix y no `${primary}50`: concatenar alfa hex solo funciona si
        // el color ES un hex, y el respaldo de arriba es un rgb(var(--dim)).
        border: `1px solid color-mix(in srgb, ${style.primary} 50%, transparent)`,
      }}
    >
      {code}
    </span>
  );
}
