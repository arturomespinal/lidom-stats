import type { Metadata } from "next";

/**
 * Título y descripción de una página, también para cuando se comparte su
 * enlace (og:title, og:description, la tarjeta de X). WhatsApp y X leen las
 * etiquetas og:, no el <title>; sin esto, la tarjeta salía con el título del
 * sitio. La imagen la pone el `opengraph-image.tsx` de cada ruta.
 *
 * `titulo` va sin "· Deportiv": eso lo agrega el <title>, y en la tarjeta ya
 * lo dice el nombre del sitio.
 */
export function compartir(titulo: string, descripcion: string): Metadata {
  return {
    title: `${titulo} · Deportiv`,
    description: descripcion,
    openGraph: { title: titulo, description: descripcion, siteName: "Deportiv", locale: "es_DO", type: "website" },
    twitter: { card: "summary_large_image", title: titulo, description: descripcion },
  };
}

/**
 * La dirección pública de la web, para que las imágenes de las tarjetas
 * vayan con URL completa. En Vercel sale sola de su variable de producción.
 */
export function urlDelSitio(): URL {
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return new URL(process.env.NEXT_PUBLIC_SITE_URL ?? (vercel ? `https://${vercel}` : "http://localhost:3000"));
}
