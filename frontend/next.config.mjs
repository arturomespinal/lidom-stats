/**
 * Cabeceras de seguridad de la web (11-nov-2026). La API ya manda las suyas
 * (api/seguridad.py); estas son las del sitio que ve el navegador.
 *
 * - Content-Security-Policy: el navegador solo carga código, estilos e
 *   imágenes del propio sitio y solo habla con la API. Si un día se colara
 *   un script ajeno (una dependencia comprometida, un dato de la API pintado
 *   sin escapar), no podría llamar a otro servidor ni cargar más código de
 *   fuera. `'unsafe-inline'` en script-src es lo que pide Next sin nonces
 *   (sus scripts de arranque van en línea); con nonces todas las páginas
 *   tendrían que ser dinámicas con un middleware, y hoy no hay datos de
 *   usuario que proteger. En desarrollo React necesita `eval`.
 * - frame-ancestors / X-Frame-Options: nadie puede meter el sitio en un
 *   iframe (clickjacking).
 * - Strict-Transport-Security: siempre por HTTPS. Vercel ya la manda; aquí
 *   queda para cuando la web corra en otro sitio.
 * - Permissions-Policy: la web no usa cámara, micrófono ni ubicación.
 *
 * El día que haya anuncios o analítica de terceros, sus dominios se añaden
 * aquí a propósito, uno por uno: esa es la idea.
 */
const desarrollo = process.env.NODE_ENV === "development";

/** El origen de la API ("https://deportiv.duckdns.org"), para connect-src. */
function origenApi() {
  try {
    return new URL(process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").origin;
  } catch {
    return "";
  }
}

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${desarrollo ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  // El navegador llama a la API (buscador, en vivo por SSE). En desarrollo,
  // además, el WebSocket de recarga de Next.
  `connect-src 'self' ${origenApi()}${desarrollo ? " ws: wss:" : ""}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const cabeceras = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  // "X-Powered-By: Next.js" no le sirve a nadie más que a quien busca qué atacar.
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: cabeceras }];
  },
};

export default nextConfig;
