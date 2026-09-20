import Link from "next/link";
import TeamBadge from "@/components/TeamBadge";
import { CareerTeam, PlayerBio } from "@/lib/types";
import { DEFAULT_SEASON, TEAM_SHORT_NAMES, TEAM_STYLES } from "@/lib/constants";

interface Props {
  bio: PlayerBio;
  teams: CareerTeam[];
  /** El equipo de la temporada más reciente: da el color de la cabecera. */
  currentTeam: string | null;
}

const MESES = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];

/**
 * "1988-02-08" → "8 feb 1988".
 *
 * Se parte el string a mano en vez de usar `new Date(...)`: una fecha ISO sin
 * hora se interpreta como UTC, y en UTC-4 eso devuelve el día ANTERIOR. Un
 * jugador nacido el 1ro aparecería nacido el 31 del mes pasado.
 */
function fechaEs(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!a || !m || !d) return iso;
  return `${d} ${MESES[m - 1]} ${a}`;
}

/** Un dato de la ficha: etiqueta chica arriba, valor grande abajo. */
function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.08em] text-faint">
        {etiqueta}
      </div>
      <div className="text-sm text-fg mt-0.5">{valor}</div>
    </div>
  );
}

/**
 * Cabecera de la ficha de un jugador.
 *
 * ── El color del equipo entra, pero por el borde ───────────────────────────
 * La paleta no tiene acento de marca, así que sin el color del club esta
 * cabecera sería una caja gris más. El color del equipo actual pinta una
 * franja vertical y el resplandor del fondo: identifica sin competir con el
 * texto, que es lo que pasaría si tiñera la tarjeta entera.
 *
 * ── La lateralidad llega traducida ─────────────────────────────────────────
 * Se pinta `bats_label`, nunca `bats`. Traducir aquí etiquetaría mal a los
 * ambidiestros — ver src/lateralidad.py.
 */
export default function PlayerHeader({ bio, teams, currentTeam }: Props) {
  const color = currentTeam ? TEAM_STYLES[currentTeam]?.primary : undefined;

  const fisico = [
    bio.height_cm ? `${bio.height_cm} cm` : null,
    bio.weight_kg ? `${bio.weight_kg} kg` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <header className="relative overflow-hidden rounded-xl border border-line bg-card">
      {color && (
        <span
          className="absolute inset-y-0 left-0 w-1"
          style={{ backgroundColor: color }}
          aria-hidden="true"
        />
      )}

      <div className="p-5 pl-6">
        <div className="flex items-start gap-4">
          {currentTeam && <TeamBadge code={currentTeam} size="md" variant="solid" />}
          <div className="min-w-0">
            <h1 className="font-cond text-3xl font-bold leading-none tracking-[0.01em] text-fg">
              {bio.full_name.toUpperCase()}
            </h1>
            <p className="mt-1.5 text-xs text-dim">
              {currentTeam
                ? TEAM_SHORT_NAMES[currentTeam] ?? currentTeam
                : "Sin equipo registrado"}
              {bio.nationality ? ` · ${bio.nationality}` : ""}
            </p>
          </div>
        </div>

        {/* Los datos biográficos. Solo se pinta lo que existe: una fila de
            guiones donde la MLB no tiene el dato no informa de nada. */}
        <div className="mt-5 flex flex-wrap gap-x-8 gap-y-3">
          {bio.age != null && <Dato etiqueta="Edad" valor={`${bio.age} años`} />}
          {bio.bats_label && <Dato etiqueta="Batea" valor={bio.bats_label} />}
          {bio.throws_label && <Dato etiqueta="Lanza" valor={bio.throws_label} />}
          {fisico && <Dato etiqueta="Físico" valor={fisico} />}
          {bio.birth_date && (
            <Dato etiqueta="Nacimiento" valor={fechaEs(bio.birth_date)} />
          )}
        </div>

        {/* La trayectoria. Cada teja lleva al equipo, que es lo que uno quiere
            tocar después de leer que jugó cuatro años ahí. */}
        {teams.length > 0 && (
          <div className="mt-5 border-t border-line-soft pt-4">
            <div className="text-[10px] uppercase tracking-[0.08em] text-faint">
              Trayectoria
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {teams.map((t) => (
                <Link
                  key={t.team_code}
                  href={`/teams/${t.team_code}?season=${DEFAULT_SEASON}`}
                  className="flex items-center gap-2 rounded-lg border border-line bg-raised px-2 py-1.5 transition-colors hover:border-fg2"
                >
                  <TeamBadge code={t.team_code} size="sm" />
                  <span className="num text-[11px] text-fg2">
                    {t.first_season === t.last_season
                      ? t.first_season
                      : `${t.first_season.slice(0, 4)}–${t.last_season.slice(5)}`}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
