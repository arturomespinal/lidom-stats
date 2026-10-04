import Link from "next/link";
import type { Metadata } from "next";

import Navbar from "@/components/Navbar";
import EmptyState from "@/components/EmptyState";
import Heroe from "@/components/ficha/Heroe";
import { SelectorOpciones } from "@/components/SelectorTemporada";
import ListaLideres from "@/components/historia/ListaLideres";
import TarjetasRecord from "@/components/historia/TarjetasRecord";
import { fetchLideresHistoricos, fetchResumenHistorico } from "@/lib/api";
import { DEFAULT_SEASON } from "@/lib/constants";
import type { GrupoHistorico } from "@/lib/types";

export const metadata: Metadata = {
  title: "Récords de todos los tiempos · Deportiv",
  description: "Los líderes de todos los tiempos de la LIDOM, en serie regular desde 1951.",
};

// En Next 16 `searchParams` es una promesa: ver CLAUDE.md.
interface Props {
  searchParams: Promise<{ grupo?: string; stat?: string; season?: string }>;
}

const POR_DEFECTO: Record<GrupoHistorico, string> = { bateo: "h", pitcheo: "wins" };

/**
 * Récords de todos los tiempos: DIGIMETRICS antes de 2012-13 y la MLB API
 * desde entonces, sumados por jugador (src/historia.py).
 *
 * La categoría vive en la URL (?grupo=bateo&stat=hr): un enlace compartido abre
 * en esa tabla y el botón de atrás funciona, igual que con la temporada.
 */
export default async function HistoriaPage(props: Props) {
  const sp = await props.searchParams;
  const grupo: GrupoHistorico = sp.grupo === "pitcheo" ? "pitcheo" : "bateo";
  const [resumen, pedida] = await Promise.all([
    fetchResumenHistorico(),
    fetchLideresHistoricos(grupo, sp.stat ?? POR_DEFECTO[grupo]),
  ]);
  // Una categoría que no existe (enlace viejo, mano en la URL) da 422: se cae
  // a la de por defecto del grupo en vez de a una página vacía.
  const lideres = pedida ?? (sp.stat ? await fetchLideresHistoricos(grupo, POR_DEFECTO[grupo]) : null);

  return (
    <>
      <Navbar season={sp.season ?? DEFAULT_SEASON} />
      <Heroe>
        <div className="space-y-2 sm:w-[70%]">
          <p className="text-[11px] uppercase tracking-[0.08em] text-ink-dim">LIDOM · Serie regular · desde 1951</p>
          <h1 className="font-cond text-[52px] leading-[0.92] text-ink-fg sm:text-[76px]">Récords</h1>
          <p className="text-[13px] leading-snug text-ink-dim sm:text-sm">
            Los líderes de todos los tiempos. Antes de 2012-13, el portal de estadísticas de la liga; desde
            entonces, la MLB Stats API. Cada temporada cuenta una sola vez.
          </p>
        </div>
      </Heroe>

      {!lideres || !resumen ? (
        <main className="mx-auto max-w-5xl px-4 py-8">
          <EmptyState message="La historia todavía no está cargada." comando="python main.py ingest-historia" />
        </main>
      ) : (
        <>
          <SelectorOpciones
            titulo="Categoría"
            icono={false}
            resumen={`${lideres.categories.length} categorías de ${grupo}`}
            activa={lideres.label}
            opciones={lideres.categories.map((c) => ({
              label: c.label,
              href: `/historia?grupo=${grupo}&stat=${c.stat}`,
              nota: c.is_rate ? "Con mínimo de carrera" : undefined,
            }))}
            antes={<PestanasGrupo grupo={grupo} />}
          />
          <main className="mx-auto max-w-5xl space-y-6 px-4 pb-10 pt-5">
            <TarjetasRecord resumen={resumen} grupo={grupo} stat={lideres.stat} />
            <section>
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <h2 className="font-cond text-2xl leading-none tracking-[0.02em] text-fg">{lideres.label}</h2>
                <span className="num shrink-0 text-xs text-dim">
                  {lideres.minimum ? `Mínimo: ${lideres.minimum}` : `Los ${lideres.count} primeros`}
                </span>
              </div>
              <ListaLideres datos={lideres} />
            </section>
            <p className="text-[11px] leading-relaxed text-faint">
              Serie regular. Fuentes: LIDOM hasta 2011-12 y MLB Stats API desde 2012-13.
            </p>
          </main>
        </>
      )}
    </>
  );
}

/** Bateo | Pitcheo, con subrayado como el resto de las pestañas de la app. */
function PestanasGrupo({ grupo }: { grupo: GrupoHistorico }) {
  return (
    <nav aria-label="Grupo" className="flex min-h-11 items-stretch gap-1">
      {(["bateo", "pitcheo"] as const).map((g) => (
        <Link
          key={g}
          href={`/historia?grupo=${g}`}
          scroll={false}
          aria-current={g === grupo ? "page" : undefined}
          className={`flex items-center px-3 text-sm font-medium capitalize ${
            g === grupo ? "text-fg shadow-[inset_0_-2px_0_rgb(var(--accent))]" : "text-dim hover:text-fg"
          }`}
        >
          {g}
        </Link>
      ))}
    </nav>
  );
}
