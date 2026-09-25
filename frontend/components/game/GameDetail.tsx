"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

export default function GameDetail({ gamePk }: { gamePk: number }) {
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

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-24 animate-pulse rounded-lg border border-line bg-card" />
        <div className="h-64 animate-pulse rounded-lg border border-line bg-card" />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="rounded-lg border border-line bg-card px-6 py-10 text-center">
        <p className="mb-1 text-sm text-fg2">No se pudo cargar el juego</p>
        <p className="text-xs text-dim">
          El juego #{gamePk} no está en seguimiento, o el backend no responde.
        </p>
        <Link
          href="/live"
          className="mt-4 inline-block text-xs text-dim underline hover:text-fg"
        >
          Volver a En Vivo
        </Link>
      </div>
    );
  }

  const awayWin = detail.away.runs > detail.home.runs;
  const homeWin = detail.home.runs > detail.away.runs;

  return (
    <article className="overflow-hidden rounded-lg border border-line bg-card">
      <header className="border-b border-line px-4 py-3">
        <div className="mb-3 flex items-center gap-2">
          <StatusBadge status={detail.status} />
          {failed && <span className="text-[10px] text-warn">sin señal</span>}
          {!updating && detail.status === "final" && (
            <span className="text-[10px] text-dim">resultado definitivo</span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <TeamSide
            code={detail.away.team_code}
            name={detail.away.team_name}
            runs={detail.away.runs}
            winning={awayWin}
          />
          <span className="text-line">—</span>
          <TeamSide
            code={detail.home.team_code}
            name={detail.home.team_name}
            runs={detail.home.runs}
            winning={homeWin}
            reverse
          />
        </div>

        {/* La franja. Necesita al menos dos puntos para ser una curva; en la
            previa no hay estado que simular y no se pinta nada. */}
        {wp && wp.points.length >= 2 && detail.home.team_code && detail.away.team_code && (
          <WinProbBand
            points={wp.points}
            current={wp.current}
            homeCode={detail.home.team_code}
            awayCode={detail.away.team_code}
            headline={wp.headline}
          />
        )}
      </header>

      <nav
        // gap y padding ajustados para que las CUATRO quepan en ancho de
        // teléfono: con gap-1.5 y px-3.5 "Alineación" se salía por el borde.
        className="flex gap-1 overflow-x-auto bg-header px-2.5 py-2"
        aria-label="Secciones del juego"
      >
        {TABS.map((t) => {
          const on = t.key === tab;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              aria-pressed={on}
              className={`whitespace-nowrap rounded-full border px-3 py-1 text-[13px] font-semibold transition-colors ${
                on
                  ? "border-accent bg-accent text-accent-on"
                  : "border-line bg-card text-dim hover:text-fg"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </nav>

      <div>
        {tab === "relato" && <PlayByPlay detail={detail} />}
        {tab === "entradas" && <InningGrid detail={detail} />}
        {tab === "boxscore" && <BoxScore home={detail.home} away={detail.away} />}
        {tab === "alineacion" && <Lineups home={detail.home} away={detail.away} />}
      </div>
    </article>
  );
}

function TeamSide({
  code,
  name,
  runs,
  winning,
  reverse,
}: {
  code: string | null;
  name: string | null;
  runs: number;
  winning: boolean;
  reverse?: boolean;
}) {
  return (
    <div
      className={`flex min-w-0 flex-1 items-center gap-2.5 ${
        reverse ? "flex-row-reverse" : ""
      }`}
    >
      <TeamBadge code={code ?? "—"} size="md" />
      <div className={`min-w-0 flex-1 ${reverse ? "text-right" : ""}`}>
        <p className="truncate text-xs text-dim">{name ?? "—"}</p>
        <p
          className={`text-2xl font-bold leading-tight tabular-nums ${
            winning ? "text-fg" : "text-fg2"
          }`}
        >
          {runs}
        </p>
      </div>
    </div>
  );
}
