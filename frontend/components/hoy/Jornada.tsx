import Link from "next/link";

import StatusBadge from "@/components/StatusBadge";
import TeamBadge from "@/components/TeamBadge";
import WinProbBand from "@/components/game/WinProbBand";
import { TEAM_SHORT_NAMES } from "@/lib/constants";
import type {
  DiaFranja,
  EstadoJornada,
  FiguraJornada,
  Jornada,
  JuegoJornada,
  LiveStatus,
} from "@/lib/types";

/*
 * Las piezas de la portada "Hoy" en la web. Mismas piezas que
 * mobile/src/components/Jornada.tsx. Todo lo que dice algo —qué juego se
 * destaca, su titular, quiénes son las figuras— lo decide el servidor
 * (src/jornada.py); aquí solo se dibuja.
 */

function estadoBadge(st: EstadoJornada): LiveStatus {
  if (st === "live") return "live";
  if (st === "final") return "final";
  if (st === "scheduled") return "preview";
  return "other";
}

/**
 * A dónde lleva un juego: al detalle en vivo si la caché lo tiene (relato,
 * línea por entradas); si ya terminó, a su página armada desde la base. Un
 * juego que no ha empezado no lleva a ningún lado todavía.
 */
export function enlaceJuego(j: JuegoJornada): string | null {
  if (j.has_detail && j.game_pk) return `/live/${j.game_pk}`;
  if (j.status === "final") return `/juegos/${j.game_id}`;
  return null;
}

// ── La franja de fechas ─────────────────────────────────────────────────────

/**
 * Siete días con la jornada en el centro, como enlaces: la fecha vive en la
 * URL (`?fecha=`), así se puede compartir una jornada y el botón de atrás
 * funciona. Un día sin juegos no es enlace: el servidor lo resolvería a otra
 * fecha y el clic parecería no hacer caso.
 */
export function FranjaFechas({ dias, activa }: { dias: DiaFranja[]; activa: string }) {
  return (
    <nav aria-label="Fecha" className="sticky top-14 z-[5] border-b border-line bg-bg/95 backdrop-blur">
      <div className="mx-auto grid max-w-5xl grid-cols-7 gap-1 px-4 py-2">
        {dias.map((d) => {
          const es = d.date === activa;
          const vacio = d.games === 0;
          const [dia, num] = d.label.split(" ");
          const cuerpo = (
            <>
              <span className={`text-[11px] ${es ? "text-ink-fg" : "text-dim"}`}>{dia}</span>
              <span className={`font-cond text-[22px] leading-none ${es ? "text-ink-fg" : "text-fg"}`}>{num}</span>
              <span className={`num text-[10px] ${es ? "text-ink-dim" : "text-dim"}`}>
                {vacio ? "—" : `${d.games} ${d.games === 1 ? "juego" : "juegos"}`}
              </span>
            </>
          );
          const clase = `flex min-h-[60px] flex-col items-center justify-center gap-0.5 rounded-lg ${
            es ? "bg-ink" : vacio ? "opacity-45" : "hover:bg-raised"
          }`;
          if (vacio || es) {
            return (
              <div key={d.date} className={clase} aria-current={es ? "date" : undefined}>
                {cuerpo}
              </div>
            );
          }
          return (
            <Link key={d.date} href={`/?fecha=${d.date}`} className={`tocable ${clase}`} aria-label={`${d.label}, ${d.games} juegos`}>
              {cuerpo}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

// ── Las filas de equipo ────────────────────────────────────────────────────

/**
 * Teja y nombre son un solo enlace a la ficha del equipo, en la temporada del
 * juego: un juego de 2016 abre el equipo de 2016. El marcador queda fuera.
 */
function FilaEquipo({
  lado,
  gano,
  perdio,
  grande = false,
  temporada,
}: {
  lado: JuegoJornada["home"];
  gano: boolean;
  perdio: boolean;
  grande?: boolean;
  temporada?: string | null;
}) {
  return (
    <div className={`flex items-center gap-3 ${grande ? "min-h-[56px]" : "min-h-10"}`}>
      <Link
        href={`/teams/${lado.code}${temporada ? `?season=${temporada}` : ""}`}
        className="group flex min-w-0 flex-1 items-center gap-3"
        aria-label={`Abrir ${lado.name}`}
      >
        <TeamBadge code={lado.code} size={grande ? "md" : "sm"} variant={grande ? "solid" : "outline"} />
        <span
          className={`min-w-0 flex-1 truncate font-semibold group-hover:underline ${grande ? "text-lg" : "text-[15px]"} ${
            perdio ? "text-dim" : "text-fg"
          }`}
        >
          {grande ? lado.name : lado.short_name}
        </span>
      </Link>
      {lado.runs != null && (
        <span
          className={`num font-cond leading-none ${grande ? "text-[52px]" : "text-[32px]"} ${
            perdio ? "text-dim" : "text-fg"
          }`}
        >
          {lado.runs}
        </span>
      )}
      {/* El ganador lleva la marca escrita, no solo el tono. */}
      <span className="w-3 text-xs text-fg" aria-label={gano ? "ganador" : undefined}>
        {gano ? "◂" : ""}
      </span>
    </div>
  );
}

function Decisiones({ d }: { d: NonNullable<JuegoJornada["decisions"]> }) {
  const partes = [
    ["G", "Ganador", d.win],
    ["P", "Perdedor", d.loss],
    ["SV", "Salvado", d.save],
  ] as const;
  return (
    <p className="flex flex-wrap gap-x-4 gap-y-1 px-4 pb-3 text-[13px] text-fg2">
      {partes.map(([sigla, nombre, p]) =>
        p ? (
          <Link key={sigla} href={`/players/${p.player_id}`} className="hover:underline" title={nombre}>
            <b className="text-fg">{sigla}</b> {p.full_name}
          </Link>
        ) : null,
      )}
    </p>
  );
}

/** La franja navy de contexto, el pie de tarjeta del kit. */
function Banda({
  venue,
  href,
  accion = "Ver el juego ›",
}: {
  venue: string | null;
  href: string | null;
  accion?: string;
}) {
  return (
    <div className="flex min-h-11 items-center gap-3 bg-ink px-4">
      <span className="min-w-0 flex-1 truncate text-[10px] uppercase tracking-[0.08em] text-ink-dim">
        {venue ?? "Estadio por confirmar"}
      </span>
      {href && (
        <Link href={href} className="font-cond text-base tracking-[0.04em] text-ink-fg hover:underline">
          {accion}
        </Link>
      )}
    </div>
  );
}

// ── El destacado ───────────────────────────────────────────────────────────

export function TarjetaDestacado({
  juego,
  destacado,
  etiqueta = "Juego destacado",
  href,
  accion,
}: {
  juego: JuegoJornada;
  destacado: Pick<NonNullable<Jornada["featured"]>, "headline" | "win_prob">;
  /** Lo que dice arriba a la izquierda. En la página del juego, la fecha. */
  etiqueta?: string;
  /** A dónde lleva la franja navy. Por defecto, `enlaceJuego`. */
  href?: string | null;
  accion?: string;
}) {
  const wp = destacado.win_prob;
  const perdio = (code: string) => !!juego.winner && juego.winner !== code;
  return (
    <article className="overflow-hidden rounded-xl border border-line bg-card">
      <div className="flex items-center justify-between gap-2 px-4 pt-3">
        <span className="text-[11px] uppercase tracking-[0.08em] text-dim">{etiqueta}</span>
        <StatusBadge status={estadoBadge(juego.status)} label={juego.status_label} />
      </div>
      <div className="px-4 pb-1 pt-2">
        <FilaEquipo lado={juego.away} gano={juego.winner === juego.away.code} perdio={perdio(juego.away.code)} grande temporada={juego.season_id} />
        <FilaEquipo lado={juego.home} gano={juego.winner === juego.home.code} perdio={perdio(juego.home.code)} grande temporada={juego.season_id} />
        {juego.status === "scheduled" && juego.time_local && (
          <p className="mt-1 font-cond text-3xl text-fg">{juego.time_local}</p>
        )}
      </div>
      {wp && (
        <div className="px-4 pt-2">
          {/* El titular va una sola vez, abajo y en negrita. */}
          <WinProbBand
            points={wp.points}
            current={wp.current}
            homeCode={wp.home_team}
            awayCode={wp.away_team}
            headline={null}
          />
        </div>
      )}
      {destacado.headline && (
        <p className="px-4 pt-3 text-[15px] font-bold leading-snug text-fg">{destacado.headline}</p>
      )}
      <div className="pt-2">{juego.decisions && <Decisiones d={juego.decisions} />}</div>
      <Banda venue={juego.venue} href={href === undefined ? enlaceJuego(juego) : href} accion={accion} />
    </article>
  );
}

// ── Un resultado ───────────────────────────────────────────────────────────

/**
 * Una tarjeta chica por juego. "Ver el juego" si hay algo que abrir: el
 * detalle en vivo o, si ya terminó, su página con el boxscore.
 */
export function TarjetaJuego({ juego }: { juego: JuegoJornada }) {
  const perdio = (code: string) => !!juego.winner && juego.winner !== code;
  const href = enlaceJuego(juego);
  return (
    <article className="overflow-hidden rounded-xl border border-line bg-card">
      <div className="flex items-center justify-between gap-2 px-4 pt-3">
        <span className="truncate text-[11px] uppercase tracking-[0.08em] text-dim">
          {juego.venue ?? "Estadio por confirmar"}
        </span>
        <StatusBadge status={estadoBadge(juego.status)} label={juego.status_label} />
      </div>
      <div className="px-4 pb-3 pt-1">
        <FilaEquipo lado={juego.away} gano={juego.winner === juego.away.code} perdio={perdio(juego.away.code)} temporada={juego.season_id} />
        <FilaEquipo lado={juego.home} gano={juego.winner === juego.home.code} perdio={perdio(juego.home.code)} temporada={juego.season_id} />
      </div>
      {href && (
        <Link href={href} className="block px-4 pb-3 font-cond text-[15px] tracking-[0.04em] text-fg hover:underline">
          Ver el juego ›
        </Link>
      )}
    </article>
  );
}

// ── Las figuras ────────────────────────────────────────────────────────────

export function Figuras({ figuras }: { figuras: FiguraJornada[] }) {
  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      {figuras.map((f) => (
        <Link
          key={`${f.kind}-${f.player_id}`}
          href={`/players/${f.player_id}`}
          className="tocable group flex min-h-[120px] flex-col gap-1 rounded-xl border border-line bg-card p-3 hover:border-fg2"
        >
          <span className="mb-1 flex items-center gap-2">
            <TeamBadge code={f.team_code} size="sm" />
            <span className="text-[11px] uppercase tracking-[0.08em] text-dim">
              {f.kind === "batting" ? "Bateo" : "Pitcheo"}
            </span>
          </span>
          <span className="text-[15px] font-bold leading-snug text-fg group-hover:underline">{f.full_name}</span>
          <span className="num text-[13px] text-fg">{f.line}</span>
          <span className="text-[11px] text-dim">vs {TEAM_SHORT_NAMES[f.opponent] ?? f.opponent}</span>
        </Link>
      ))}
    </div>
  );
}

// ── Lo que viene ───────────────────────────────────────────────────────────

export function Proximos({ juegos }: { juegos: JuegoJornada[] }) {
  return (
    <ul className="overflow-hidden rounded-xl border border-line bg-card">
      {juegos.map((j) => {
        const jugado = j.status === "final";
        return (
          <li key={j.game_id} className="flex min-h-14 items-center gap-3 border-b border-line-soft px-4 last:border-0">
            <span className="flex items-center gap-2">
              <TeamBadge code={j.away.code} size="sm" />
              <span className="text-xs text-dim">en</span>
              <TeamBadge code={j.home.code} size="sm" />
            </span>
            <span className="min-w-0 flex-1 text-right">
              <span className="num block text-sm font-semibold text-fg">
                {jugado ? `${j.away.runs}-${j.home.runs} · ${j.status_label}` : j.status_label}
              </span>
              {j.venue && <span className="block truncate text-[11px] text-dim">{j.venue}</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
