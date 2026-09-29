import { iniciales } from "@/lib/formato";

/**
 * El monograma del jugador: sus iniciales en una teja navy con la esquina
 * cortada. Ocupa el lugar de la foto —que no podemos usar— con una marca
 * propia, igual que las tejas de equipo ocupan el de los escudos.
 *
 * Navy con letra blanca (16.9:1) y no el color del club: va encima del plano
 * del club en la cabecera, y así se recorta contra él con cualquiera de los
 * seis. El corte es de tamaño fijo, como en `TeamBadge`.
 */
export default function Monograma({ nombre }: { nombre: string }) {
  return (
    <div
      aria-hidden="true"
      className="flex h-[88px] w-[88px] items-center justify-center bg-ink font-cond text-[48px] leading-none tracking-[0.02em] text-ink-fg sm:h-[120px] sm:w-[120px] sm:text-[64px]"
      style={{
        borderRadius: 10,
        clipPath: "polygon(0 0, 100% 0, 100% calc(100% - 18px), calc(100% - 18px) 100%, 0 100%)",
      }}
    >
      {iniciales(nombre)}
    </div>
  );
}
