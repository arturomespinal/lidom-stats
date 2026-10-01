import Link from "next/link";
import TeamBadge from "@/components/TeamBadge";
import { entradas } from "@/lib/formato";
import {
  CareerBatting,
  CareerPitching,
  PlayerBattingSeason,
  PlayerPitchingSeason,
} from "@/lib/types";

/** Promedio en convención de béisbol: .316, no 0.316. */
function pct(v: number | null | undefined): string {
  if (v == null) return "—";
  return v >= 1 ? v.toFixed(3) : v.toFixed(3).slice(1);
}

function num(v: number | null | undefined, dec = 0): string {
  if (v == null) return "—";
  return v.toFixed(dec);
}

/* Las columnas se declaran como datos y no como JSX repetido: la cabecera, el
   cuerpo y la fila de totales tienen que ir en el mismo orden, y con tres
   listas separadas es cuestión de tiempo que una se desincronice. */
interface Col<T> {
  /** Sigla oficial. Es lo que un fanático de béisbol busca con la vista. */
  k: string;
  /** Nombre largo, para el tooltip: no todo el mundo sabe qué es OPS. */
  t: string;
  val: (f: T) => string;
  /** Las tasas van un punto más claras: son el dato que se compara. */
  fuerte?: boolean;
}

/* Una temporada y la carrera comparten columnas pero no forma: la carrera no
   tiene `season_id` ni `team_code`. La unión es lo que deja que las mismas
   dieciséis definiciones sirvan para el cuerpo y para el pie. */
type FilaBateo = PlayerBattingSeason | CareerBatting;
type FilaPitcheo = PlayerPitchingSeason | CareerPitching;

const COLS_BATEO: Col<FilaBateo>[] = [
  { k: "J", t: "Juegos", val: (f) => String(f.games) },
  { k: "AP", t: "Apariciones al plato", val: (f) => String(f.pa) },
  { k: "VB", t: "Veces al bate", val: (f) => String(f.ab) },
  { k: "H", t: "Hits", val: (f) => String(f.h) },
  { k: "2B", t: "Dobles", val: (f) => String(f.doubles) },
  { k: "3B", t: "Triples", val: (f) => String(f.triples) },
  { k: "HR", t: "Jonrones", val: (f) => String(f.hr) },
  { k: "CA", t: "Carreras anotadas", val: (f) => String(f.r) },
  { k: "CI", t: "Carreras impulsadas", val: (f) => String(f.rbi) },
  { k: "BR", t: "Bases robadas", val: (f) => String(f.sb) },
  { k: "BB", t: "Bases por bolas", val: (f) => String(f.bb) },
  { k: "K", t: "Ponches", val: (f) => String(f.so) },
  { k: "AVG", t: "Promedio de bateo", val: (f) => pct(f.avg), fuerte: true },
  { k: "OBP", t: "Porcentaje de embasado", val: (f) => pct(f.obp), fuerte: true },
  { k: "SLG", t: "Slugging", val: (f) => pct(f.slg), fuerte: true },
  { k: "OPS", t: "OBP + SLG", val: (f) => pct(f.ops), fuerte: true },
];

const COLS_PITCHEO: Col<FilaPitcheo>[] = [
  { k: "J", t: "Juegos", val: (f) => String(f.games) },
  { k: "JI", t: "Juegos iniciados", val: (f) => String(f.games_started) },
  { k: "G", t: "Ganados", val: (f) => String(f.wins) },
  { k: "P", t: "Perdidos", val: (f) => String(f.losses) },
  { k: "SV", t: "Salvados", val: (f) => String(f.saves) },
  { k: "IP", t: "Entradas lanzadas", val: (f) => entradas(f.innings_pitched) },
  { k: "H", t: "Hits permitidos", val: (f) => String(f.h) },
  { k: "CL", t: "Carreras limpias", val: (f) => String(f.er) },
  { k: "BB", t: "Bases por bolas", val: (f) => String(f.bb) },
  { k: "K", t: "Ponches", val: (f) => String(f.so) },
  { k: "EFE", t: "Efectividad (ERA)", val: (f) => num(f.era, 2), fuerte: true },
  { k: "WHIP", t: "Embasados por entrada", val: (f) => num(f.whip, 2), fuerte: true },
];

/** Lo que traen de más las filas de DIGIMETRICS (antes de 2012-13). */
interface ExtraHistorico {
  stage?: string;
  team_name?: string | null;
}

type Fila<T> = T & { season_id: string; team_code: string } & ExtraHistorico;

interface Props<T> {
  titulo: string;
  temporadas: Fila<T>[];
  carrera: (T & { seasons: number }) | null;
  cols: Col<T>[];
  /** Temporadas de DIGIMETRICS, debajo de las de la MLB API. */
  historicas?: Fila<T>[];
  /**
   * La franja que separa las dos fuentes. null para no ponerla (la ficha de
   * un histórico solo tiene filas de DIGIMETRICS).
   */
  separador?: string | null;
  /** Rótulo de la fila de totales: "Carrera", o "Carrera completa" si suma las dos fuentes. */
  etiquetaCarrera?: string;
  /** Una segunda fila de totales: la postemporada, en la ficha de un histórico. */
  postemporada?: (T & { seasons: number }) | null;
}

/** Las etapas que no son la regular llevan una marca junto a la temporada. */
const ETAPA: Record<string, string> = { round_robin: "RR", final: "Final" };

function Tabla<T>({
  titulo,
  temporadas,
  carrera,
  cols,
  historicas = [],
  separador = "Antes de 2012-13 · DIGIMETRICS",
  etiquetaCarrera = "Carrera",
  postemporada = null,
}: Props<T>) {
  const fila = (f: Fila<T>, i: number, historica: boolean) => (
    <tr
      key={`${historica ? "h" : ""}${f.season_id}-${f.team_code}-${f.stage ?? ""}-${i}`}
      className="border-b border-line-soft last:border-0 hover:bg-raised"
    >
      <td className="num sticky left-0 z-10 whitespace-nowrap bg-card px-3 py-2 text-left text-fg2">
        {f.season_id}
        {f.stage && ETAPA[f.stage] && (
          <span className="ml-1.5 rounded bg-header px-1 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-dim">
            {ETAPA[f.stage]}
          </span>
        )}
      </td>
      <td className="px-2 py-2">
        {historica ? (
          // De los años de DIGIMETRICS no hay ficha de equipo: la teja va
          // sin enlace, con el nombre de esa época en el tooltip
          // ("Azucareros del Este").
          <span className="inline-block" title={f.team_name ?? undefined}>
            <TeamBadge code={f.team_code} size="sm" />
          </span>
        ) : (
          <Link
            // El equipo EN ESA temporada, como en el móvil: desde la
            // fila de 2016-17 uno quiere ver aquel roster, no el de hoy.
            href={`/teams/${f.team_code}?season=${f.season_id}`}
            className="inline-block"
          >
            <TeamBadge code={f.team_code} size="sm" />
          </Link>
        )}
      </td>
      {cols.map((c) => (
        <td
          key={c.k}
          className={`num px-2 py-2 text-right ${
            c.fuerte ? "font-medium text-fg" : "text-fg2"
          }`}
        >
          {c.val(f)}
        </td>
      ))}
    </tr>
  );

  return (
    <section>
      <h2 className="mb-3 font-cond text-2xl leading-none tracking-[0.02em] text-fg">
        {titulo}
      </h2>

      {/* overflow-x-auto y no una tabla que se encoja: con dieciséis columnas,
          repartir el ancho de un teléfono deja cada número en dos líneas. Es
          preferible desplazar. */}
      <div className="overflow-x-auto rounded-xl border border-line bg-card">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-line bg-header text-[11px] uppercase tracking-[0.06em] text-dim">
              <th className="sticky left-0 z-10 bg-header px-3 py-2.5 text-left font-medium">
                Temp.
              </th>
              <th className="px-2 py-2.5 text-left font-medium">Eq.</th>
              {cols.map((c) => (
                <th
                  key={c.k}
                  title={c.t}
                  className="px-2 py-2.5 text-right font-medium"
                >
                  {c.k}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {temporadas.map((f, i) => fila(f, i, false))}
            {historicas.length > 0 && separador && (
              <tr className="border-b border-line-soft bg-header">
                {/* La franja que separa las fuentes ocupa la fila entera: en
                    una sola celda de la primera columna, su texto la
                    ensanchaba para toda la tabla. El rótulo va `sticky` para
                    quedarse a la vista al desplazar. */}
                <td colSpan={cols.length + 2} className="px-0 py-1.5">
                  <span className="sticky left-0 whitespace-nowrap px-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-dim">
                    {separador}
                  </span>
                </td>
              </tr>
            )}
            {historicas.map((f, i) => fila(f, i, true))}
          </tbody>

          {/* La carrera va en <tfoot> y no como una fila más: es de otra
              naturaleza —no es una temporada— y el lector tiene que poder
              distinguirla sin leer la etiqueta. */}
          {carrera && (
            <tfoot>
              <tr className="border-t-2 border-line bg-header font-semibold">
                <td className="sticky left-0 z-10 whitespace-nowrap bg-header px-3 py-2.5 text-left text-fg">
                  {etiquetaCarrera}
                </td>
                <td className="num px-2 py-2.5 text-left text-[11px] text-dim">
                  {carrera.seasons}T
                </td>
                {cols.map((c) => (
                  <td key={c.k} className="num px-2 py-2.5 text-right text-fg">
                    {c.val(carrera)}
                  </td>
                ))}
              </tr>
              {postemporada && (
                <tr className="border-t border-line bg-header text-fg2">
                  <td className="sticky left-0 z-10 bg-header px-3 py-2 text-left">Postemporada</td>
                  <td className="num px-2 py-2 text-left text-[11px] text-dim">{postemporada.seasons}T</td>
                  {cols.map((c) => (
                    <td key={c.k} className="num px-2 py-2 text-right">
                      {c.val(postemporada)}
                    </td>
                  ))}
                </tr>
              )}
            </tfoot>
          )}
        </table>
      </div>
    </section>
  );
}

/** Lo que las dos tablas aceptan además de las temporadas de la MLB API. */
interface Opcionales<T, C> {
  historicas?: (T & ExtraHistorico)[];
  separador?: string | null;
  etiquetaCarrera?: string;
  postemporada?: C | null;
}

export function BattingSeasons({
  temporadas,
  carrera,
  ...resto
}: {
  temporadas: PlayerBattingSeason[];
  carrera: CareerBatting | null;
} & Opcionales<PlayerBattingSeason, CareerBatting>) {
  return (
    <Tabla<FilaBateo>
      titulo="Bateo"
      temporadas={temporadas}
      carrera={carrera}
      cols={COLS_BATEO}
      {...resto}
    />
  );
}

export function PitchingSeasons({
  temporadas,
  carrera,
  ...resto
}: {
  temporadas: PlayerPitchingSeason[];
  carrera: CareerPitching | null;
} & Opcionales<PlayerPitchingSeason, CareerPitching>) {
  return (
    <Tabla<FilaPitcheo>
      titulo="Pitcheo"
      temporadas={temporadas}
      carrera={carrera}
      cols={COLS_PITCHEO}
      {...resto}
    />
  );
}
