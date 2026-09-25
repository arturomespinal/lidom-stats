import type { Config } from "tailwindcss";

/**
 * Los colores salen de las variables CSS de app/globals.css, no de literales
 * aquí. Con `<alpha-value>` Tailwind compone la opacidad sobre el token, así
 * que `bg-card/50` o `text-live/30` funcionan igual que con un color nativo.
 *
 * Nada de hex escrito a mano en los componentes: si un color no está en esta
 * lista, o es de equipo (lib/constants.ts) o falta un token.
 *
 * `brand` y `brand-navy` están aquí, pero son SOLO para el cascarón — icono,
 * splash, logotipo, estados vacíos. Ver la nota larga en globals.css: el verde
 * de Deportiv y el de Estrellas son el mismo tono, y meterlo en una tabla hace
 * que cada fila de Estrellas parezca destacada.
 */
const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-archivo)", "ui-sans-serif", "system-ui", "sans-serif"],
        cond: ["var(--font-cond)", "var(--font-archivo)", "sans-serif"],
      },
      colors: {
        bg:       token("bg"),
        sunken:   token("sunken"),
        card:     token("card"),
        raised:   token("raised"),
        header:   token("header"),
        line:     token("line"),
        "line-soft": token("line-soft"),

        fg:       token("fg"),
        fg2:      token("fg2"),
        dim:      token("dim"),
        faint:    token("faint"),

        accent:   token("accent"),
        "accent-on": token("accent-on"),

        // La franja navy de contexto y su texto.
        ink:        token("ink"),
        "ink-fg":   token("ink-fg"),
        "ink-dim":  token("ink-dim"),

        pos:      token("pos"),
        neg:      token("neg"),
        warn:     token("warn"),
        live:     token("live"),

        // Solo cascarón. Ver la nota de arriba.
        brand:       token("brand"),
        "brand-navy": token("brand-navy"),
      },
    },
  },
  plugins: [],
};

export default config;
