import { iniciales } from "@/lib/formato";

/**
 * El monograma del jugador: sus iniciales en una teja grafito redondeada.
 * Ocupa el lugar de la foto —que no podemos usar— con una marca propia, igual
 * que las tejas de equipo ocupan el de los escudos.
 *
 * Grafito con letra clara (17.4:1) y no el color del club: va encima del
 * plano del club en la cabecera, y así se recorta contra él con cualquiera de
 * los seis. Radio de un cuarto del lado, como en `TeamBadge`.
 */
export default function Monograma({ nombre }: { nombre: string }) {
  return (
    <div
      aria-hidden="true"
      className="flex h-[88px] w-[88px] items-center justify-center rounded-[22px] bg-bg font-cond font-bold text-[48px] leading-none tracking-[0.02em] text-fg sm:h-[120px] sm:w-[120px] sm:rounded-[30px] sm:text-[64px]"
    >
      {iniciales(nombre)}
    </div>
  );
}
