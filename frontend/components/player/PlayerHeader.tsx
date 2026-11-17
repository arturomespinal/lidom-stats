import Link from "next/link";

import Heroe, { CifraHeroe, ColumnaHeroe, FilaCifras, NombreHeroe } from "@/components/ficha/Heroe";
import Monograma from "@/components/ficha/Monograma";
import type { PlayerBio, PlayerContext } from "@/lib/types";
import { TEAM_SHORT_NAMES, TEAM_STYLES } from "@/lib/constants";
import { entradas, fechaEs, num, pct3 } from "@/lib/formato";

interface Props {
  bio: PlayerBio;
  /** El equipo de la temporada más reciente: da el color del plano. */
  currentTeam: string | null;
  context: PlayerContext | null;
}

/**
 * Cabecera de la ficha de un jugador: la franja oscura con el plano del club y
 * el monograma en el lugar de la foto. Misma cabecera que la del móvil.
 *
 * Las cuatro cifras son de su ÚLTIMA temporada, con los equipos sumados si lo
 * cambiaron a mitad de campaña (`context.latest`, compuesto en el servidor):
 * lo primero que uno pregunta de un jugador es cómo le fue este año. La
 * carrera entera está en el pie de la tabla.
 *
 * La lateralidad llega traducida (`bats_label`): el cliente nunca traduce
 * 'S', ver src/lateralidad.py.
 */
export default function PlayerHeader({ bio, currentTeam, context }: Props) {
  const color = (currentTeam && TEAM_STYLES[currentTeam]?.primary) || "#56637A";
  const n = (k: string): number | null => {
    const v = context?.latest[k];
    return typeof v === "number" ? v : null;
  };

  const fisico = [bio.height_cm ? `${bio.height_cm} cm` : null, bio.weight_kg ? `${bio.weight_kg} kg` : null]
    .filter(Boolean)
    .join(" · ");
  const linea1 = [
    bio.age != null ? `${bio.age} años` : null,
    bio.bats_label ? `batea ${bio.bats_label.toLowerCase()}` : null,
    bio.throws_label ? `lanza ${bio.throws_label.toLowerCase()}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const linea2 = [bio.birth_date ? fechaEs(bio.birth_date) : null, bio.nationality, fisico || null]
    .filter(Boolean)
    .join(" · ");

  return (
    <Heroe color={color} lado={<Monograma nombre={bio.full_name} />}>
      <ColumnaHeroe>
        <p className="truncate text-[11px] uppercase tracking-[0.08em] text-ink-dim">
          {[currentTeam ? TEAM_SHORT_NAMES[currentTeam] ?? currentTeam : "Sin equipo registrado", context?.latest.season_id]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <NombreHeroe>{bio.full_name}</NombreHeroe>
        {linea1 && <p className="text-[13px] leading-snug text-ink-dim sm:text-sm">{linea1}</p>}
        {linea2 && <p className="text-[13px] leading-snug text-ink-dim sm:text-sm">{linea2}</p>}
        {/* A la página de comparar, con este jugador ya puesto a la izquierda. */}
        <div className="pt-1">
          <Link
            href={`/comparar?a=${encodeURIComponent(bio.player_id)}`}
            className="tocable inline-flex min-h-11 items-center gap-2 rounded-lg border border-ink-fg/25 px-3 text-sm font-semibold text-ink-fg hover:bg-ink-fg/10"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M8 4v16M16 4v16M3 9h5M16 15h5" />
            </svg>
            Comparar
          </Link>
        </div>
      </ColumnaHeroe>

      {context && (
        <FilaCifras titulo={`Temporada ${context.latest.season_id}`}>
          {context.role === "batting" ? (
            <>
              <CifraHeroe valor={pct3(n("ops"))} etiqueta="OPS" />
              <CifraHeroe valor={num(n("hr"))} etiqueta="HR" />
              <CifraHeroe valor={num(n("rbi"))} etiqueta="CI" />
              <CifraHeroe valor={pct3(n("avg"))} etiqueta="AVG" />
            </>
          ) : (
            <>
              <CifraHeroe valor={num(n("era"), 2)} etiqueta="EFE" />
              <CifraHeroe valor={`${num(n("wins"))}-${num(n("losses"))}`} etiqueta="G-P" />
              <CifraHeroe valor={num(n("so"))} etiqueta="K" />
              <CifraHeroe valor={entradas(n("innings_pitched"))} etiqueta="IP" />
            </>
          )}
        </FilaCifras>
      )}
    </Heroe>
  );
}
