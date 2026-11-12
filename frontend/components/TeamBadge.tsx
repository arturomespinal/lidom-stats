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
 * `solid` (relleno del color, letras encima) grita: marcadores, la tabla de
 * posiciones, cabeceras. `outline` (aro y relleno al 16%) susurra, y es lo
 * que va en una lista de veinte filas — veinte tejas sólidas serían un
 * arcoíris.
 *
 * ── Look "Pizarra": un cuadrado redondeado ────────────────────────────────
 * Las dos son la misma forma, con el radio a un cuarto del lado. La esquina
 * cortada del look anterior (sigue en `main`) se fue con él: en la pizarra
 * todo es ortogonal, y la teja se reconoce por el código en Barlow Condensed.
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
    on: "rgb(var(--card))",
  };

  const dim =
    size === "sm" ? "w-8 h-8 text-[13px]" : "w-11 h-11 text-[17px]";

  // Un cuarto del lado, igual que mobile/src/components/TeamBadge.tsx.
  const radio = size === "sm" ? "rounded-[8px]" : "rounded-[11px]";

  if (variant === "solid") {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center font-cond font-bold tracking-[0.03em] ${dim} ${radio}`}
        style={{
          backgroundColor: style.primary,
          // Por club y no un color fijo: sobre el amarillo de Águilas el
          // blanco daría 2:1, y sobre el vino de Toros la tinta, 3.2:1.
          color: style.on,
        }}
      >
        {code}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center font-cond font-bold tracking-[0.03em] ${dim} ${radio}`}
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
