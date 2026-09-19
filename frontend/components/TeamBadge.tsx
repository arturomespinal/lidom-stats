import { TEAM_STYLES } from "@/lib/constants";

interface Props {
  code: string;
  size?: "sm" | "md";
}

export default function TeamBadge({ code, size = "sm" }: Props) {
  // Respaldo para un código que no esté en el catálogo: gris de la paleta,
  // nunca un color inventado que parezca de equipo.
  const style = TEAM_STYLES[code] ?? {
    primary: "rgb(var(--dim))",
    bg: "rgb(var(--dim) / .10)",
    text: "rgb(var(--dim))",
  };

  const dim = size === "sm" ? "w-8 h-8 text-xs" : "w-10 h-10 text-sm";

  return (
    <span
      className={`inline-flex items-center justify-center rounded font-bold shrink-0 ${dim}`}
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
