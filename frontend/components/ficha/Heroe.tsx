import type { ReactNode } from "react";
import { anchoBebas } from "@/lib/bebas";

/**
 * La cabecera de las fichas: franja navy a sangre con un plano del color del
 * club en diagonal. Ocupa el lugar de la foto que no podemos usar (guía legal:
 * ni escudos ni fotos de la MLB). Misma pieza que `mobile/src/components/Heroe.tsx`.
 *
 * ── Toda letra va sobre el navy, nunca sobre el plano ──────────────────────
 * Blanco sobre el rojo de Escogido da 3.6:1 y sobre el amarillo de Águilas
 * 2:1; sobre el navy, 16.9:1 para los seis. El plano es solo forma, y quien
 * use la cabecera mete su texto en `<ColumnaHeroe>`, que no pasa de lo que el
 * plano deja libre:
 *
 * - En un teléfono el plano se queda arriba a la derecha (176 px de alto,
 *   como en la app) y la columna de texto no pasa del 52%.
 * - Desde `sm` el plano ocupa todo el alto del lado derecho y el texto, el
 *   58% izquierdo. La fila de cifras va dentro de esa columna.
 *
 * ── Las dos diagonales son `clip-path` ─────────────────────────────────────
 * La web sí tiene `clip-path` (el móvil las hace con bordes y `skewX`). El
 * borde inferior sube 32 px de izquierda a derecha, igual que en la app.
 */
export default function Heroe({
  color,
  marca,
  lado,
  children,
}: {
  /** El primario del club: pinta el plano. Sin color no hay plano: la
   *  cabecera de un juego es de dos clubes, y pintar uno solo diría que el
   *  juego es suyo. */
  color?: string;
  /** Texto gigante tono sobre tono en el plano: el código del equipo. */
  marca?: string;
  /** Lo que va ENCIMA del plano (el monograma). Nunca texto que se lea. */
  lado?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      className="relative overflow-hidden bg-ink text-ink-fg"
      style={{ clipPath: "polygon(0 0, 100% 0, 100% calc(100% - 32px), 0 100%)" }}
    >
      {color && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute right-0 top-0 h-[176px] w-[42%] sm:bottom-0 sm:h-auto sm:w-[40%]"
          style={{
            backgroundColor: color,
            clipPath: "polygon(30% 0, 100% 0, 100% 100%, 0 100%)",
          }}
        >
          {marca && (
            // Tono sobre tono: el navy al 16%. Textura, no texto; por eso
            // aria-hidden en el contenedor.
            //
            // El tamaño sale del ancho real del código en Bebas contra lo que
            // deja ver el plano: a 150 px fijos "TOR" medía 175 y el plano de
            // un teléfono deja ~110, así que la R quedaba cortada (30-sep). En
            // el teléfono el plano mide el 42 % del ancho y por la diagonal
            // deja ver ~78 % de eso a la altura de la letra; desde `sm`, el
            // 40 % y ~85 % a media altura. Mismo cálculo que el móvil.
            <span
              className="absolute bottom-3 right-3 font-cond leading-none text-[rgb(9_28_58/0.16)] text-[length:min(150px,calc((32.76vw_-_16px)/var(--em)))] sm:bottom-auto sm:right-6 sm:top-1/2 sm:-translate-y-1/2 sm:text-[length:min(240px,calc((34vw_-_32px)/var(--em)))]"
              style={{ ["--em" as string]: anchoBebas(marca).toFixed(3) }}
            >
              {marca}
            </span>
          )}
        </div>
      )}

      <div className="relative mx-auto max-w-5xl px-4 pb-14 pt-6 sm:pb-16 sm:pt-10">
        {lado && (
          <div className="absolute right-4 top-6 sm:right-[calc(20%-60px)] sm:top-1/2 sm:-translate-y-[60%]">
            {lado}
          </div>
        )}
        {children}
      </div>
    </section>
  );
}

/** La columna de texto de la cabecera: lo que el plano deja libre. */
export function ColumnaHeroe({ children }: { children: ReactNode }) {
  return <div className="w-[52%] space-y-2 sm:w-[58%]">{children}</div>;
}

/** Una cifra grande de la cabecera: valor en Bebas, etiqueta chica debajo. */
export function CifraHeroe({
  valor,
  etiqueta,
  grande = false,
}: {
  valor: string;
  etiqueta: string;
  grande?: boolean;
}) {
  return (
    // La caja es un contenedor de consultas (`container-type`) y la cifra
    // mide `100cqw / ancho en em`, con tope en el tamaño de diseño: cabe
    // entera en su columna. Con `truncate` y tamaño fijo, "301-366" salía
    // "301-…" en una pantalla de 640 (30-sep).
    <div className="min-w-0 [container-type:inline-size]">
      <div
        className={`num whitespace-nowrap font-cond leading-none text-ink-fg ${
          grande
            ? "text-[length:min(84px,calc(98cqw/var(--em)))] sm:text-[length:min(104px,calc(98cqw/var(--em)))]"
            : "text-[length:min(40px,calc(98cqw/var(--em)))] sm:text-[length:min(48px,calc(98cqw/var(--em)))]"
        }`}
        style={{ ["--em" as string]: anchoBebas(valor).toFixed(3) }}
      >
        {valor}
      </div>
      <div className="mt-1 truncate text-[11px] uppercase tracking-[0.08em] text-ink-dim">
        {etiqueta}
      </div>
    </div>
  );
}

/**
 * Fila de cifras con la raya fina de arriba. Ocupa el ancho de la cabecera en
 * el teléfono —ahí el plano ya terminó más arriba— y la columna de texto
 * desde `sm`, donde el plano llega hasta abajo.
 */
export function FilaCifras({ titulo, children }: { titulo?: string; children: ReactNode }) {
  return (
    <div className="mt-6 border-t border-white/15 pt-3 sm:w-[58%]">
      {titulo && (
        <div className="mb-1.5 text-[11px] uppercase tracking-[0.08em] text-ink-dim">
          {titulo}
        </div>
      )}
      <div className="grid auto-cols-fr grid-flow-col gap-3">{children}</div>
    </div>
  );
}

/**
 * El nombre grande de la cabecera, del tamaño que quepa en la columna.
 *
 * El móvil tiene `adjustsFontSizeToFit`; la web no. Aquí el tamaño sale de la
 * palabra más larga: Bebas mide ~0.46 em por mayúscula, así que la letra no
 * pasa de ancho-de-columna ÷ (0.46 × letras). "RODRÍGUEZ" a 52 px no cabe en
 * la columna del 52% de un teléfono de 390, y partirla a media palabra sería
 * peor que achicarla. El tope (52 / 76 px) es el tamaño de diseño.
 */
export function NombreHeroe({ children }: { children: string }) {
  const largo = Math.max(...children.split(/\s+/).map((p) => p.length), 1);
  return (
    <h1
      className="pt-1 font-cond leading-[0.92] tracking-[0.01em] text-ink-fg text-[length:min(52px,calc((100vw_-_32px)*0.52/var(--l)))] sm:text-[length:min(76px,calc((min(100vw,1024px)_-_32px)*0.58/var(--l)))]"
      style={{ ["--l" as string]: (0.46 * largo).toFixed(2) }}
    >
      {children}
    </h1>
  );
}
