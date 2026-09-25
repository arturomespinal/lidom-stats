import Link from "next/link";
import TeamBadge from "@/components/TeamBadge";
import { DEFAULT_SEASON } from "@/lib/constants";
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

interface Props<T> {
  titulo: string;
  temporadas: (T & { season_id: string; team_code: string })[];
  carrera: (T & { seasons: number }) | null;
  cols: Col<T>[];
}

function Tabla<T>({ titulo, temporadas, carrera, cols }: Props<T>) {
  return (
    <section>
      <h2 className="mb-2 font-cond text-lg font-bold tracking-[0.02em] text-fg">
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
            {temporadas.map((f, i) => (
              <tr
                key={`${f.season_id}-${f.team_code}-${i}`}
                className="border-b border-line-soft last:border-0 hover:bg-raised"
              >
                <td className="num sticky left-0 z-10 bg-card px-3 py-2 text-left text-fg2">
                  {f.season_id}
                </td>
                <td className="px-2 py-2">
                  <Link
                    href={`/teams/${f.team_code}?season=${DEFAULT_SEASON}`}
                    className="inline-block"
                  >
                    <TeamBadge code={f.team_code} size="sm" />
                  </Link>
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
            ))}
          </tbody>

          {/* La carrera va en <tfoot> y no como una fila más: es de otra
              naturaleza —no es una temporada— y el lector tiene que poder
              distinguirla sin leer la etiqueta. */}
          {carrera && (
            <tfoot>
              <tr className="border-t-2 border-line bg-header font-semibold">
                <td className="sticky left-0 z-10 bg-header px-3 py-2.5 text-left text-fg">
                  Carrera
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
            </tfoot>
          )}
        </table>
      </div>
    </section>
  );
}

export function BattingSeasons({
  temporadas,
  carrera,
}: {
  temporadas: PlayerBattingSeason[];
  carrera: CareerBatting | null;
}) {
  return (
    <Tabla<FilaBateo>
      titulo="Bateo"
      temporadas={temporadas}
      carrera={carrera}
      cols={COLS_BATEO}
    />
  );
}

export function PitchingSeasons({
  temporadas,
  carrera,
}: {
  temporadas: PlayerPitchingSeason[];
  carrera: CareerPitching | null;
}) {
  return (
    <Tabla<FilaPitcheo>
      titulo="Pitcheo"
      temporadas={temporadas}
      carrera={carrera}
      cols={COLS_PITCHEO}
    />
  );
}
