"use client";

import { useState } from "react";
import Link from "next/link";

import TeamBadge from "@/components/TeamBadge";

/**
 * En el teléfono la columna del nombre se queda fija y las cifras se deslizan
 * por debajo: una raya fina en su borde derecho dice dónde termina.
 */
const RAYA = "max-sm:shadow-[1px_0_0_rgb(var(--line))]";

/** Lo que toda fila de líderes trae, sea de bateo o de pitcheo. */
interface FilaBase {
  player: string;
  /** Slug de la ficha; null si el jugador no está en el esquema de juego. */
  player_id: string | null;
  team_id: string;
  games: number;
}

export interface ColumnaLideres<T> {
  key: keyof T & string;
  label: string;
  title: string;
  /** En esta columna, menos es mejor: el primer clic ordena de menor a mayor. */
  asc?: boolean;
  /** Cómo se escribe la cifra. Sin esto, tal cual. */
  fmt?: (v: number | null) => string;
}

/**
 * La tabla de líderes de Bateo y de Pitcheo: una sola, para que las dos se
 * vean y se comporten igual.
 *
 * ── En el teléfono (11-nov-2026) ───────────────────────────────────────────
 * A 390 px la tabla de antes mostraba el nombre, el equipo, los juegos y UNA
 * cifra; la columna por la que estaba ordenada (OPS, efectividad) quedaba
 * fuera de la pantalla, cortada por el borde, y la lista parecía desordenada.
 * Ahora:
 *
 * - El equipo y los juegos bajan a una línea bajo el nombre ("EST · 38 J").
 *   El código va escrito: el color solo no identifica a un club.
 * - Caben las cuatro primeras cifras, y entre ellas la del orden de partida.
 * - El nombre se queda fijo al deslizar hacia las demás columnas: una cifra
 *   sin saber de quién es no sirve.
 *
 * Desde `sm` es la tabla ancha de siempre, con su columna de equipo.
 *
 * ── El orden ───────────────────────────────────────────────────────────────
 * La columna elegida va en tinta y seminegrita y el resto en gris: se ve por
 * cuál está ordenada sin buscar la flecha. El puesto de la izquierda es el de
 * ese orden. Quien no tiene dato va al final en los dos sentidos.
 *
 * Las cifras van en la fuente del texto con ancho tabular (`num`), como en
 * Posiciones y en las fichas. Antes iban en monoespaciada, la única tabla de
 * la app con otra letra.
 */
export default function TablaLideres<T extends FilaBase>({
  data,
  columnas,
  inicial,
  titulo,
  temporada,
  extra,
}: {
  data: T[];
  columnas: ColumnaLideres<T>[];
  /** La columna por la que abre ordenada. */
  inicial: keyof T & string;
  /** El encabezado de la columna del nombre: "Jugador", "Lanzador". */
  titulo: string;
  /** La temporada de la tabla: la teja del equipo abre su ficha en ella. */
  temporada?: string;
  /** Una columna fija más después de los juegos (las aperturas, en pitcheo). */
  extra?: { label: string; title: string; corto: string; valor: (fila: T) => number };
}) {
  const [orden, setOrden] = useState<keyof T & string>(inicial);
  const [asc, setAsc] = useState(columnas.find((c) => c.key === inicial)?.asc ?? false);

  const elegir = (col: ColumnaLideres<T>) => {
    if (col.key === orden) setAsc((a) => !a);
    else {
      setOrden(col.key);
      setAsc(col.asc ?? false);
    }
  };

  const filas = [...data].sort((a, b) => {
    const av = a[orden] as number | null;
    const bv = b[orden] as number | null;
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    return asc ? av - bv : bv - av;
  });

  const fija = "px-3 py-3 text-center text-xs uppercase tracking-wider text-dim";

  return (
    <div className="table-scroll overflow-x-auto rounded-lg border border-line">
      <table className="w-full whitespace-nowrap text-sm">
        <thead>
          <tr className="bg-header">
            <th className={`sticky left-0 z-[1] bg-header py-3 pl-2 pr-2 text-left text-xs uppercase tracking-wider text-dim sm:px-4 ${RAYA}`}>
              <span className="inline-block w-5 text-center sm:w-7">#</span>
              <span className="pl-1">{titulo}</span>
            </th>
            <th className={`hidden sm:table-cell ${fija}`}>Equipo</th>
            <th className={`hidden sm:table-cell ${fija}`} title="Juegos jugados">
              JJ
            </th>
            {extra && (
              <th className={`hidden sm:table-cell ${fija}`} title={extra.title}>
                {extra.label}
              </th>
            )}
            {columnas.map((col) => {
              const activa = col.key === orden;
              return (
                <th
                  key={col.key}
                  title={col.title}
                  aria-sort={activa ? (asc ? "ascending" : "descending") : "none"}
                  className={`p-0 ${activa ? "bg-raised shadow-[inset_0_-2px_0_rgb(var(--accent))]" : ""}`}
                >
                  {/* Un botón de verdad: se llega con el teclado y lo anuncia
                      el lector de pantalla. 44 px de alto para el pulgar. */}
                  <button
                    type="button"
                    onClick={() => elegir(col)}
                    className={`flex min-h-11 w-full items-center justify-center gap-0.5 px-[5px] text-xs uppercase tracking-wider transition-colors sm:px-3 ${
                      activa ? "font-semibold text-fg" : "text-dim hover:text-fg"
                    }`}
                  >
                    {col.label}
                    {activa && (
                      <span className="text-[10px]" aria-hidden="true">
                        {asc ? "↑" : "↓"}
                      </span>
                    )}
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {filas.map((row, i) => (
            <tr key={row.player_id ?? `${row.player}-${i}`} className="group border-t border-line bg-card">
              <td className={`sticky left-0 z-[1] bg-card py-2 pl-2 pr-2 group-hover:bg-raised sm:px-4 sm:py-2.5 ${RAYA}`}>
                <span className="flex items-center">
                  <span className="num w-5 shrink-0 text-center text-xs text-dim sm:w-7">{i + 1}</span>
                  <span className="min-w-0 pl-1">
                    {/* El nombre lleva a la ficha: todas las temporadas del
                        hombre, no solo esta. Sin slug, texto quieto. */}
                    {row.player_id ? (
                      <Link
                        href={`/players/${row.player_id}`}
                        className="block max-w-[8.25rem] truncate font-medium text-fg underline-offset-2 hover:underline sm:max-w-none"
                      >
                        {row.player}
                      </Link>
                    ) : (
                      <span className="block max-w-[8.25rem] truncate font-medium sm:max-w-none">{row.player}</span>
                    )}
                    <span className="num block text-[11px] leading-tight text-dim sm:hidden">
                      {row.team_id} · {row.games} J{extra ? ` · ${extra.valor(row)} ${extra.corto}` : ""}
                    </span>
                  </span>
                </span>
              </td>
              <td className="hidden px-3 py-2.5 text-center group-hover:bg-raised sm:table-cell">
                <Link
                  href={`/teams/${row.team_id}${temporada ? `?season=${temporada}` : ""}`}
                  className="inline-block"
                  aria-label={`Ver ${row.team_id}`}
                >
                  <TeamBadge code={row.team_id} />
                </Link>
              </td>
              <td className="num hidden px-3 py-2.5 text-center text-dim group-hover:bg-raised sm:table-cell">
                {row.games}
              </td>
              {extra && (
                <td className="num hidden px-3 py-2.5 text-center text-dim group-hover:bg-raised sm:table-cell">
                  {extra.valor(row)}
                </td>
              )}
              {columnas.map((col) => {
                const v = row[col.key] as number | null;
                return (
                  <td
                    key={col.key}
                    className={`num px-[5px] py-2 text-center group-hover:bg-raised sm:px-3 sm:py-2.5 ${
                      col.key === orden ? "bg-raised/60 font-semibold text-fg" : "text-fg2"
                    }`}
                  >
                    {col.fmt ? col.fmt(v) : (v ?? "—")}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
