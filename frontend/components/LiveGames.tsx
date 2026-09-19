"use client";

import { useEffect, useRef, useState } from "react";
import { fetchLiveGames, liveStreamUrl } from "@/lib/api";
import { LiveGameState } from "@/lib/types";
import LiveScoreboard from "@/components/LiveScoreboard";

/* Si un juego en curso pasa esto sin recibir eventos, se marca "sin señal".
   El poller sondea cada 10 s, así que 45 s es tres ciclos perdidos: ya no es
   una pausa normal entre lanzamientos. */
const STALE_MS = 45_000;

interface Entry {
  state: LiveGameState;
  receivedAt: number;
}

export default function LiveGames() {
  const [games, setGames] = useState<Record<number, Entry>>({});
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const sources = useRef<Map<number, EventSource>>(new Map());

  /* Un tic de reloj solo para recalcular la antigüedad; no toca los datos. */
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const open = sources.current;

    function subscribe(gamePk: number) {
      if (open.has(gamePk)) return;

      const es = new EventSource(liveStreamUrl(gamePk));
      open.set(gamePk, es);

      es.addEventListener("state", (ev) => {
        const state = JSON.parse((ev as MessageEvent).data) as LiveGameState;
        setGames((prev) => ({
          ...prev,
          [gamePk]: { state, receivedAt: Date.now() },
        }));
      });

      /* El servidor cierra el flujo al terminar el juego. Sin este close(),
         EventSource reconectaría solo y volvería a recibir el mismo par de
         eventos una y otra vez. */
      es.addEventListener("final", () => {
        es.close();
        open.delete(gamePk);
      });
    }

    (async () => {
      const initial = await fetchLiveGames();
      if (cancelled) return;

      const seeded: Record<number, Entry> = {};
      for (const state of initial) {
        seeded[state.game_pk] = { state, receivedAt: Date.now() };
      }
      setGames(seeded);
      setLoading(false);

      /* Solo se abre flujo para los que aún pueden cambiar. Un juego terminado
         ya tiene su estado definitivo y no necesita conexión. */
      for (const state of initial) {
        if (state.status !== "final") subscribe(state.game_pk);
      }
    })();

    return () => {
      cancelled = true;
      open.forEach((es) => es.close());
      open.clear();
    };
  }, []);

  if (loading) {
    return (
      <div className="space-y-3">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="h-28 bg-card border border-line rounded-lg animate-pulse"
          />
        ))}
      </div>
    );
  }

  const entries = Object.values(games).sort((a, b) => {
    const rank = (s: LiveGameState) =>
      s.status === "live" ? 0 : s.status === "preview" ? 1 : 2;
    return rank(a.state) - rank(b.state) || a.state.game_pk - b.state.game_pk;
  });

  if (!entries.length) {
    return (
      <div className="bg-card border border-line rounded-lg px-6 py-10 text-center">
        <p className="text-3xl mb-3">⚾</p>
        <p className="text-sm text-fg2 mb-1">
          No hay juegos en seguimiento
        </p>
        <p className="text-xs text-dim mb-5 max-w-md mx-auto">
          La temporada de LIDOM va de octubre a enero. Fuera de temporada
          puedes reproducir un juego terminado: el marcador recibe exactamente
          los mismos eventos que recibirá en vivo.
        </p>
        <pre className="text-[11px] text-left inline-block bg-bg border border-line rounded px-4 py-3 text-dim leading-relaxed">
          <code>
            set LIDOM_LIVE_POLLER=1{"\n"}
            set LIDOM_LIVE_REPLAY=826343{"\n"}
            python -m uvicorn api.main:app
          </code>
        </pre>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {entries.map(({ state, receivedAt }) => (
        <LiveScoreboard
          key={state.game_pk}
          state={state}
          stale={state.status === "live" && now - receivedAt > STALE_MS}
        />
      ))}
    </div>
  );
}
