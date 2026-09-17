import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          page: "#0d1117",
          card: "#161b22",
          header: "#21262d",
        },
        border: {
          DEFAULT: "#30363d",
        },
      },
    },
  },
  plugins: [],
};

export default config;
