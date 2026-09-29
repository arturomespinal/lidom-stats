import Link from "next/link";

/**
 * Las temporadas del equipo como pestañas de subrayado, pegadas bajo la barra
 * superior. Son enlaces y no estado: la temporada vive en la URL
 * (`?season=`), así un enlace abre en la temporada que se compartió y el
 * botón de atrás del navegador funciona.
 */
export default function TemporadaTabs({
  code,
  temporadas,
  activa,
}: {
  code: string;
  temporadas: string[];
  activa: string;
}) {
  return (
    <nav aria-label="Temporada" className="sticky top-14 z-[5] border-b border-line bg-bg/95 backdrop-blur">
      <div className="mx-auto flex max-w-5xl overflow-x-auto px-4">
        {temporadas.map((s) => {
          const es = s === activa;
          return (
            <Link
              key={s}
              href={`/teams/${code}?season=${s}`}
              scroll={false}
              aria-current={es ? "page" : undefined}
              className={`num flex h-11 shrink-0 items-center border-b-2 px-3 text-sm transition-colors ${
                es ? "border-ink font-bold text-fg" : "border-transparent text-dim hover:text-fg"
              }`}
            >
              {s}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
