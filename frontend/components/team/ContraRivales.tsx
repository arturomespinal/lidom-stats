import Link from "next/link";

import TeamBadge from "@/components/TeamBadge";
import { TEAM_SHORT_NAMES } from "@/lib/constants";
import type { TeamProfile } from "@/lib/types";

/**
 * "Contra cada rival": el récord de la temporada contra cada uno de los otros
 * cinco, y la puerta a cada enfrentamiento (/teams/LIC/vs/ESC). Lo cuenta el
 * servidor (src/enfrentamiento.py). Un rival sin juegos todavía sale "Sin
 * juegos" y sin enlace: no hay nada que abrir.
 */
export default function ContraRivales({
  code,
  temporada,
  rivales,
}: {
  code: string;
  temporada: string;
  rivales: TeamProfile["rivals"];
}) {
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-card">
      {rivales.map((r) => {
        const jugados = r.wins + r.losses;
        const contenido = (
          <>
            <TeamBadge code={r.team_code} />
            <span className="flex-1 truncate font-semibold">{TEAM_SHORT_NAMES[r.team_code] ?? r.team_code}</span>
            {jugados > 0 ? (
              <span className="num font-cond text-xl leading-none">
                {r.wins}-{r.losses}
              </span>
            ) : (
              <span className="text-sm text-dim">Sin juegos</span>
            )}
          </>
        );
        return (
          <li key={r.team_code}>
            {jugados > 0 ? (
              <Link
                href={`/teams/${code}/vs/${r.team_code}?season=${temporada}`}
                className="flex min-h-12 items-center gap-3 px-4 py-2 hover:bg-raised"
                aria-label={`${TEAM_SHORT_NAMES[r.team_code] ?? r.team_code}: ${r.wins} ganados, ${r.losses} perdidos. Ver el enfrentamiento`}
              >
                {contenido}
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 text-dim" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </Link>
            ) : (
              <div className="flex min-h-12 items-center gap-3 px-4 py-2">{contenido}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
