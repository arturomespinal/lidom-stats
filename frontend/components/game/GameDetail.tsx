"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { fetchGameDetail, fetchWinProb } from "@/lib/api";
import { LiveGameDetail, WinProbResponse } from "@/lib/types";
import TeamBadge from "@/components/TeamBadge";
import StatusBadge from "@/components/StatusBadge";
import PlayByPlay from "@/components/game/PlayByPlay";
import InningGrid from "@/components/game/InningGrid";
import BoxScore from "@/components/game/BoxScore";
import Lineups from "@/components/game/Lineups";
import WinProbBand from "@/components/game/WinProbBand";
import Heroe from "@/components/ficha/Heroe";

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
  { key: "entradas", label: "Entradas" },
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
            El juego #{gamePk} no está en seguimiento, o el backend no responde.
          </p>
          <Link href="/live" className="mt-4 inline-block text-xs text-dim underline hover:text-fg">
            Volver a En Vivo
          </Link>
        </div>
      </main>
    );
  }

  const terminado = detail.status === "final";
  // La línea de contexto junto al estado. En vivo, la media entrada del último
  // punto del recorrido ("Baja del 7mo"), compuesta en el backend.
  const ultimo = wp?.points[wp.points.length - 1];
  const contexto = failed
    ? "Sin señal · último dato recibido"
    : terminado && !updating
      ? "Resultado definitivo"
      : detail.status === "live" && ultimo
        ? ultimo.label
        : null;

  return (
    <>
      {/* La cabecera: la franja navy de las fichas, sin el plano de color. Un
          juego es de dos clubes; cada uno se identifica con su teja. */}
      <Heroe>
        {volver}
        <div className="mb-4 mt-1 flex items-center gap-2">
          <StatusBadge status={detail.status} />
          {contexto && (
            <span className={`truncate text-xs ${failed ? "text-ink-fg" : "text-ink-dim"}`}>
              {contexto}
            </span>
          )}
        </div>
        <div className="max-w-xl space-y-2">
          <FilaHeroe lado={detail.away} rival={detail.home} terminado={terminado} />
          <FilaHeroe lado={detail.home} rival={detail.away} terminado={terminado} />
        </div>
      </Heroe>

      {/* pb-24 en el teléfono: las pestañas van fijas al pie y no deben tapar
          la última fila. */}
      <main className="mx-auto max-w-5xl space-y-4 px-4 pb-24 sm:pb-10">
        {/* La franja. Necesita al menos dos puntos para ser una curva; en la
            previa no hay estado que simular y no se pinta nada. */}
        {wp && wp.points.length >= 2 && detail.home.team_code && detail.away.team_code && (
          <section className="max-w-2xl rounded-xl border border-line bg-card px-4 pb-3">
            <WinProbBand
              points={wp.points}
              current={wp.current}
              homeCode={detail.home.team_code}
              awayCode={detail.away.team_code}
              headline={wp.headline}
            />
          </section>
        )}

        <article className="overflow-hidden rounded-lg border border-line bg-card">
          <PestanasJuego activa={tab} onCambio={setTab} />
          {/* key={tab}: cada pestaña entra con su fundido (.aparecer). */}
          <div key={tab} className="aparecer">
            {tab === "relato" && <PlayByPlay detail={detail} />}
            {tab === "entradas" && <InningGrid detail={detail} />}
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

/**
 * Una fila del marcador en la cabecera: teja, nombre, hits y errores,
 * carreras. Quien va abajo se apaga a `ink-dim` (8.3:1 sobre el navy: se
 * sigue leyendo), y el ganador de un juego terminado lleva la marca ◂ escrita:
 * el tono solo no basta.
 */
function FilaHeroe({
  lado,
  rival,
  terminado,
}: {
  lado: LiveGameDetail["home"];
  rival: LiveGameDetail["home"];
  terminado: boolean;
}) {
  const atras = lado.runs < rival.runs;
  const gano = terminado && lado.runs > rival.runs;
  const extra = [`H ${lado.hits}`, lado.errors != null ? `E ${lado.errors}` : null]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="flex min-h-[56px] items-center gap-3">
      {/* Teja y nombre abren el equipo. Un juego en vivo es de la temporada
          actual, que es la que abre la ficha sin `season`. Sin código (no
          pasa en LIDOM, pero el tipo lo permite) no hay a dónde ir. */}
      {lado.team_code ? (
      <Link href={`/teams/${lado.team_code}`} className="group flex min-w-0 flex-1 items-center gap-3">
        <TeamBadge code={lado.team_code ?? "—"} size="md" variant="solid" />
        <div className="min-w-0 flex-1">
          <p
            className={`truncate text-base font-bold group-hover:underline sm:text-lg ${
              atras ? "text-ink-dim" : "text-ink-fg"
            }`}
          >
            {lado.team_name ?? lado.team_code ?? "—"}
          </p>
          <p className="num text-xs text-ink-dim">{extra}</p>
        </div>
      </Link>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <TeamBadge code="—" size="md" variant="solid" />
          <p className="truncate text-base font-bold text-ink-fg sm:text-lg">{lado.team_name ?? "—"}</p>
        </div>
      )}
      <p
        className={`num min-w-[40px] text-right font-cond text-[56px] leading-none sm:text-[64px] ${
          atras ? "text-ink-dim" : "text-ink-fg"
        }`}
      >
        {lado.runs}
      </p>
      <span className="w-3 text-sm text-ink-fg" aria-label={gano ? "ganó" : undefined}>
        {gano ? "◂" : ""}
      </span>
    </div>
  );
}
