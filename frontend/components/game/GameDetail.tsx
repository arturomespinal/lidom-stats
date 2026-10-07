"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { fetchGameDetail, fetchWinProb } from "@/lib/api";
import { LiveGameDetail, LiveSituation, WinProbResponse } from "@/lib/types";
import TeamBadge from "@/components/TeamBadge";
import StatusBadge from "@/components/StatusBadge";
import PlayByPlay from "@/components/game/PlayByPlay";
import InningGrid from "@/components/game/InningGrid";
import BoxScore from "@/components/game/BoxScore";
import Lineups from "@/components/game/Lineups";
import WinProbBand from "@/components/game/WinProbBand";
import Situacion, { jugadaDestacada } from "@/components/game/Situacion";
import JugadasClave from "@/components/game/JugadasClave";
import Comparativa from "@/components/game/Comparativa";
import Heroe from "@/components/ficha/Heroe";
import { TEAM_SHORT_NAMES } from "@/lib/constants";

/**
 * Detalle de un juego en la web.
 *
 * Sondea en vez de abrir SSE como el listado: el flujo `/stream` emite el
 * marcador reducido, no el detalle, y montar un segundo canal solo para esta
 * pantalla no compensa. Un sondeo cada doce segundos sobre una caché en
 * memoria no le cuesta nada al backend.
 *
 * Para cuando el backend responde `is_updating: false`: el juego terminó y el
 * detalle está congelado, así que seguir pidiéndolo es tráfico por nada.
 */

const POLL_MS = 12_000;
const PLAYS = 40;

const TABS = [
  { key: "relato", label: "Relato" },
  { key: "boxscore", label: "Boxscore" },
  { key: "alineacion", label: "Alineación" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function GameDetail({ gamePk, season }: { gamePk: number; season: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  // La pestaña vive en la URL, no en estado: así un enlace al boxscore de un
  // juego abre en el boxscore, y el botón de atrás del navegador funciona.
  const raw = params.get("t");
  const tab: TabKey = TABS.some((t) => t.key === raw) ? (raw as TabKey) : "relato";

  const [detail, setDetail] = useState<LiveGameDetail | null>(null);
  const [wp, setWp] = useState<WinProbResponse | null>(null);
  const [situacion, setSituacion] = useState<LiveSituation | null>(null);
  const [updating, setUpdating] = useState(true);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setTab = useCallback(
    (key: TabKey) => {
      const next = new URLSearchParams(params.toString());
      if (key === "relato") next.delete("t");
      else next.set("t", key);
      const qs = next.toString();
      // scroll: false — cambiar de pestaña no debe saltar al tope de la página.
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router]
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      // El recorrido va en el MISMO ciclo que el detalle, en paralelo: un solo
      // ritmo de sondeo. Dos bucles independientes acabarían desfasados y la
      // curva podría mostrar una carrera que el marcador todavía no tiene.
      const [res, prob] = await Promise.all([
        fetchGameDetail(gamePk, PLAYS),
        fetchWinProb(gamePk),
      ]);
      if (cancelled) return;

      // Un fallo del recorrido no toca lo que ya se mostraba, igual que el
      // detalle: se queda la última curva buena.
      if (prob) setWp(prob);

      if (res) {
        setDetail(res.data);
        setSituacion(res.situation ?? null);
        setUpdating(res.is_updating);
        setFailed(false);
      } else {
        // Un fallo de red no borra lo que ya se mostraba: mejor un dato de
        // hace doce segundos que una pantalla en blanco.
        setFailed(true);
      }
      setLoading(false);

      if (res?.is_updating !== false) {
        timer.current = setTimeout(load, POLL_MS);
      }
    }

    load();
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [gamePk]);

  const volver = (
    <Link
      href={`/live?season=${season}`}
      className="inline-flex min-h-[44px] items-center gap-1 text-xs text-ink-dim transition-colors hover:text-ink-fg"
    >
      <span aria-hidden>←</span> En Vivo
    </Link>
  );

  if (loading) {
    // Esqueleto con la forma de la página: la franja navy ya está donde va a
    // estar, y el contenido no salta al llegar.
    return (
      <>
        <Heroe>
          {volver}
          <div className="h-[132px]" aria-label="Cargando el juego" />
        </Heroe>
        <div className="mx-auto max-w-5xl space-y-3 px-4 pb-10">
          <div className="h-40 animate-pulse rounded-xl border border-line bg-card" />
          <div className="h-64 animate-pulse rounded-lg border border-line bg-card" />
        </div>
      </>
    );
  }

  if (!detail) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="rounded-lg border border-line bg-card px-6 py-10 text-center">
          <p className="mb-1 text-sm text-fg2">No se pudo cargar el juego</p>
          <p className="text-xs text-dim">
            {process.env.NODE_ENV === "development"
              ? `El juego #${gamePk} no está en seguimiento, o el backend no responde.`
              : "Revisa tu conexión e intenta de nuevo."}
          </p>
          <Link href="/live" className="mt-4 inline-block text-xs text-dim underline hover:text-fg">
            Volver a En Vivo
          </Link>
        </div>
      </main>
    );
  }

  const terminado = detail.status === "final";
  // La línea de contexto junto al estado. En vivo, la media entrada del
  // estado vivo ("Alta del 8vo", o "Fin de la alta del 7mo" entre medias). La
  // del último punto de la curva queda de respaldo: no se mueve si la
  // probabilidad no cambia, y decía "Baja del 7mo" con Ohtani bateando en la
  // alta del 8vo.
  const ultimo = wp?.points[wp.points.length - 1];
  const contexto = failed
    ? "Sin señal · último dato recibido"
    : terminado && !updating
      ? "Resultado definitivo"
      : detail.status === "live"
        ? (situacion?.half_over_label ?? situacion?.half_label ?? ultimo?.label ?? null)
        : null;
  const ganaVisita = terminado && detail.away.runs > detail.home.runs;
  const ganaLocal = terminado && detail.home.runs > detail.away.runs;

  return (
    <>
      {/* La cabecera: la franja navy de las fichas, sin el plano de color. Un
          juego es de dos clubes; cada uno se identifica con su teja. */}
      <Heroe>
        {volver}
        {/* Compacta (6-oct, captura de SofaScore): los dos equipos a los
            lados y el marcador al centro, con el estado arriba. */}
        <div className="mx-auto max-w-xl">
          <div className="mb-3 mt-1 flex items-center justify-center gap-2">
            <StatusBadge status={detail.status} />
            {contexto && (
              <span className={`truncate text-xs ${failed ? "text-ink-fg" : "text-ink-dim"}`}>
                {contexto}
              </span>
            )}
          </div>
          <div className="flex items-center">
            <LadoHeroe lado={detail.away} />
            <div
              className="flex items-center gap-1.5"
              aria-label={`${detail.away.team_code ?? "Visitante"} ${detail.away.runs}, ${detail.home.team_code ?? "Local"} ${detail.home.runs}${
                ganaVisita ? `. Ganó ${detail.away.team_code}` : ganaLocal ? `. Ganó ${detail.home.team_code}` : ""
              }`}
              role="group"
            >
              {/* El ganador lleva la marca escrita, apuntando a su lado: el
                  tono solo no basta. */}
              <span aria-hidden className="w-3 text-sm text-ink-fg">{ganaVisita ? "◂" : ""}</span>
              <span
                aria-hidden
                className={`num min-w-[32px] text-center font-cond text-[56px] leading-none sm:text-[64px] ${
                  detail.away.runs < detail.home.runs ? "text-ink-dim" : "text-ink-fg"
                }`}
              >
                {detail.away.runs}
              </span>
              <span aria-hidden className="font-cond text-[36px] leading-none text-ink-dim">–</span>
              <span
                aria-hidden
                className={`num min-w-[32px] text-center font-cond text-[56px] leading-none sm:text-[64px] ${
                  detail.home.runs < detail.away.runs ? "text-ink-dim" : "text-ink-fg"
                }`}
              >
                {detail.home.runs}
              </span>
              <span aria-hidden className="w-3 text-sm text-ink-fg">{ganaLocal ? "▸" : ""}</span>
            </div>
            <LadoHeroe lado={detail.home} />
          </div>
        </div>
      </Heroe>

      {/* pb-24 en el teléfono: las pestañas van fijas al pie y no deben tapar
          la última fila. */}
      <main className="mx-auto max-w-5xl space-y-4 px-4 pb-24 sm:pb-10">
        {/* Lo que está pasando ahora: bases, outs, cuenta, bateador y
            lanzador, y la última jugada cuando es un batazo o un ponche.
            Solo con el juego en curso. */}
        {situacion && detail.status === "live" && (
          <Situacion
            situacion={situacion}
            jugada={jugadaDestacada(detail.plays)}
            turno={detail.at_bat}
            duelo={detail.matchup}
          />
        )}

        {/* La línea por entradas, a la vista: antes era una pestaña. En la
            previa no hay entradas y no se pinta. */}
        {detail.innings.length > 0 && (
          <section aria-label="Línea por entradas" className="overflow-hidden rounded-xl border border-line bg-card">
            <InningGrid detail={detail} />
          </section>
        )}

        {/* La franja. Necesita al menos dos puntos para ser una curva; en la
            previa no hay estado que simular y no se pinta nada. */}
        {/* La franja con sus jugadas clave y, al lado en pantalla ancha, el
            equipo contra equipo. */}
        {/* grid-cols-1: sin una columna explícita, la del teléfono toma el
            ancho del contenido y las tarjetas se salen por la derecha. */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
          {wp && wp.points.length >= 2 && detail.home.team_code && detail.away.team_code && (
            <section className="rounded-xl border border-line bg-card px-4 pb-3">
              <WinProbBand
                points={wp.points}
                current={wp.current}
                homeCode={detail.home.team_code}
                awayCode={detail.away.team_code}
                headline={wp.headline}
                entradaActual={situacion?.inning ?? null}
              />
              <JugadasClave
                jugadas={wp.key_plays ?? []}
                awayCode={detail.away.team_code}
                homeCode={detail.home.team_code}
              />
            </section>
          )}
          <Comparativa away={detail.away} home={detail.home} />
        </div>

        <article className="overflow-hidden rounded-lg border border-line bg-card">
          <PestanasJuego activa={tab} onCambio={setTab} />
          {/* key={tab}: cada pestaña entra con su fundido (.aparecer). */}
          <div key={tab} className="aparecer">
            {tab === "relato" && <PlayByPlay detail={detail} />}
            {tab === "boxscore" && <BoxScore home={detail.home} away={detail.away} />}
            {tab === "alineacion" && <Lineups home={detail.home} away={detail.away} />}
          </div>
        </article>
      </main>
    </>
  );
}

/**
 * Las pestañas del juego.
 *
 * ── En el teléfono van al pie ───────────────────────────────────────────────
 * Fijas abajo, repartiendo el ancho: zona del pulgar (reglas de diseño
 * móvil, punto 1), igual que en la app. Desde `sm` vuelven arriba del
 * contenido, dentro de la tarjeta: con ratón no hay pulgar que cuidar.
 *
 * ── La raya se desliza ──────────────────────────────────────────────────────
 * Una sola raya que viaja a la pestaña elegida. Se mide el botón activo
 * (offsetLeft/offsetWidth) al cambiar de pestaña y al cambiar el ancho de la
 * ventana; la primera vez se coloca sin transición para que no entre volando.
 * Con "reducir movimiento" salta (motion-reduce).
 */
function PestanasJuego({ activa, onCambio }: { activa: TabKey; onCambio: (k: TabKey) => void }) {
  const refs = useRef<Partial<Record<TabKey, HTMLButtonElement | null>>>({});
  const [raya, setRaya] = useState<{ left: number; width: number } | null>(null);
  const [animar, setAnimar] = useState(false);

  useLayoutEffect(() => {
    const medir = () => {
      const b = refs.current[activa];
      if (b) setRaya({ left: b.offsetLeft, width: b.offsetWidth });
    };
    medir();
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, [activa]);

  // Se enciende la transición DESPUÉS de la primera colocación.
  useEffect(() => {
    if (raya && !animar) {
      const id = requestAnimationFrame(() => setAnimar(true));
      return () => cancelAnimationFrame(id);
    }
  }, [raya, animar]);

  return (
    <nav
      aria-label="Secciones del juego"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card pb-[env(safe-area-inset-bottom)] sm:static sm:border-b sm:border-t-0 sm:pb-0"
    >
      <div className="relative flex sm:px-2">
        {TABS.map((t) => {
          const on = t.key === activa;
          return (
            <button
              key={t.key}
              ref={(el) => {
                refs.current[t.key] = el;
              }}
              type="button"
              onClick={() => onCambio(t.key)}
              aria-pressed={on}
              className={`min-h-[48px] flex-1 whitespace-nowrap px-3 text-[13px] font-semibold transition-colors sm:min-h-[44px] sm:flex-none ${
                on ? "text-fg" : "text-dim hover:text-fg"
              }`}
            >
              {t.label}
            </button>
          );
        })}
        {raya && (
          <span
            aria-hidden="true"
            className={`pointer-events-none absolute top-0 h-0.5 bg-accent sm:bottom-0 sm:top-auto ${
              animar ? "transition-[left,width] duration-200 ease-out motion-reduce:transition-none" : ""
            }`}
            style={{ left: raya.left, width: raya.width }}
          />
        )}
      </div>
    </nav>
  );
}

/** El nombre corto: el de LIDOM, o la última palabra ("Dodgers"). */
function nombreCorto(lado: LiveGameDetail["home"]): string {
  const code = lado.team_code;
  if (code && TEAM_SHORT_NAMES[code]) return TEAM_SHORT_NAMES[code];
  return lado.team_name?.trim().split(/\s+/).slice(-1)[0] ?? code ?? "—";
}

/**
 * Un lado del marcador en la cabecera: teja, nombre corto y H · E, en
 * columna. Teja y nombre abren el equipo (un juego en vivo es de la
 * temporada actual, la que abre la ficha sin `season`). Sin código no hay a
 * dónde ir.
 */
function LadoHeroe({ lado }: { lado: LiveGameDetail["home"] }) {
  const extra = [`H ${lado.hits}`, lado.errors != null ? `E ${lado.errors}` : null]
    .filter(Boolean)
    .join(" · ");
  const contenido = (
    <>
      <TeamBadge code={lado.team_code ?? "—"} size="md" variant="solid" />
      <span className="max-w-full truncate text-sm font-bold text-ink-fg group-hover:underline">
        {nombreCorto(lado)}
      </span>
      <span className="num text-[11px] text-ink-dim">{extra}</span>
    </>
  );
  const clase = "group flex min-w-0 flex-1 flex-col items-center gap-1 py-1";
  return lado.team_code ? (
    <Link href={`/teams/${lado.team_code}`} className={clase} aria-label={`${lado.team_name ?? lado.team_code}: ${lado.runs} carreras, ${lado.hits} hits`}>
      {contenido}
    </Link>
  ) : (
    <div className={clase}>{contenido}</div>
  );
}
