import type { Config } from "tailwindcss";

/**
 * Los colores salen de las variables CSS de app/globals.css, no de literales
 * aquí. Con `<alpha-value>` Tailwind compone la opacidad sobre el token, así
 * que `bg-card/50` o `text-live/30` funcionan igual que con un color nativo.
 *
 * Nada de hex escrito a mano en los componentes: si un color no está en esta
 * lista, o es de equipo (lib/constants.ts) o falta un token.
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
      colors: {
        bg:       token("bg"),
        sunken:   token("sunken"),
        card:     token("card"),
        raised:   token("raised"),
        header:   token("header"),
        line:     token("line"),

        fg:       token("fg"),
        fg2:      token("fg2"),
        dim:      token("dim"),

        accent:   token("accent"),
        "accent-on": token("accent-on"),

        pos:      token("pos"),
        neg:      token("neg"),
        warn:     token("warn"),
        live:     token("live"),
      },
    },
  },
  plugins: [],
};

export default config;
