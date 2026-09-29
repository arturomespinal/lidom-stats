import Heroe, { CifraHeroe, ColumnaHeroe, FilaCifras, NombreHeroe } from "@/components/ficha/Heroe";
import type { TeamProfile } from "@/lib/types";
import { TEAM_STYLES } from "@/lib/constants";
import { conSigno, pct3 } from "@/lib/formato";

/**
 * Cabecera de la ficha de un equipo: la franja navy con el plano del club y
 * su código gigante tono sobre tono. Misma cabecera que la del móvil.
 *
 * El récord grande es el de la temporada ELEGIDA, no el de la más reciente:
 * la cabecera tiene que hablar del mismo año que todo lo que hay debajo. El
 * puesto y la distancia ("1ro · 5 juegos de ventaja") los compone el
 * servidor (src/banderin.py).
 */
export default function TeamHeader({ equipo }: { equipo: TeamProfile }) {
  const code = equipo.team_code;
  const color = TEAM_STYLES[code]?.primary ?? "#56637A";
  const actual = equipo.history.find((f) => f.season_id === equipo.season_id);

  // G y P son conteos: sumarlos aquí es seguro. Las TASAS nunca se promedian
  // en el cliente — el PCT histórico sale de los totales.
  const totalG = equipo.history.reduce((a, f) => a + f.wins, 0);
  const totalP = equipo.history.reduce((a, f) => a + f.losses, 0);
  const [puesto, distancia] = equipo.standing?.label.split(" · ") ?? [];

  return (
    <Heroe color={color} marca={code}>
      <ColumnaHeroe>
        <p className="truncate text-[11px] uppercase tracking-[0.08em] text-ink-dim">
          {[equipo.city, equipo.founded_year && `desde ${equipo.founded_year}`].filter(Boolean).join(" · ")}
        </p>
        <NombreHeroe>{equipo.team_name}</NombreHeroe>
      </ColumnaHeroe>

      {actual && (
        <div className="mt-4 flex flex-wrap items-end gap-x-5 gap-y-2">
          <div
            className="num font-cond text-[84px] leading-[0.85] text-ink-fg sm:text-[104px]"
            aria-label={`${actual.wins} ganados, ${actual.losses} perdidos en ${equipo.season_id}`}
          >
            {actual.wins}-{actual.losses}
          </div>
          {puesto && (
            <div className="space-y-1.5 pb-1.5">
              <span className="inline-block rounded-md bg-ink-fg px-2 py-1 font-cond text-lg leading-none tracking-[0.02em] text-ink">
                {puesto} · {equipo.season_id}
              </span>
              {distancia && <p className="text-[13px] text-ink-dim">{distancia}</p>}
            </div>
          )}
        </div>
      )}

      <FilaCifras>
        {actual && <CifraHeroe valor={pct3(actual.win_pct)} etiqueta="PCT" />}
        {/* El signo va escrito: sobre el navy no hay verde ni rojo que valga. */}
        {actual && <CifraHeroe valor={conSigno(actual.run_diff)} etiqueta="Diferencial" />}
        <CifraHeroe valor={`${totalG}-${totalP}`} etiqueta={`${equipo.seasons_count} temporadas`} />
      </FilaCifras>
    </Heroe>
  );
}
