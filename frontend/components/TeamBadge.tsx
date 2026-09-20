import { TEAM_STYLES } from "@/lib/constants";

interface Props {
  code: string;
  size?: "sm" | "md";
  /** `solid` para cabeceras y héroes; `outline` para filas de lista. */
  variant?: "solid" | "outline";
}

/**
 * La marca del equipo: el código de tres letras en una teja.
 *
 * ── Por qué ya no son los escudos ─────────────────────────────────────────
 * Los escudos oficiales acumulan tres regímenes a la vez: marca figurativa
 * (Ley 20-00), derecho de autor sobre el dibujo (Ley 65-00) y competencia
 * desleal. Y LIDOM tiene una campaña de protección de marca declarada por
 * decisión unánime de su Junta desde octubre de 2022.
 *
 * Los NOMBRES sí tienen defensa —el art. 87 permite usar una marca ajena de
 * buena fe para informar, y no se puede informar sobre un juego de las
 * Águilas sin nombrar a las Águilas—. El escudo no la tiene: se puede
 * informar sin reproducirlo.
 *
 * Así que la app usa marca propia. Misma forma para los seis, el color del
 * club como identidad. Además de resolver lo legal, le da a Deportiv una
 * identidad visual que es suya: con escudos, la identidad de la app ERA la
 * identidad de los clubes.
 *
 * ── Dos pesos, no dos componentes ─────────────────────────────────────────
 * `solid` (relleno del color, letras oscuras, esquina cortada) grita, y sirve
 * para cabeceras. `outline` (aro y relleno al 14%) susurra, y es lo que va en
 * una lista de veinte filas — veinte tejas sólidas serían un arcoíris.
 */
export default function TeamBadge({
  code,
  size = "sm",
  variant = "outline",
}: Props) {
  // Respaldo para un código fuera del catálogo: gris de la paleta, nunca un
  // color inventado que parezca de equipo.
  const style = TEAM_STYLES[code] ?? {
    primary: "rgb(var(--dim))",
    tint: "rgb(var(--dim) / .12)",
    text: "rgb(var(--dim))",
  };

  const dim =
    size === "sm"
      ? "w-8 h-8 text-[11px] rounded-lg"
      : "w-10 h-10 text-[13px] rounded-[10px]";

  if (variant === "solid") {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center font-cond font-bold tracking-[0.04em] ${dim}`}
        style={{
          backgroundColor: style.primary,
          color: "rgb(var(--accent-on))",
          // La esquina cortada es lo que hace que la teja se lea como una
          // marca y no como un cuadrado de color cualquiera.
          clipPath: "polygon(0 0, 100% 0, 100% 76%, 76% 100%, 0 100%)",
        }}
      >
        {code}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center font-cond font-bold tracking-[0.03em] ${dim}`}
      style={{
        backgroundColor: style.tint,
        border: `1.5px solid ${style.primary}`,
        color: style.text,
      }}
    >
      {code}
    </span>
  );
}
